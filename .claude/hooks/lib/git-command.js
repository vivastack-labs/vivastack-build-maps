'use strict';
/**
 * Bash のコマンドから git の呼び出しを取り出す（issue #36）。
 * hook が先頭の `git` だけを見ると、`git add . && git commit` や `cat > m <<EOF && git push --force` の
 * 後ろの git を確かめられない。コマンドを区切り、引用符を外した語の並びにしてから判定する。
 *
 * 扱う書き方：`&&`・`||`・`;`・`|`・`&`・改行・括弧での区切り、引用符とエスケープ、行の継続（`\` と改行）、
 * ヒアドキュメント（本文は読み飛ばす）、コマンド置換（`$(...)`・バッククォート。中身を別のコマンドとして読む）、
 * `if ... then`・`{`・`!` などの予約語、`sudo`・`env`・`xargs` などのラッパー、`sh -c '...'`、`cd` と `git -C`。
 * 完全なシェルの構文解析ではない。`eval`、変数に入れたコマンド、git のエイリアス、環境変数 GIT_CONFIG_* は見ない。
 */
const os = require('os');
const path = require('path');

const SEPARATORS = ['&&', '||', ';', '|', '&', '\n', '(', ')'];
/** 語の終わり（ヒアドキュメントの区切りの語・リダイレクトの行き先） */
const WORD_END = /[\s;&|()<>]/;
/** リダイレクトの記号の2文字目（`>>`・`>&`・`>|`・`<&`・`<>`） */
const REDIRECT_SECOND = '>&|';
/** 値を次の語に取る git の全体のオプション（`--exec-path` は値を省略できるので入れない） */
const GLOBAL_OPTIONS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--config-env']);
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
/**
 * コマンドの前に付く予約語・ラッパーと、そのオプションのうち値を次の語に取るもの、オプションの後ろの位置引数の数。
 * ラッパーごとに持つ（`sudo -n` の -n は値を取らないが、`xargs -n 1` の -n は取る）
 */
const PREFIXES = new Map([
  ...['if', 'then', 'else', 'elif', 'while', 'until', 'do', '{', '!', 'command', 'builtin', 'nohup'].map(name => [name, { valueOptions: [], positionals: 0 }]),
  ['time', { valueOptions: ['-f', '-o'], positionals: 0 }],
  ['exec', { valueOptions: ['-a'], positionals: 0 }],
  ['env', { valueOptions: ['-u', '-C', '-S'], positionals: 0 }],
  ['sudo', { valueOptions: ['-u', '-g', '-C', '-h', '-p', '-U', '-r', '-t', '-T', '-D'], positionals: 0 }],
  ['xargs', { valueOptions: ['-n', '-I', '-P', '-s', '-L', '-d', '-E', '-a'], positionals: 0 }],
  ['nice', { valueOptions: ['-n'], positionals: 0 }],
  ['stdbuf', { valueOptions: ['-i', '-o', '-e'], positionals: 0 }],
  // timeout [オプション] <時間> <コマンド>
  ['timeout', { valueOptions: ['-s', '-k'], positionals: 1 }]
]);
const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh']);

/** `$(` の対になる `)` の位置を返す（入れ子を数える）。なければ末尾 */
function closingParen(command, from) {
  let depth = 1;
  for (let i = from; i < command.length; i += 1) {
    if (command[i] === '(') depth += 1;
    if (command[i] === ')') depth -= 1;
    if (depth === 0) return i;
  }
  return command.length;
}

/** `<<` の後ろの区切りの語を読み、引用符を外して返す */
function readHeredocWord(command, from) {
  let i = from;
  const stripsTabs = command[i] === '-';
  if (stripsTabs) i += 1;
  while (command[i] === ' ' || command[i] === '\t') i += 1;
  let word = '';
  while (i < command.length && !WORD_END.test(command[i])) {
    if (!`'"\\`.includes(command[i])) word += command[i];
    i += 1;
  }
  return { word, stripsTabs, end: i };
}

/** 空白を飛ばして1語（引用符で囲んだものを含む）を読み、その終わりの位置を返す */
function skipWord(command, from) {
  let i = from;
  while (command[i] === ' ' || command[i] === '\t') i += 1;
  if (command[i] === "'" || command[i] === '"') {
    const close = command.indexOf(command[i], i + 1);
    return close < 0 ? command.length : close + 1;
  }
  while (i < command.length && !WORD_END.test(command[i])) i += 1;
  return i;
}

/** 改行の次の位置から、ヒアドキュメントの本文を読み飛ばした位置を返す */
function skipHeredocBodies(command, from, heredocs) {
  let pos = from;
  for (const { word, stripsTabs } of heredocs) {
    while (pos < command.length) {
      const newline = command.indexOf('\n', pos);
      const end = newline < 0 ? command.length : newline;
      const line = command.slice(pos, end);
      pos = end + 1;
      if ((stripsTabs ? line.replace(/^\t+/, '') : line) === word) break;
    }
  }
  return pos;
}

/** コマンド置換があった位置の印。語には残さず、`cd` の行き先が分からないことの判定だけに使う */
const SUBSTITUTION = '\u0000';
const clean = tokens => tokens.map(word => word.replaceAll(SUBSTITUTION, ''));

/**
 * コマンドを区切り、それぞれを語の配列にする。
 * 引用符の中の区切りと空白は語の一部にし、引用符とエスケープは外す。
 * リダイレクト（`2>&1`・`> out`・`&> log`・`<<< text` など）は、行き先と一緒に取り除く（git の引数ではないため）。
 * コマンド置換の中身は、別のコマンドとして、置換を含むコマンドより前に並べる。
 * 引用符が閉じないまま終わったときは、引用符を文字として読み直す（後ろのコマンドを見落とさないため）。
 * コマンド置換があった位置には SUBSTITUTION の印を残す（公開する splitShell は印を取り除いて返す）。
 * @param {string} command
 * @param {{ ignoreQuotes?: boolean }} [options]
 * @returns {string[][]}
 */
function splitRaw(command, { ignoreQuotes = false } = {}) {
  const segments = [];
  let tokens = [];
  let token = '';
  let hasToken = false;
  let quote = null;
  let heredocs = [];

  const endToken = () => {
    if (hasToken) tokens.push(token);
    token = '';
    hasToken = false;
  };
  const endSegment = () => {
    endToken();
    if (tokens.length > 0) segments.push(tokens);
    tokens = [];
  };
  /** コマンド置換の中身を別のコマンドとして読み、置換の終わりの位置を返す */
  const substitute = (start, end) => {
    segments.push(...splitRaw(command.slice(start, end)));
    // 置換の結果は分からないので、印を残す（`cd $(...)` の行き先を「分からない」にするため）
    token += SUBSTITUTION;
    hasToken = true;
    return end;
  };

  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];
    const next = command[i + 1];
    if (quote === "'") {
      if (ch === "'") quote = null;
      else token += ch;
      continue;
    }
    if (ch === '\\' && next === '\n') {
      i += 1;
      continue;
    }
    if (ch === '\\' && next !== undefined && (quote === null || '"\\$`'.includes(next))) {
      token += next;
      hasToken = true;
      i += 1;
      continue;
    }
    if (ch === '$' && next === '(') {
      i = substitute(i + 2, closingParen(command, i + 2));
      continue;
    }
    if (ch === '`') {
      const close = command.indexOf('`', i + 1);
      i = substitute(i + 1, close < 0 ? command.length : close);
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = null;
      else token += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      // 読み直しのときは、引用符の文字を語に残さない（`'--force'` を `--force` として見る）
      if (!ignoreQuotes) quote = ch;
      hasToken = true;
      continue;
    }
    if (ch === '&' && next === '>') {
      endToken();
      i = skipWord(command, command[i + 2] === '>' ? i + 3 : i + 2) - 1;
      continue;
    }
    if (command.startsWith('<<<', i)) {
      endToken();
      i = skipWord(command, i + 3) - 1;
      continue;
    }
    if (command.startsWith('<<', i)) {
      endToken();
      const heredoc = readHeredocWord(command, i + 2);
      heredocs = [...heredocs, heredoc];
      i = heredoc.end - 1;
      continue;
    }
    if ((ch === '<' || ch === '>') && next === '(') {
      // プロセス置換 `<(...)`・`>(...)` の中身も、別のコマンドとして読む
      i = substitute(i + 2, closingParen(command, i + 2));
      continue;
    }
    if (ch === '>' || ch === '<') {
      // 直前の数字だけの語は、ファイル記述子（`2>`）
      if (hasToken && /^\d+$/.test(token)) {
        token = '';
        hasToken = false;
      } else {
        endToken();
      }
      i = skipWord(command, REDIRECT_SECOND.includes(next) ? i + 2 : i + 1) - 1;
      continue;
    }
    if (ch === '\n' && heredocs.length > 0) {
      endSegment();
      i = skipHeredocBodies(command, i + 1, heredocs) - 1;
      heredocs = [];
      continue;
    }
    const separator = SEPARATORS.find(sep => command.startsWith(sep, i));
    if (separator) {
      endSegment();
      i += separator.length - 1;
      continue;
    }
    if (/\s/.test(ch)) {
      endToken();
      continue;
    }
    token += ch;
    hasToken = true;
  }
  if (quote !== null) return splitRaw(command, { ignoreQuotes: true });
  endSegment();
  return segments;
}

/**
 * コマンドを区切り、それぞれを語の配列にする（splitRaw の結果から、コマンド置換の印を取り除く）。
 * @param {string} command
 * @returns {string[][]}
 */
function splitShell(command) {
  return splitRaw(command).map(clean);
}

const baseName = word => word.slice(word.lastIndexOf('/') + 1);

/** 先頭の環境変数の代入・予約語・ラッパー（とそのオプション）を飛ばし、その位置と代入を返す */
function skipPrefixes(tokens) {
  const env = [];
  let i = 0;
  while (i < tokens.length) {
    if (ENV_ASSIGNMENT.test(tokens[i])) {
      env.push(tokens[i]);
      i += 1;
    } else if (PREFIXES.has(baseName(tokens[i]))) {
      const { valueOptions, positionals } = PREFIXES.get(baseName(tokens[i]));
      i += 1;
      while (i < tokens.length && tokens[i].startsWith('-')) {
        i += valueOptions.includes(tokens[i]) ? 2 : 1;
      }
      i += positionals;
    } else {
      return { at: i, env };
    }
  }
  return { at: i, env };
}

/** ディレクトリを移る。分からないときは null（`cd -` など） */
function changeDir(dir, target) {
  if (target === undefined || target === '~') return os.homedir();
  // 変数・コマンド置換・ワイルドカードは、行き先が分からない
  if (target === '-' || /[$`*?{\u0000]/.test(target)) return null;
  const expanded = target.startsWith('~/') ? path.join(os.homedir(), target.slice(2)) : target;
  if (path.isAbsolute(expanded)) return expanded;
  return dir === null ? null : path.join(dir, expanded);
}

/** git の全体のオプションを読み、サブコマンドの位置と、-C を反映したディレクトリを返す */
function readGlobalArgs(tokens, from, dir) {
  const globalArgs = [];
  let callDir = dir;
  let i = from;
  while (i < tokens.length && tokens[i].startsWith('-')) {
    globalArgs.push(tokens[i]);
    if (GLOBAL_OPTIONS_WITH_VALUE.has(tokens[i]) && i + 1 < tokens.length) {
      if (tokens[i] === '-C') callDir = changeDir(callDir, tokens[i + 1]);
      if (tokens[i] === '--git-dir' || tokens[i] === '--work-tree') callDir = null;
      globalArgs.push(tokens[i + 1]);
      i += 1;
    }
    if (/^--(git-dir|work-tree)=/.test(tokens[i])) callDir = null;
    i += 1;
  }
  return { globalArgs, callDir, at: i };
}

/** `sh -c '<script>'` の script を返す（`-o pipefail` などの値は飛ばす）。なければ null */
function shellScript(tokens, at) {
  for (let i = at + 1; i < tokens.length - 1; i += 1) {
    if (/^-[A-Za-z]*c[A-Za-z]*$/.test(tokens[i])) return tokens[i + 1];
    if (tokens[i] === '-o' || tokens[i] === '+o' || tokens[i] === '-O' || tokens[i] === '+O') {
      i += 1;
    } else if (!/^[-+]/.test(tokens[i])) {
      return null;
    }
  }
  return null;
}

/**
 * 区切った1つのコマンドから、git の呼び出しを返す（`sh -c` の中も読む）。
 * @returns {GitInvocation[]}
 */
function invocationsOf(tokens, dir) {
  const { at, env } = skipPrefixes(tokens);
  if (at >= tokens.length) return [];
  const name = baseName(tokens[at]);
  if (SHELLS.has(name)) {
    const script = shellScript(tokens, at);
    if (script === null) return [];
    return gitInvocations(script).map(call => ({ ...call, dir: call.dir === null ? null : changeDir(dir, call.dir) }));
  }
  if (name !== 'git' && name !== 'git.exe') return [];
  const { globalArgs, callDir, at: subAt } = readGlobalArgs(tokens, at + 1, dir);
  return [{ subcommand: tokens[subAt] ?? '', args: tokens.slice(subAt + 1), globalArgs, env, dir: callDir }];
}

/**
 * @typedef {object} GitInvocation
 * @property {string} subcommand
 * @property {string[]} args サブコマンドの後ろの語（リダイレクトは除く）
 * @property {string[]} globalArgs git とサブコマンドの間のオプション（値を含む）
 * @property {string[]} env git の前に書いた環境変数の代入（`NAME=value`）
 * @property {string | null} dir その git を実行するディレクトリ（`cd`・`git -C` を反映した、元のディレクトリからの相対パスか絶対パス）。分からないときは null
 */

/**
 * コマンドの中の git の呼び出しを、出てくる順に返す。
 * @param {string} command
 * @returns {GitInvocation[]}
 */
function gitInvocations(command) {
  const calls = [];
  let dir = '.';
  for (const raw of splitRaw(command)) {
    const tokens = clean(raw);
    const { at } = skipPrefixes(tokens);
    if (tokens[at] === 'cd' || tokens[at] === 'pushd') {
      // 行き先の判定だけは、コマンド置換の印を残した語で行う
      dir = changeDir(dir, raw[at + 1]);
      continue;
    }
    calls.push(...invocationsOf(tokens, dir));
  }
  return calls;
}

/** git commit で、値を次の語（またはくっついた残り）に取る短いオプション */
const COMMIT_SHORT_WITH_VALUE = 'CcFmt';
/** git commit で、値を省略でき、渡すときはくっつける短いオプション（`-S<keyid>`・`-u<mode>`） */
const COMMIT_SHORT_ATTACHED_VALUE = 'Su';
/** git commit で、値を次の語に取る長いオプション */
const COMMIT_LONG_WITH_VALUE = new Set([
  '--message',
  '--file',
  '--template',
  '--reuse-message',
  '--reedit-message',
  '--author',
  '--date',
  '--fixup',
  '--squash',
  '--trailer',
  '--cleanup',
  '--pathspec-from-file'
]);
const SHORT_CLUSTER = /^-[A-Za-z]+$/;
const takesValue = ch => COMMIT_SHORT_WITH_VALUE.includes(ch) || COMMIT_SHORT_ATTACHED_VALUE.includes(ch);

/**
 * `-anm` のような短いオプションのまとまりに、値を取るオプションより前に letter があるか。
 * `-mn`・`-Sn` の n は値なので数えない。
 */
function hasShortFlag(arg, letter) {
  if (!SHORT_CLUSTER.test(arg)) return false;
  for (const ch of arg.slice(1)) {
    if (ch === letter) return true;
    if (takesValue(ch)) return false;
  }
  return false;
}

/** 次の語が値になるか（`-m`・`-am`・`--author` など。`-S`・`-u` は次の語を値に取らない） */
function takesNextAsValue(arg) {
  if (COMMIT_LONG_WITH_VALUE.has(arg)) return true;
  if (!SHORT_CLUSTER.test(arg)) return false;
  const letters = arg.slice(1);
  const valueAt = [...letters].findIndex(takesValue);
  return valueAt === letters.length - 1 && COMMIT_SHORT_WITH_VALUE.includes(letters[valueAt]);
}

/**
 * git commit の引数を、オプション（値を除く）とパスに分ける。
 * パスを渡した commit は、作業ツリーの内容をコミットする。
 * @param {string[]} args
 * @returns {{ options: string[], paths: string[] }}
 */
function parseCommitArgs(args) {
  const options = [];
  const paths = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--') {
      paths.push(...args.slice(i + 1));
      break;
    }
    // 空の語（`$(echo)` の跡など）はパスではない
    if (arg === '') continue;
    if (!arg.startsWith('-')) {
      paths.push(arg);
      continue;
    }
    options.push(arg);
    if (takesNextAsValue(arg)) i += 1;
  }
  return { options, paths };
}

/** git commit で、作業ツリーの内容もコミットする長いオプションと、git が受け付ける最短の省略形 */
const COMMIT_UNSTAGED_LONG = [
  ['--all', '--all'],
  ['--include', '--inc'],
  ['--only', '--o'],
  ['--interactive', '--int'],
  ['--patch', '--patc'],
  ['--pathspec-from-file', '--paths']
];
/** git commit で、作業ツリーの内容もコミットする短いオプション */
const COMMIT_UNSTAGED_SHORT = ['a', 'i', 'o', 'p'];

const matchesLong = (arg, [full, shortest]) => {
  const name = arg.split('=')[0];
  return name.length >= shortest.length && full.startsWith(name);
};

/** git commit が、ステージしていない作業ツリーの内容もコミットするか（-a・パスの指定など） */
function commitsUnstaged(args) {
  const { options, paths } = parseCommitArgs(args);
  return paths.length > 0 || options.some(arg => COMMIT_UNSTAGED_LONG.some(long => matchesLong(arg, long)) || COMMIT_UNSTAGED_SHORT.some(letter => hasShortFlag(arg, letter)));
}

/** commit の前にあっても、インデックスを変えない git のサブコマンド */
const READ_ONLY_SUBCOMMANDS = new Set([
  'status',
  'diff',
  'log',
  'show',
  'rev-parse',
  'ls-files',
  'ls-tree',
  'ls-remote',
  'fetch',
  'push',
  'branch',
  'remote',
  'describe',
  'blame',
  'grep',
  'shortlog',
  'cat-file',
  'show-ref',
  'symbolic-ref',
  'var',
  'version',
  'help',
  'reflog',
  'rev-list',
  'config',
  'merge-base',
  'for-each-ref',
  'name-rev',
  'count-objects',
  'check-ignore',
  'check-attr',
  'cherry',
  'whatchanged',
  'tag'
]);

/**
 * 同じコマンドの git commit が、ステージ済みの内容以外もコミットしうるか。
 * commit より前に、インデックスを変えうる git の操作（add・rm・stash など）があるか、commit が -a・パスの指定などで作業ツリーの内容もコミットするとき。
 * 前の操作は hook の後に動くので、hook の時点のインデックスには、まだ入っていない
 * @param {GitInvocation[]} calls gitInvocations の結果
 */
function commitTakesWorkingTree(calls) {
  const commitAts = calls.flatMap((call, i) => (call.subcommand === 'commit' ? [i] : []));
  if (commitAts.length === 0) return false;
  const changesIndexBefore = calls.slice(0, commitAts.at(-1)).some(call => call.subcommand !== 'commit' && !READ_ONLY_SUBCOMMANDS.has(call.subcommand));
  return changesIndexBefore || commitAts.some(i => commitsUnstaged(calls[i].args));
}

module.exports = { splitShell, gitInvocations, parseCommitArgs, hasShortFlag, commitsUnstaged, commitTakesWorkingTree };
