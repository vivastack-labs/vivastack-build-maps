'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

/** 保存先を明示した Codex 用の状態操作。テストは一時リポジトリ内に分離する。 */
function createState(root) {
  function statePath(...parts) {
    const target = path.join(root, ...parts);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    return target;
  }
  return { statePath, atomicWrite, readJSON };
}

/** JSON を一時ファイル経由で置き換え、途中で終了しても既存の状態を壊さない。 */
function atomicWrite(file, data) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(temporary, file);
}

/** 状態の未作成・破損時は null を返す。 */
function readJSON(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

module.exports = { createState };
