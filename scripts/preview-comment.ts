// 12.3：PR にプレビューの URL のコメントを付ける・書き換える（T0-06）。ci.yml の preview-comment job が動かす。
// 実行：node scripts/preview-comment.ts（Node.js の型の除去で直接動かすので、enum などは使わない）
// 環境変数：GH_TOKEN（gh が使う）・GITHUB_REPOSITORY・PR_NUMBER・ALIAS_URL・PREVIEW_URL・VERSION_ID・HEAD_SHA・MERGE_SHA。
// 外の依存（node_modules）を使わないので、pnpm install なしで動く。終了コード：成功 0、環境変数・gh api の誤りは 1。
import { runGh } from './gh-runner.ts';
import { createGhApi } from './lib/github-setup.ts';
import { runPreviewComment } from './lib/preview-comment.ts';

if (import.meta.main) {
  process.exitCode = await runPreviewComment(process.env, {
    ...createGhApi(runGh),
    writeOut: text => void process.stdout.write(`${text}\n`),
    writeErr: line => void process.stderr.write(`${line}\n`)
  });
}
