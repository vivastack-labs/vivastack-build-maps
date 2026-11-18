#!/usr/bin/env node
'use strict';

// security-reviewer によるレビューと CRITICAL・HIGH の修正後に実行する。
// 共通実装は読み取りだけ。記録は対象リポジトリの .git/security-reviewed に保存する。
const { markReviewed } = require('../../.claude/hooks/scripts/security-trigger');

try {
  const file = markReviewed(process.cwd());
  process.stdout.write(`今ステージしている変更を、レビュー済みとして記録しました（${file}）。git commit を実行してください。\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
