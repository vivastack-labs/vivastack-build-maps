'use strict';
const path = require('path');
const { spawnSync } = require('child_process');
const { gitInvocations } = require('../lib/git-command');

// git commit・git push の前に、これから入れる・送る内容だけを gitleaks で検査する。
// 作業ツリー全体の検査（detect --no-git）は node_modules・geo/downloads を含めて数分かかり、
// hook の制限時間（10秒）で必ず打ち切られて、何も検査しないまま毎回10秒待たせていた。
// 全履歴の検査は CI（.github/workflows/ci.yml の gitleaks）が行う。
// 見ないもの：同じコマンドで git add する、まだ追跡していないファイル（ステージされるのは hook の後）。

/** すべての検査を合わせた上限。hook の timeout（settings.json の 10 秒）より短くして、打ち切りを自分で扱う */
const SCAN_BUDGET_MS = 8000;
/**
 * push で送りうるコミット：ローカルのすべての ref のうち、どのリモートにもまだないコミット。
 * HEAD だけにすると、git push origin <別のブランチ>・--all・--tags で送るコミットを見落とす。
 */
const UNPUSHED_LOG_OPTS = '--log-opts=--all --not --remotes';

/**
 * コマンドに含まれる git commit・git push から、実行する gitleaks の引数の一覧を作る。
 * commit：ステージした差分と、まだステージしていない差分（commit -a の分）。push：まだ push していないコミット。
 * @param {string} command Bash のコマンド
 * @param {string} configPath .gitleaks.toml の絶対パス
 * @returns {string[][]}
 */
function scanCommands(command, configPath) {
  const subcommands = new Set(gitInvocations(command).map(call => call.subcommand));
  const common = ['--no-banner', '--redact', '-s', '.', '-c', configPath];
  const scans = [];
  if (subcommands.has('commit')) {
    scans.push(['protect', '--staged', ...common], ['protect', ...common]);
  }
  if (subcommands.has('push')) {
    scans.push(['detect', UNPUSHED_LOG_OPTS, ...common]);
  }
  return scans;
}

function projectRoot(input) {
  return process.env.CLAUDE_PROJECT_DIR || input?.cwd || process.cwd();
}

/** 検査を1つ実行し、'leak'・'clean'・'skipped' のどれかを返す（検査できないときは警告して通す） */
function runScan(args, root, timeout, _spawn) {
  const result = _spawn('gitleaks', args, { cwd: root, encoding: 'utf8', stdio: 'pipe', timeout });
  if (result.error) {
    const reason = result.error.code === 'ENOENT' ? 'gitleaks not found' : `gitleaks failed (${result.error.code || result.error.message})`;
    process.stderr.write(`[VCW] ${reason}, skipping secret scan (${args[0]})\n`);
    return 'skipped';
  }
  // Treat unknown-flag errors (e.g. unsupported CLI flags) as non-blocking
  if (result.stderr && result.stderr.includes('unknown flag')) {
    process.stderr.write('[VCW] gitleaks flag incompatibility, skipping secret scan\n');
    return 'skipped';
  }
  return result.status === 0 ? 'clean' : 'leak';
}

/** シェルに貼れるように、引数を単一引用符で囲む（空白を含む --log-opts・設定ファイルのパスのため） */
function shellQuote(arg) {
  return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replace(/'/g, `'\\''`)}'`;
}

/**
 * block の理由。詳細を見るコマンドは --redact を残す（秘密を平文で transcript に出さない。場所は -v で分かる）
 */
function blockReason(args) {
  return [
    '[VCW] gitleaks detected potential secrets in the changes being committed or pushed.',
    `Review and remove secrets before committing. Re-run to see where (secrets stay redacted): gitleaks ${[...args, '-v'].map(shellQuote).join(' ')}`
  ].join('\n');
}

async function run(input, _spawn = spawnSync, _now = Date.now) {
  const root = projectRoot(input);
  const scans = scanCommands(input?.tool_input?.command || '', path.join(root, '.gitleaks.toml'));
  const deadline = _now() + SCAN_BUDGET_MS;
  for (const args of scans) {
    const remaining = deadline - _now();
    if (remaining <= 0) {
      process.stderr.write(`[VCW] gitleaks time budget exhausted, skipping secret scan (${args[0]})\n`);
      continue;
    }
    if (runScan(args, root, remaining, _spawn) === 'leak') {
      return { decision: 'block', reason: blockReason(args) };
    }
  }
  return null;
}

module.exports = { run, scanCommands };
