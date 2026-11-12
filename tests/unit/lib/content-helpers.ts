// T1-07：コンテンツの検証のテストの道具。フィクスチャを一時ディレクトリにコピーし、1か所だけ書き換える
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDocument } from 'yaml';

export const FIXTURE_DIR = join(import.meta.dirname, '../../fixtures/content');

export type YamlPath = readonly (string | number)[];

/** フィクスチャをコピーした一時ディレクトリを作る。片付けは removeDir で */
export function copyFixtures(): string {
  const dir = mkdtempSync(join(tmpdir(), 'content-'));
  cpSync(FIXTURE_DIR, dir, { recursive: true });
  return dir;
}

export function removeDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

/** YAML の1か所を書き換える（コメントや書き方は残す） */
export function setIn(dir: string, file: string, path: YamlPath, value: unknown): void {
  const doc = parseDocument(readFileSync(join(dir, file), 'utf8'));
  doc.setIn(path, value);
  writeFileSync(join(dir, file), doc.toString());
}

/** YAML の1か所を消す */
export function deleteIn(dir: string, file: string, path: YamlPath): void {
  const doc = parseDocument(readFileSync(join(dir, file), 'utf8'));
  doc.deleteIn(path);
  writeFileSync(join(dir, file), doc.toString());
}

/** ファイルの中で、文字列が最初に現れる行（1始まり） */
export function lineOf(dir: string, file: string, needle: string): number {
  const lines = readFileSync(join(dir, file), 'utf8').split('\n');
  return lines.findIndex(line => line.includes(needle)) + 1;
}
