import { readFileSync } from 'node:fs';

// 12.1：アプリの動作に関係しない変更。これだけのPRでは、CI の typecheck・test・build・e2e を飛ばす（lint は実行する）
const DOCS_DIRS = ['docs/', '.claude/', '.codex/', '.agents/'] as const;
const DOCS_EXTENSION = '.md';

const isDocsFile = (file: string): boolean => DOCS_DIRS.some(dir => file.startsWith(dir)) || file.endsWith(DOCS_EXTENSION);

/** すべてのファイルが文書なら true。ファイルがないときは false（安全側：全部を実行する） */
export const isDocsOnly = (files: readonly string[]): boolean => files.length > 0 && files.every(isDocsFile);

/** `git diff --name-only` の出力をファイルの一覧にする */
export const parseChangedFiles = (output: string): readonly string[] =>
  output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

// CI（.github/workflows/ci.yml）で、git diff --name-only の出力を標準入力で受け、GITHUB_OUTPUT の形で出す
if (import.meta.main) {
  const files = parseChangedFiles(readFileSync(0, 'utf8'));
  process.stdout.write(`docs_only=${isDocsOnly(files)}\n`);
}
