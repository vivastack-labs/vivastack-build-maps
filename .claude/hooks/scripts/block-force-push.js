'use strict';
const { gitInvocations } = require('../lib/git-command');

// git push の force（--force・-f・+<refspec>・--mirror）を止める（--force-with-lease・--force-if-includes は許す）。
// つないだコマンドの git push も1つずつ確かめる（issue #36）。

function isForce(args) {
  return args.some(
    arg =>
      arg === '--force' ||
      // --mirror は、リモートの ref をローカルに合わせて上書き・削除する
      arg === '--mirror' ||
      /^-[A-Za-z]*f[A-Za-z]*$/.test(arg) ||
      // +<refspec> は、その ref だけを force で push する
      /^\+[^+]/.test(arg)
  );
}

async function run(input) {
  const cmd = input?.tool_input?.command || '';
  const pushes = gitInvocations(cmd).filter(call => call.subcommand === 'push');
  if (pushes.some(call => isForce(call.args))) {
    return {
      decision: 'block',
      reason: "[VCW] Force-push is blocked — it can overwrite teammates' commits.\n" + 'Use --force-with-lease instead: git push --force-with-lease'
    };
  }
  return null;
}

module.exports = { run };
