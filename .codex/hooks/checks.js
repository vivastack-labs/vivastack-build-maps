'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const CODE = /\.(js|ts|jsx|tsx|mjs|cjs)$/;
const BUDGET_MS = 240_000;

/** 実在する作業ファイルだけを返す。Claude の資源とリポジトリ外は対象にしない。 */
function repositoryFile(root, file) {
  try {
    const absolute = path.resolve(root, file);
    const real = fs.realpathSync(absolute);
    const isAllowed = target => target.startsWith(root + path.sep) && !path.relative(root, target).split(path.sep).includes('.claude');
    return isAllowed(absolute) && isAllowed(real) && fs.statSync(real).isFile() ? absolute : null;
  } catch {
    return null;
  }
}

function localBin(root, name) {
  const bin = path.join(root, 'node_modules/.bin', name);
  try {
    fs.accessSync(bin, fs.constants.X_OK);
    return fs.statSync(bin).isFile() ? bin : null;
  } catch {
    return null;
  }
}

/** 編集したファイルを整形・検査する。既存のツールだけを使い、診断を注意として返す。 */
function checkFiles(root, pending, enabled) {
  const files = [...new Set(pending)].map(file => repositoryFile(root, file)).filter(Boolean);
  const messages = [];
  const deadline = Date.now() + BUDGET_MS;

  function check(command, args, timeout = 30_000) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      messages.push('[Codex hooks] 検査の制限時間を超えました。残りは手動で検証してください。');
      return;
    }
    try {
      execFileSync(command, args, {
        cwd: root,
        encoding: 'utf8',
        timeout: Math.min(timeout, remaining),
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 1024 * 1024
      });
    } catch (error) {
      messages.push(`${path.basename(command)}: ${error.stdout || ''}${error.stderr || error.message}`);
    }
  }

  function installed(name, args, timeout) {
    const bin = localBin(root, name);
    if (bin) check(bin, args, timeout);
    else messages.push(`[Codex hooks] ${name} が未導入です。pnpm install 後に検証してください。`);
  }

  const code = files.filter(file => CODE.test(file));
  if (code.length && enabled('vcw:stop:format-typecheck')) {
    const prettier = localBin(root, 'prettier');
    if (prettier) check(prettier, ['--write', ...code]);
    else {
      messages.push('[Codex hooks] Prettier が未導入のため自動整形を省略しました。');
      for (const file of code.filter(file => /\.(js|mjs|cjs)$/.test(file))) {
        check(process.execPath, ['--check', file], 5000);
      }
    }
    installed('eslint', code, 60_000);
    if (code.some(file => /\.(ts|tsx)$/.test(file)) && fs.existsSync(path.join(root, 'tsconfig.json'))) {
      installed('tsc', ['--noEmit'], 60_000);
    }
  }

  if (enabled('project:stop:format-yaml')) {
    const yaml = files.filter(file => /\.(yml|yaml)$/.test(file));
    const content = yaml.filter(file => path.relative(root, file).startsWith('content/'));
    const other = yaml.filter(file => !content.includes(file));
    if (other.length) check('yamllint', other);
    if (content.length) check('yamllint', ['-c', path.join(root, 'content/.yamllint'), ...content]);
  }
  if (enabled('project:stop:format-markdown')) {
    const markdown = files.filter(file => /\.md$/.test(file));
    if (markdown.length) installed('markdownlint-cli2', markdown);
  }
  if (enabled('project:stop:shellcheck')) {
    const shell = files.filter(file => /\.sh$/.test(file));
    if (shell.length) check('shellcheck', shell);
  }
  return messages;
}

module.exports = { repositoryFile, checkFiles };
