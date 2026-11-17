// 11.5：GitHub の設定（ルールセット・Environment・Team・Actions・セキュリティ）を反映する（T0-05。pnpm github:setup）。
// 実行：node scripts/setup-github.ts [--apply]（なしは確かめるだけ。Node.js の型の除去で直接動かすので、enum などは使わない）
// gh（GitHub CLI）でログイン済みの前提。Team の操作には admin:org のスコープが要る。終了コード：成功 0、API・引数の誤り 1。
import { execFile } from 'node:child_process';
import { createGhApi, ghFailureMessage, runGithubSetup, type GhRunner } from './lib/github-setup.ts';

/** gh 1回の上限（ミリ秒）。超えると gh を止めて失敗にする */
const TIMEOUT_MS = 60_000;

/** gh を動かす。本文は標準入力で渡し（シェルを通さない）、失敗は標準エラーの内容を持つエラーにする */
const runGh: GhRunner = (args, input) =>
  new Promise((resolve, reject) => {
    const child = execFile('gh', [...args], { maxBuffer: 16 * 1024 * 1024, timeout: TIMEOUT_MS }, (error, stdout, stderr) => {
      if (error === null) resolve(stdout);
      else reject(new Error(ghFailureMessage(error, { stderr, stdout }, TIMEOUT_MS)));
    });
    // gh が先に終わると、標準入力への書き込みが EPIPE になる。理由を含めて失敗にする
    child.stdin?.on('error', error => reject(new Error(`gh の標準入力に書けませんでした：${error.message}`)));
    child.stdin?.end(input);
  });

if (import.meta.main) {
  process.exitCode = await runGithubSetup(process.argv.slice(2), {
    ...createGhApi(runGh),
    writeOut: text => void process.stdout.write(`${text}\n`),
    writeErr: line => void process.stderr.write(`${line}\n`)
  });
}
