import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { assembleDist } from '../../../scripts/postbuild';

// D35：専用のドメインで配信するので、out/ をそのままの構成で dist/ に組み立てる（6.4）
describe('assembleDist', () => {
  let root: string;
  let outDir: string;
  let distDir: string;

  const put = (base: string, path: string, body: string): void => {
    const file = join(base, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'postbuild-'));
    outDir = join(root, 'out');
    distDir = join(root, 'dist');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('D35：out/ をそのままの構成で dist/ にコピーし、前の dist/ は消す', () => {
    // Arrange
    put(outDir, '_redirects', 'redirects');
    put(outDir, '_headers', 'headers');
    put(outDir, 'ja/index.html', 'ja');
    put(outDir, '_next/static/chunks/a.js', 'js');
    put(outDir, '404.html', 'not found');
    put(distDir, 'stale.html', 'old');

    // Act
    assembleDist({ outDir, distDir });

    // Assert
    expect(readFileSync(join(distDir, '_redirects'), 'utf8')).toBe('redirects');
    expect(readFileSync(join(distDir, '_headers'), 'utf8')).toBe('headers');
    expect(readFileSync(join(distDir, 'ja/index.html'), 'utf8')).toBe('ja');
    expect(readFileSync(join(distDir, '_next/static/chunks/a.js'), 'utf8')).toBe('js');
    expect(readFileSync(join(distDir, '404.html'), 'utf8')).toBe('not found');
    expect(existsSync(join(distDir, 'stale.html'))).toBe(false);
  });

  test.each(['_redirects', '_headers'])('R7：out/ に %s がなければエラーにする', missing => {
    // Arrange
    for (const file of ['_redirects', '_headers'].filter(name => name !== missing)) {
      put(outDir, file, 'x');
    }
    put(outDir, 'ja/index.html', 'ja');

    // Act & Assert
    expect(() => assembleDist({ outDir, distDir })).toThrow(missing);
  });

  test.each([
    ['同じ', (out: string) => out],
    ['out/ の中', (out: string) => join(out, 'dist')],
    ['dist/ の中に out/', (out: string) => dirname(out)]
  ])('R7：dist/ と out/ が重なるとき（%s）はエラーにし、out/ を消さない', (_label, toDist) => {
    // Arrange
    put(outDir, '_redirects', 'x');
    put(outDir, '_headers', 'x');

    // Act & Assert
    expect(() => assembleDist({ outDir, distDir: toDist(outDir) })).toThrow();
    expect(existsSync(join(outDir, '_redirects'))).toBe(true);
  });

  test('R7：out/ にシンボリックリンクがあればエラーにする', () => {
    // Arrange
    put(outDir, '_redirects', 'x');
    put(outDir, '_headers', 'x');
    put(root, 'outside.txt', 'secret');
    symlinkSync(join(root, 'outside.txt'), join(outDir, 'link.txt'));

    // Act & Assert
    expect(() => assembleDist({ outDir, distDir })).toThrow('link.txt');
  });

  test('R7：out/ がなければエラーにする', () => {
    // Act & Assert
    expect(() => assembleDist({ outDir, distDir })).toThrow();
  });
});
