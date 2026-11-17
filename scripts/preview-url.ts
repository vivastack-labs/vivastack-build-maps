// 12.3：wrangler versions upload の出力ファイルから、プレビューの URL・バージョン ID を取り出す（T0-06）。
// 実行：node scripts/preview-url.ts <wrangler の出力ファイル> >> "$GITHUB_OUTPUT"（Node.js の型の除去で直接動かすので、enum などは使わない）
// 終了コード：成功 0、引数・ファイル・内容の誤りは 1（標準出力には何も出さない）。
import { readFileSync } from 'node:fs';
import { runPreviewUrl } from './lib/preview-url.ts';

if (import.meta.main) {
  process.exitCode = runPreviewUrl(process.argv.slice(2), {
    readFile: path => readFileSync(path, 'utf8'),
    writeOut: text => void process.stdout.write(text),
    writeErr: line => void process.stderr.write(`${line}\n`)
  });
}
