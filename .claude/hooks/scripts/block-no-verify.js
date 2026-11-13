'use strict';
const { gitInvocations, parseCommitArgs, hasShortFlag } = require('../lib/git-command');

// git のフックを飛ばす操作を止める。つないだコマンドの git も1つずつ確かめる（issue #36）。
// 語に分けてから判定するので、コミットメッセージの中の語や、git 以外のコマンドの -n には当たらない。

/** git config で、値を読む・消すだけの指定（core.hooksPath を設定しない） */
const CONFIG_READ_ONLY = new Set(['--get', '--get-all', '--get-regexp', '-l', '--list', '--unset', '--unset-all', 'get', 'list', 'unset']);
/** `-c core.hooksPath=...`・`--config-env=core.hooksPath=...`・`git config core.hooksPath ...` のキー */
const HOOKS_PATH = /^(--config-env=)?core\.hookspath(=|$)/i;

/** git config で core.hooksPath を設定するか（キーの後ろに値があるとき。キーだけなら読むだけ） */
function setsHooksPath(args) {
  const keyAt = args.findIndex(arg => HOOKS_PATH.test(arg));
  if (keyAt < 0 || args.some(arg => CONFIG_READ_ONLY.has(arg))) return false;
  return args[keyAt].includes('=') || keyAt < args.length - 1;
}

/** 環境変数で core.hooksPath を渡す（`GIT_CONFIG_KEY_0=core.hooksPath`・`GIT_CONFIG_PARAMETERS`） */
const HOOKS_PATH_ENV = /^GIT_CONFIG_(KEY_\d+=core\.hookspath$|PARAMETERS=.*core\.hookspath)/i;
const NO_VERIFY = '--no-verify';
/** git が受け付ける `--no-verify` の省略形のうち、いちばん短いもの（`--no-ver` は `--no-verbose` と区別できない） */
const NO_VERIFY_MIN = '--no-veri';

/** `--no-verify` か、その省略形（`--no-veri`・`--no-verif`）か */
const isNoVerify = arg => arg.length >= NO_VERIFY_MIN.length && NO_VERIFY.startsWith(arg);

function bypassesHooks({ subcommand, args, globalArgs, env }) {
  if (env.some(assignment => HOOKS_PATH_ENV.test(assignment))) return true;
  // `-c alias.ci="commit --no-verify"` のように、値の中で --no-verify を足す
  if (globalArgs.some(arg => HOOKS_PATH.test(arg) || arg.includes(NO_VERIFY))) return true;
  if (subcommand === 'config') return setsHooksPath(args) || args.some(arg => arg.includes(NO_VERIFY));
  if (subcommand === 'commit') {
    return parseCommitArgs(args).options.some(arg => isNoVerify(arg) || hasShortFlag(arg, 'n'));
  }
  const options = args.slice(0, args.includes('--') ? args.indexOf('--') : args.length);
  return options.some(isNoVerify);
}

async function run(input) {
  const cmd = input?.tool_input?.command || '';
  if (gitInvocations(cmd).some(bypassesHooks)) {
    return {
      decision: 'block',
      reason: '[VCW] Bypassing git hooks is not allowed.\nFix the underlying issue instead of skipping verification.'
    };
  }
  return null;
}

module.exports = { run };
