// 12.4：出典（sources[].url）のリンク切れを確かめて、Markdown のレポートを出す（T5-03。pnpm content:links）。
// 実行：node scripts/check-links.ts [--pref 26,kyoto] [--out <ファイル>]（Node.js の型の除去で直接動かすので、enum などは使わない）
// コンテンツは CONTENT_DIR（既定は content/prefectures/）。終了コード：リンク切れがあれば 1、引数・コンテンツの誤りは 2。
import { writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { contentDir, loadContent } from '../src/lib/content.ts';
import { runLinkCheck } from './lib/link-check.ts';

if (import.meta.main) {
  process.exitCode = await runLinkCheck(process.argv.slice(2), {
    contentDir: contentDir(),
    loadContent,
    fetch: (url, init) => fetch(url, init),
    now: () => Date.now(),
    sleep: ms => delay(ms),
    writeOut: text => void process.stdout.write(`${text}\n`),
    writeErr: line => void process.stderr.write(`${line}\n`),
    writeFile: (path, text) => writeFileSync(path, `${text}\n`)
  });
}
