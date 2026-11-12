import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { runValidate } from '../../../scripts/validate-content';
import { copyFixtures, removeDir, setIn } from '../lib/content-helpers';

// 7.1・7.3：pnpm content:validate は、誤りがあれば終了コード1、警告だけなら0（T1-07）
describe('runValidate', () => {
  let dir = '';
  let lines: string[] = [];
  const write = (line: string): void => {
    lines = [...lines, line];
  };

  beforeEach(() => {
    dir = copyFixtures();
    lines = [];
  });
  afterEach(() => {
    removeDir(dir);
  });

  test('7.1：誤りがあれば、誤りを出して終了コード1', () => {
    // Arrange
    setIn(dir, '13-tokyo.yaml', ['spots', 1, 'status'], 'done');

    // Act
    const code = runValidate(dir, write);

    // Assert
    expect(code).toBe(1);
    expect(lines).toContain('誤り（1件）：');
    // 形が通らなかった東京都は、内容のルール（出典が空の警告）を見ない
    expect(lines.at(-1)).toBe('検証しました：形が通った県2件、誤り1件、警告7件');
  });

  test('7.3：警告だけなら、警告を出して終了コード0', () => {
    const code = runValidate(dir, write);

    expect(code).toBe(0);
    expect(lines).not.toContain('誤り（0件）：');
    expect(lines).toContain('警告（14件）：');
    expect(lines.at(-1)).toBe('検証しました：形が通った県3件、誤り0件、警告14件');
  });

  test('7.1：1行に1件、「ファイル:行 場所 メッセージ」の形で出す', () => {
    setIn(dir, '13-tokyo.yaml', ['spots', 1, 'status'], 'done');

    runValidate(dir, write);

    expect(lines).toContainEqual(expect.stringMatching(/^ {2}13-tokyo\.yaml:\d+ spots\[1\]\.status 値は draft・verified・reviewed のどれかにしてください$/));
  });

  test('7.1：ディレクトリがなければ誤りにし、警告の見出しは出さない', () => {
    const empty = `${dir}/none`;

    const code = runValidate(empty, write);

    expect(code).toBe(1);
    expect(lines[0]).toBe('誤り（1件）：');
    expect(lines.some(line => line.startsWith('警告'))).toBe(false);
  });
});
