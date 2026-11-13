#!/usr/bin/env node
'use strict';
// security-trigger に止められた変更を、security-reviewer でレビューした後に実行する。
// 今ステージしている内容の指紋を .git に書き、同じ内容の git commit だけを通す（内容が変われば、また止まる）。
// 実行：node .claude/hooks/scripts/mark-security-reviewed.js
const { markReviewed } = require('./security-trigger');

try {
  const file = markReviewed(process.cwd());
  process.stdout.write(`今ステージしている変更を、レビュー済みとして記録しました（${file}）。git commit を実行してください。\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
