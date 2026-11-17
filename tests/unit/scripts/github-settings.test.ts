import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { parse } from 'yaml';
import { GITHUB_SETTINGS } from '../../../scripts/github-settings';

// 11.5：GitHub の設定（pnpm github:setup）の値が、リポジトリのほかのファイルとずれていないことを確かめる（T0-05）
describe('GITHUB_SETTINGS', () => {
  test('11.5 必須のチェックの名前が .github/workflows/ci.yml の job にある', () => {
    // Arrange
    const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as { jobs: Record<string, unknown> };

    // Act
    const missing = GITHUB_SETTINGS.requiredChecks.filter(check => !(check in workflow.jobs));

    // Assert
    expect(missing).toEqual([]);
    expect(GITHUB_SETTINGS.requiredChecks.length).toBeGreaterThan(0);
  });

  test('11.5 必須のチェックの job に name: がない（チェックの名前が job の id のまま）', () => {
    // Arrange
    const workflow = parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as { jobs: Record<string, { name?: string }> };

    // Act
    const renamed = GITHUB_SETTINGS.requiredChecks.filter(check => workflow.jobs[check]?.name !== undefined);

    // Assert
    expect(renamed).toEqual([]);
  });

  test('11.5 .github/CODEOWNERS の Team が、設定の Team と同じ', () => {
    // Arrange
    const lines = readFileSync('.github/CODEOWNERS', 'utf8')
      .split('\n')
      .filter(line => !line.startsWith('#') && line.trim() !== '');

    // Act
    const owners = lines.flatMap(line => line.split(/\s+/u).slice(1));

    // Assert
    expect(owners).toContain(`@${GITHUB_SETTINGS.owner}/${GITHUB_SETTINGS.team.slug}`);
  });

  test('11.5 秘密の値（Token・メールアドレス）を含まない', () => {
    // Act
    const text = JSON.stringify(GITHUB_SETTINGS);

    // Assert
    expect(text).not.toMatch(/@[\w-]+\.[a-z]{2,}/iu);
    expect(text).not.toMatch(/ghp_|github_pat_/u);
  });
});
