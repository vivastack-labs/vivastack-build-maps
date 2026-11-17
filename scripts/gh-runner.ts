// gh（GitHub CLI）を動かす（scripts/setup-github.ts・scripts/preview-comment.ts が共有する。lib/github-setup.ts の createGhApi に渡す）。
// Node.js の型の除去で直接動かすので、enum などは使わない。
import { execFile } from 'node:child_process';
import { ghFailureMessage, type GhRunner } from './lib/github-setup.ts';

/** gh 1回の上限（ミリ秒）。超えると gh を止めて失敗にする */
const TIMEOUT_MS = 60_000;

/** gh を動かす。本文は標準入力で渡し（シェルを通さない）、失敗は標準エラーの内容を持つエラーにする */
export const runGh: GhRunner = (args, input) =>
  new Promise((resolve, reject) => {
    const child = execFile('gh', [...args], { maxBuffer: 16 * 1024 * 1024, timeout: TIMEOUT_MS }, (error, stdout, stderr) => {
      if (error === null) resolve(stdout);
      else reject(new Error(ghFailureMessage(error, { stderr, stdout }, TIMEOUT_MS)));
    });
    // gh が先に終わると、標準入力への書き込みが EPIPE になる。理由を含めて失敗にする
    child.stdin?.on('error', error => reject(new Error(`gh の標準入力に書けませんでした：${error.message}`)));
    child.stdin?.end(input);
  });
