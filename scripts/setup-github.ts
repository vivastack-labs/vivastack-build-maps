// 11.5：GitHub の設定（ルールセット・Environment・Team・Actions・セキュリティ）を反映する（T0-05。pnpm github:setup）。
// 実行：node scripts/setup-github.ts [--apply]（なしは確かめるだけ。Node.js の型の除去で直接動かすので、enum などは使わない）
// gh（GitHub CLI）でログイン済みの前提。Team の操作には admin:org のスコープが要る。終了コード：成功 0、API・引数の誤り 1。
import { runGh } from './gh-runner.ts';
import { createGhApi, runGithubSetup } from './lib/github-setup.ts';

if (import.meta.main) {
  process.exitCode = await runGithubSetup(process.argv.slice(2), {
    ...createGhApi(runGh),
    writeOut: text => void process.stdout.write(`${text}\n`),
    writeErr: line => void process.stderr.write(`${line}\n`)
  });
}
