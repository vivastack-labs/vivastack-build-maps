'use strict';
const { execFileSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { gitInvocations, commitTakesWorkingTree } = require('../lib/git-command');

// セキュリティに関わる変更のコミットを止め、security-reviewer でのレビューを促す（確認の促しで、攻撃を防ぐ仕組みではない）。
// - つないだコマンドの git commit もすべて確かめる（issue #36）。push は確かめない（ステージの内容は push と関係ない）
// - 追加した行と、ファイル名（削除を含む）を見る。トップレベルの tests/・テストのファイル・Markdown・既知の生成物・ロックファイルは見ない
// - レビューの後に mark-security-reviewed.js を実行すると、そのときの HEAD とステージの内容だけを通す（どちらかが変われば、また止める）
// - 確かめられないとき（git の失敗・読めないファイル・GIT_INDEX_FILE など）は止める

// query は、DOM の querySelector(All) と Testing Library の queryBy*・queryAllBy* を除く（issue #33）。
// auth は author を除く。schema は外す（本プロジェクトに DB はなく、content/schema/ の JSON Schema に当たるため）
const PATTERNS =
  /auth(?!or(?:s|ed|ship)?\b)|login|logout|session|token|jwt|passw|credential|oauth|\.db[^a-z]|query(?!Selector|By|AllBy)|\.sql|migrat|upload|download|readFile|writeFile|createReadStream|createWriteStream|fetch\(|axios|httpClient|apiKey|api_key|ANTHROPIC_API_KEY|secret|crypto\.|encrypt|decrypt|bcrypt|hash\(/i;

const EXCLUDED_PATHS = [/^tests\//, /^\.claude\/hooks\/tests\//, /\.(test|spec)\.[cm]?[jt]sx?$/, /\.md$/, /^src\/lib\/[^/]+\.generated\.ts$/, /^pnpm-lock\.yaml$/];

/** hook が見るインデックス・リポジトリと、実際にコミットするものが違ってしまう環境変数 */
const UNSAFE_ENV = /^(GIT_INDEX_FILE|GIT_DIR|GIT_WORK_TREE|GIT_OBJECT_DIRECTORY|GIT_COMMON_DIR)=/;
/** 利用者・リポジトリの設定（色・外部 diff・textconv・属性）に左右されずに、パスと diff を読む */
const GIT_GLOBAL_ARGS = ['--literal-pathspecs', '-c', 'core.quotepath=false', '-c', 'color.ui=never'];
const DIFF_ARGS = ['--no-color', '--no-ext-diff', '--no-textconv', '--text'];
const MARKER_FILE = 'security-reviewed';
const MAX_BUFFER = 64 * 1024 * 1024;

const isExcludedPath = file => EXCLUDED_PATHS.some(pattern => pattern.test(file));

/** diff のうち、追加した行だけを返す（各ファイルの最初の `@@` より前の見出しは除く） */
function addedLines(diff) {
  const added = [];
  let isInHunk = true;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) isInHunk = false;
    else if (line.startsWith('@@')) isInHunk = true;
    else if (isInHunk && line.startsWith('+')) added.push(line);
  }
  return added.join('\n');
}

function buildFlaggedList(files, getDiff) {
  const flagged = [];
  for (const file of files) {
    if (isExcludedPath(file)) continue;
    if (PATTERNS.test(file)) {
      flagged.push(`  - ${file}  [filename]`);
      continue;
    }
    try {
      if (PATTERNS.test(addedLines(getDiff(file)))) flagged.push(`  - ${file}  [content]`);
    } catch {
      // 読めないファイルは確かめられないので、黙って通さずに載せる
      flagged.push(`  - ${file}  [読めなかった]`);
    }
  }
  return flagged;
}

/** cwd で git を実行する関数を返す */
const gitRunner = cwd => args => execFileSync('git', [...GIT_GLOBAL_ARGS, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: MAX_BUFFER });
const nulList = output => output.split('\0').filter(Boolean);

/** ステージした変更（削除したファイルは名前だけを見る） */
function stagedChanges(git) {
  return {
    files: nulList(git(['diff', '--cached', '--name-only', '-z'])),
    getDiff: file => git(['diff', '--cached', ...DIFF_ARGS, '--', file])
  };
}

/** ステージした変更・まだステージしていない変更・追跡していないファイル（同じコマンドでインデックスを変えるとき） */
function workingTreeChanges(git, root) {
  // 末尾が / のものは、追跡していない別のリポジトリ（git add しても中身は入らない）
  const untracked = new Set(nulList(git(['ls-files', '--others', '--exclude-standard', '-z'])).filter(file => !file.endsWith('/')));
  const tracked = [...nulList(git(['diff', '--cached', '--name-only', '-z'])), ...nulList(git(['diff', '--name-only', '-z']))];
  const readAsAdded = file => {
    const full = path.join(root, file);
    // シンボリックリンクは、git がリンク先のパスを中身として入れる
    const content = fs.lstatSync(full).isSymbolicLink() ? fs.readlinkSync(full) : fs.readFileSync(full, 'utf8');
    return content
      .split('\n')
      .map(line => `+${line}`)
      .join('\n');
  };
  return {
    files: [...new Set([...tracked, ...untracked])],
    getDiff: file => (untracked.has(file) ? readAsAdded(file) : git(['diff', '--cached', ...DIFF_ARGS, '--', file]) + git(['diff', ...DIFF_ARGS, '--', file]))
  };
}

/** HEAD とステージの内容の指紋。HEAD が動けば（コミットの後など）変わる */
function fingerprint(git) {
  let head;
  try {
    head = git(['rev-parse', '--verify', '--quiet', 'HEAD']).trim();
  } catch {
    // まだコミットがないリポジトリ
    head = 'no-head';
  }
  const staged = git(['diff', '--cached', '--binary', '--no-color', '--no-ext-diff', '--no-textconv']);
  return crypto.createHash('sha256').update(`${head}\n${staged}`).digest('hex');
}

const markerPath = (git, root) => path.resolve(root, git(['rev-parse', '--git-path', MARKER_FILE]).trim());

/** git を実行するディレクトリから、リポジトリのルートで git を実行する関数とルートを返す */
function repoAt(dir) {
  const root = gitRunner(dir)(['rev-parse', '--show-toplevel']).trim();
  return { git: gitRunner(root), root };
}

/**
 * ディレクトリがない・リポジトリの外なら false（hook の時点ではまだないディレクトリもある）。
 * 元の作業ディレクトリは必ず候補に入れるので、cd の行き先がないときも、元の場所のリポジトリは調べる
 */
function isInRepo(dir) {
  if (!fs.existsSync(dir)) return false;
  try {
    gitRunner(dir)(['rev-parse', '--show-toplevel']);
    return true;
  } catch {
    return false;
  }
}

/**
 * 今ステージしている変更を、レビュー済みとして記録する（.git の中に、HEAD とステージの内容の指紋を書く）。
 * @param {string} cwd リポジトリの中のディレクトリ
 * @returns {string} 記録したファイルのパス
 */
function markReviewed(cwd) {
  const { git, root } = repoAt(cwd);
  if (git(['diff', '--cached', '--name-only']).trim() === '') {
    throw new Error('ステージした変更がありません。git add してから実行してください');
  }
  const file = markerPath(git, root);
  fs.writeFileSync(file, `${fingerprint(git)}\n`, 'utf8');
  return file;
}

function isMarkedReviewed(git, root) {
  try {
    return fs.readFileSync(markerPath(git, root), 'utf8').trim() === fingerprint(git);
  } catch {
    return false;
  }
}

/** 1つのリポジトリで、検出したファイルを返す。記録と一致すれば空 */
function flaggedIn(dir, changesIndex) {
  const { git, root } = repoAt(dir);
  const { files, getDiff } = changesIndex ? workingTreeChanges(git, root) : stagedChanges(git);
  const flagged = buildFlaggedList(files, getDiff);
  if (flagged.length > 0 && !changesIndex && isMarkedReviewed(git, root)) return [];
  return flagged;
}

const REVIEW_STEPS = [
  '  1. security-reviewer エージェントで、ステージした変更をレビューし、CRITICAL・HIGH を直す',
  '  2. node .claude/hooks/scripts/mark-security-reviewed.js を実行する（今の HEAD とステージの内容だけを通す）',
  '  3. もう一度 git commit だけを実行する'
];

function blockReason(flagged, changesIndex) {
  const steps = changesIndex
    ? [
        '  同じコマンドで git add などインデックスを変える操作をしているか、git commit -a・パスの指定をしているので、',
        '  コミットする内容をレビューの前に確かめられません。git add などを先に実行してから、次の手順に進んでください。',
        ...REVIEW_STEPS
      ]
    : REVIEW_STEPS;
  return ['SECURITY TRIGGER: セキュリティに関わる変更があります。', '', ...flagged, '', 'ACTION REQUIRED:', ...steps].join('\n');
}

const unverifiable = detail => ({
  decision: 'block',
  reason: [
    'SECURITY TRIGGER: コミットする内容を確かめられません。',
    `  ${detail}`,
    '',
    'ACTION REQUIRED:',
    '  コマンドを分けるか、上の原因を取り除いてから、もう一度 git commit だけを実行してください。'
  ].join('\n')
});

/**
 * @param {object} input hook の入力（cwd は Claude Code のセッションの作業ディレクトリ）
 * @param {{ cwd?: string, env?: Record<string, string | undefined> }} [options] テストで差し替える
 */
async function run(input, options = {}) {
  const cwd = options.cwd ?? input?.cwd ?? process.cwd();
  const env = options.env ?? process.env;
  const calls = gitInvocations(input?.tool_input?.command || '');
  const commitAts = calls.flatMap((call, i) => (call.subcommand === 'commit' ? [i] : []));
  if (commitAts.length === 0) return null;
  if (env.SECURITY_REVIEWED === '1') return null;

  const commits = commitAts.map(i => calls[i]);
  const unsafe = commits.flatMap(call => call.env).find(assignment => UNSAFE_ENV.test(assignment));
  if (unsafe) return unverifiable(`git commit の前に ${unsafe.split('=')[0]} を指定しています。`);

  const changesIndex = commitTakesWorkingTree(calls);
  if (commits.some(call => call.globalArgs.some(arg => /^--(git-dir|work-tree)(=|$)/.test(arg)))) {
    return unverifiable('--git-dir・--work-tree を指定した git commit は、どのリポジトリにコミットするか分かりません。');
  }
  // 元の作業ディレクトリのリポジトリは必ず調べる（cd が失敗しても ; や || の後ろは元の場所で動く。
  // cd の行き先が変数・置換などで分からない（dir が null）ときも、元の場所とみなす）
  const dirs = [...new Set([cwd, ...commits.map(call => (call.dir === null ? cwd : path.resolve(cwd, call.dir)))])].filter(isInRepo);
  let flagged;
  try {
    flagged = dirs.flatMap(dir => flaggedIn(dir, changesIndex));
  } catch (error) {
    return unverifiable(`git の実行に失敗しました（${error.message.split('\n')[0]}）。`);
  }
  if (flagged.length === 0) return null;
  return { decision: 'block', reason: blockReason(flagged, changesIndex) };
}

module.exports = { run, PATTERNS, buildFlaggedList, addedLines, isExcludedPath, markReviewed };
