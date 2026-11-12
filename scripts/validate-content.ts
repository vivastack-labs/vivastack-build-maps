// 7.1〜7.3：コンテンツの YAML を検証する（T1-07。pnpm content:validate）。
// 誤りがあれば終了コード1、警告だけなら0。読み込むディレクトリは CONTENT_DIR で変えられる（既定は content/prefectures/）。
// 実行：node scripts/validate-content.ts（Node.js の型の除去で直接動かすので、enum などは使わない）
import { contentDir, formatIssue, validateContent, type ContentIssue } from '../src/lib/content.ts';

const section = (title: string, issues: readonly ContentIssue[]): readonly string[] =>
  issues.length === 0 ? [] : [`${title}（${issues.length}件）：`, ...issues.map(issue => `  ${formatIssue(issue)}`)];

/** 検証して結果を1行ずつ write に出し、終了コードを返す */
export function runValidate(dir: string, write: (line: string) => void): number {
  const { prefectures, errors, warnings } = validateContent(dir);
  const lines = [...section('誤り', errors), ...section('警告', warnings), `検証しました：形が通った県${prefectures.length}件、誤り${errors.length}件、警告${warnings.length}件`];
  lines.forEach(write);
  return errors.length > 0 ? 1 : 0;
}

if (import.meta.main) {
  process.exitCode = runValidate(contentDir(), line => process.stdout.write(`${line}\n`));
}
