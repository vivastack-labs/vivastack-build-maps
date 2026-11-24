'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { gitInvocations, commitTakesWorkingTree } = require('../lib/git-command');

// git commit・git push の前に、これから入れる・送る内容だけを gitleaks で検査する。
// 作業ツリー全体の検査（detect --no-git）は、node_modules や大きなデータを持つプロジェクトでは数分かかり、
// hook の制限時間（10秒）で必ず打ち切られて、何も検査しないまま毎回10秒待たせていた。
// 全履歴の検査は、各プロジェクトの CI で行う。

/**
 * 漏洩を見つけたときの終了コード。既定の 1 は設定の読み込みエラーなどと区別できず、
 * 秘密がないのに「漏洩あり」で止めてしまうため、専用の値にする
 */
const LEAK_EXIT_CODE = 77;

/** すべての検査を合わせた上限。hook の timeout（settings.json の 10 秒）より短くして、打ち切りを自分で扱う */
const SCAN_BUDGET_MS = 8000;
/**
 * push で送りうるコミット：ローカルのすべての ref のうち、どのリモートにもまだないコミット。
 * HEAD だけにすると、git push origin <別のブランチ>・--all・--tags で送るコミットを見落とす。
 */
const UNPUSHED_LOG_OPTS = '--log-opts=--all --not --remotes';

/** hook が動かす git に付ける設定。リポジトリの core.fsmonitor に書かれたコマンドを、hook の中で動かさない */
const GIT_SAFE_ARGS = ['-c', 'core.fsmonitor=false'];
/**
 * gitleaks が中で動かす git にも同じ設定を効かせる環境変数（コマンドの範囲の設定。git 2.31 以降。リポジトリの設定より優先される）
 */
const GIT_SAFE_ENV = { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_CONFIG_VALUE_0: 'false' };

/**
 * @typedef {object} ForceAdd
 * @property {string | null} dir その git add を実行する場所（cd・git -C の行き先。null なら元の場所）
 * @property {string[]} paths 名指ししたパス
 */

/**
 * @typedef {object} Scan
 * @property {string[]} args gitleaks の引数
 * @property {boolean} withWorkingTree true なら、git add -A をした一時のインデックスに対して実行する
 * @property {ForceAdd[]} [forceAdds] 一時のインデックスに、さらに git add -f で入れるパス
 */

/**
 * commit より前の git add -f（--force）が名指しするパス。.gitignore で無視していても入るので、git add -A では入らない分。
 * git add の短いオプションは値を取らないので、まとまり（-fv）の中の f も force とみなす。--pathspec-from-file のパスは見ない
 * @param {import('../lib/git-command').GitInvocation[]} calls
 * @returns {ForceAdd[]}
 */
function forceAddedPaths(calls) {
  const lastCommit = calls.map(call => call.subcommand).lastIndexOf('commit');
  return calls.slice(0, Math.max(lastCommit, 0)).flatMap(call => {
    if (call.subcommand !== 'add') return [];
    const dashDash = call.args.indexOf('--');
    const options = (dashDash === -1 ? call.args : call.args.slice(0, dashDash)).filter(arg => arg.startsWith('-'));
    const hasShort = letter => options.some(arg => new RegExp(`^-[A-Za-z]*${letter}[A-Za-z]*$`).test(arg));
    const force = options.includes('--force') || hasShort('f');
    const paths = [
      ...(dashDash === -1 ? call.args : call.args.slice(0, dashDash)).filter(arg => arg !== '' && !arg.startsWith('-')),
      ...(dashDash === -1 ? [] : call.args.slice(dashDash + 1))
    ];
    if (!force) return [];
    if (paths.length > 0) return [{ dir: call.dir, paths }];
    // パスなしの git add -f -A（-fA・--force --all）は、作業ツリー全体の無視しているファイルも入れる（:/ はリポジトリの最上位）
    return options.includes('--all') || hasShort('A') ? [{ dir: call.dir, paths: [':/'] }] : [];
  });
}

/**
 * コマンドに含まれる git commit・git push から、実行する検査の一覧を作る。
 * commit：ステージした差分。同じコマンドで commit の前に git add などをする、または -a・パスの指定などで
 *   作業ツリーの内容もコミットするときは、git add -A をした後のインデックス（まだ追跡していないファイルを含む）。
 *   前の git add は hook の後に動くので、hook の時点の本物のインデックスには、まだ入っていない。
 * push：まだ push していないコミット。
 * @param {string} command Bash のコマンド
 * @param {string | null} configPath .gitleaks.toml の絶対パス。null なら gitleaks の既定のルールを使う
 * @returns {Scan[]}
 */
function scanCommands(command, configPath) {
  const calls = gitInvocations(command);
  const common = ['--no-banner', '--redact', '--exit-code', String(LEAK_EXIT_CODE), '-s', '.', ...(configPath ? ['-c', configPath] : [])];
  const scans = [];
  if (calls.some(call => call.subcommand === 'commit')) {
    scans.push({ args: ['protect', '--staged', ...common], withWorkingTree: commitTakesWorkingTree(calls), forceAdds: forceAddedPaths(calls) });
  }
  if (calls.some(call => call.subcommand === 'push')) {
    scans.push({ args: ['detect', UNPUSHED_LOG_OPTS, ...common], withWorkingTree: false });
  }
  return scans;
}

function projectRoot(input) {
  return process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();
}

/** プロジェクトの .gitleaks.toml。なければ null（gitleaks の既定のルールで検査する） */
function configPathOf(root) {
  const configPath = path.join(root, '.gitleaks.toml');
  return fs.existsSync(configPath) ? configPath : null;
}

/** 残り時間。使い切っていたら警告して null を返す（timeout: 0 は「無制限」になるため、呼び出さない） */
function remainingTime(deadline, _now, what) {
  const remaining = deadline - _now();
  if (remaining > 0) return remaining;
  process.stderr.write(`[VCW] gitleaks time budget exhausted, skipping secret scan (${what})\n`);
  return null;
}

/**
 * 検査を1つ実行し、'leak'・'clean'・'skipped' のどれかを返す。
 * 検査できないとき（未インストール・打ち切り・設定の読み込みエラー・未対応のオプションやコマンド）は、警告して通す
 */
function runScan(args, root, deadline, _spawn, _now, env) {
  const timeout = remainingTime(deadline, _now, args[0]);
  if (timeout === null) return 'skipped';
  const result = _spawn('gitleaks', args, { cwd: root, encoding: 'utf8', stdio: 'pipe', timeout, env: { ...(env || process.env), ...GIT_SAFE_ENV } });
  if (result.error) {
    const reason = result.error.code === 'ENOENT' ? 'gitleaks not found' : `gitleaks failed (${result.error.code || result.error.message})`;
    process.stderr.write(`[VCW] ${reason}, skipping secret scan (${args[0]})\n`);
    return 'skipped';
  }
  if (result.status === 0) return 'clean';
  if (result.status === LEAK_EXIT_CODE) return 'leak';
  process.stderr.write(`[VCW] gitleaks exited with status ${result.status} (config or CLI error), skipping secret scan (${args[0]})\n`);
  return 'skipped';
}

/**
 * 本物のインデックスを一時のファイルに写して git add -A をし、その環境変数で scan を呼ぶ。本物のインデックスは変えない。
 * git add -A は、実際にコミットするものより多いことがある（同じコマンドの git add が一部のファイルだけでも、全部を見る）。安全側の誤りとする。
 * .gitignore で無視しているファイルは git add -A では入らないので、同じコマンドの git add -f が名指ししたパスは、さらに git add -f で入れる
 * @param {ForceAdd[]} forceAdds
 * @param {(env: NodeJS.ProcessEnv) => string} scan
 */
function withTemporaryIndex(root, forceAdds, deadline, _spawn, _now, scan) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vcw-gitleaks-index-'));
  try {
    const indexFile = path.join(dir, 'index');
    const gitOptions = timeout => ({ cwd: root, encoding: 'utf8', stdio: 'pipe', timeout });

    let timeout = remainingTime(deadline, _now, 'git rev-parse');
    if (timeout === null) return 'skipped';
    const located = _spawn('git', [...GIT_SAFE_ARGS, 'rev-parse', '--git-path', 'index'], gitOptions(timeout));
    const realIndex = located.status === 0 ? (located.stdout || '').trim() : '';
    if (realIndex && fs.existsSync(path.resolve(root, realIndex))) {
      fs.copyFileSync(path.resolve(root, realIndex), indexFile);
    }

    timeout = remainingTime(deadline, _now, 'git add');
    if (timeout === null) return 'skipped';
    const env = { ...process.env, GIT_INDEX_FILE: indexFile };
    const added = _spawn('git', [...GIT_SAFE_ARGS, 'add', '-A'], { ...gitOptions(timeout), env });
    if (added.error || added.status !== 0) {
      process.stderr.write(`[VCW] git add on a temporary index failed (${added.error?.code || `status ${added.status}`}), skipping secret scan (protect)\n`);
      return 'skipped';
    }
    for (const { dir, paths } of forceAdds) {
      timeout = remainingTime(deadline, _now, 'git add -f');
      if (timeout === null) return 'skipped';
      const cwd = dir === null ? root : path.resolve(root, dir);
      const forced = _spawn('git', [...GIT_SAFE_ARGS, 'add', '-f', '--', ...paths], { ...gitOptions(timeout), cwd, env });
      // 存在しないパスなどで失敗しても、本物の git add -f も同じく失敗するので、入った分だけで検査を続ける
      if (forced.error || forced.status !== 0) {
        process.stderr.write(`[VCW] git add -f on a temporary index failed (${forced.error?.code || `status ${forced.status}`}); scanning without those paths\n`);
      }
    }
    return scan(env);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** シェルに貼れるように、引数を単一引用符で囲む（空白を含む --log-opts・設定ファイルのパスのため） */
function shellQuote(arg) {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * block の理由。詳細を見るコマンドは --redact を残す（秘密を平文で transcript に出さない。場所は -v で分かる）。
 * -s . は root を指すので、どこから貼っても同じものを検査するよう cd を付ける。
 * 一時のインデックスで見つけたときは、同じ手順（本物のインデックスを変えない）で再現するコマンドにする
 * @param {Scan} scan
 */
function blockReason(scan, root) {
  const gitleaks = `gitleaks ${[...scan.args, '-v'].map(shellQuote).join(' ')}`;
  const forced = (scan.forceAdds || [])
    .map(({ dir, paths }) => {
      const add = `GIT_INDEX_FILE="$idx" git add -f -- ${paths.map(shellQuote).join(' ')}`;
      return dir === null || dir === '.' ? ` && ${add}` : ` && (cd -- ${shellQuote(dir)} && ${add})`;
    })
    .join('');
  const rerun = scan.withWorkingTree
    ? `cd -- ${shellQuote(root)} && idx=$(mktemp) && cp "$(git rev-parse --git-path index)" "$idx" && GIT_INDEX_FILE="$idx" git add -A${forced} && GIT_INDEX_FILE="$idx" ${gitleaks}; rm -f "$idx"`
    : `cd -- ${shellQuote(root)} && ${gitleaks}`;
  const what = scan.withWorkingTree
    ? 'the changes being committed (everything `git add -A` would stage, including untracked files)'
    : 'the changes being committed or pushed';
  return [`[VCW] gitleaks detected potential secrets in ${what}.`, `Review and remove secrets before committing. Re-run to see where (secrets stay redacted): ${rerun}`].join('\n');
}

async function run(input, _spawn = spawnSync, _now = Date.now) {
  const root = projectRoot(input);
  const scans = scanCommands(input?.tool_input?.command || '', configPathOf(root));
  const deadline = _now() + SCAN_BUDGET_MS;
  for (const scan of scans) {
    const scanWith = env => runScan(scan.args, root, deadline, _spawn, _now, env);
    const outcome = scan.withWorkingTree ? withTemporaryIndex(root, scan.forceAdds, deadline, _spawn, _now, scanWith) : scanWith();
    if (outcome === 'leak') {
      return { decision: 'block', reason: blockReason(scan, root) };
    }
  }
  return null;
}

module.exports = { run, scanCommands };
