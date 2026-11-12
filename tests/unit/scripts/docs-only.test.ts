import { describe, expect, test } from 'vitest';
import { isDocsOnly, parseChangedFiles } from '../../../scripts/docs-only';

// 12.1：文書だけのPRでは、CI の重い手順（typecheck・test・build・e2e）を飛ばす。
// paths-ignore を使うと必須のチェックが「Pending」のままになるため、job の中で判定する（T0-04）
describe('isDocsOnly', () => {
  test.each(['docs/development-overview.md', '.claude/hooks/scripts/x.js', '.codex/config.toml', '.agents/skills/x/SKILL.md', 'README.md', 'CHANGELOG.md'])(
    '12.1：%s だけの変更は文書だけとみなす',
    file => {
      // Act
      const result = isDocsOnly([file]);

      // Assert
      expect(result).toBe(true);
    }
  );

  test.each([
    'app/[lang]/page.tsx',
    'package.json',
    '.github/workflows/ci.yml',
    'public/_headers',
    'docs.ts',
    '.claudeignore',
    'src/docs/x.ts',
    'README.mdx',
    'public/x.md',
    'app/x/README.md',
    'content/x.md'
  ])(
    // .md でも、リポジトリの直下と文書のディレクトリの下以外は、配信や読み込みの対象になりうるので文書とみなさない
    '12.1：%s を含む変更は文書だけとみなさない',
    file => {
      // Act
      const result = isDocsOnly(['docs/a.md', file]);

      // Assert
      expect(result).toBe(false);
    }
  );

  test('12.1：変更されたファイルがないときは文書だけとみなさない（全部を実行する）', () => {
    // Act
    const result = isDocsOnly([]);

    // Assert
    expect(result).toBe(false);
  });
});

describe('parseChangedFiles', () => {
  test('12.1：git diff --name-only の出力を行に分ける（空行・CRLF・前後の空白を除く）', () => {
    // Arrange
    const output = 'docs/a.md\r\n  app/page.tsx \n\n README.md\n';

    // Act
    const result = parseChangedFiles(output);

    // Assert
    expect(result).toEqual(['docs/a.md', 'app/page.tsx', 'README.md']);
  });

  test('12.1：出力が空なら空の配列を返す', () => {
    // Act
    const result = parseChangedFiles('\n');

    // Assert
    expect(result).toEqual([]);
  });
});
