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

  test('12.1 本番 workflow は Release の公開だけで起動する', () => {
    const workflow = parse(readFileSync('.github/workflows/deploy.yml', 'utf8'));
    expect(workflow.on).toEqual({ release: { types: ['published'] } });
  });

  test('11.5 production は管理者だけが変更できるリリースタグを許可する', () => {
    expect(GITHUB_SETTINGS.environments.find(environment => environment.name === 'production')?.branchPolicies).toEqual([{ name: 'v*', type: 'tag' }]);
    expect(GITHUB_SETTINGS.rulesets.find(ruleset => ruleset.name === 'production-release-tags')).toEqual({
      name: 'production-release-tags',
      target: 'tag',
      enforcement: 'active',
      conditions: { ref_name: { include: ['refs/tags/v*'], exclude: [] } },
      bypass_actors: [
        { actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' },
        { actor_id: 1, actor_type: 'OrganizationAdmin', bypass_mode: 'always' }
      ],
      rules: [{ type: 'creation' }, { type: 'update' }, { type: 'deletion' }]
    });
  });

  test('11.5 秘密の値（Token・メールアドレス）を含まない', () => {
    // Act
    const text = JSON.stringify(GITHUB_SETTINGS);

    // Assert
    expect(text).not.toMatch(/@[\w-]+\.[a-z]{2,}/iu);
    expect(text).not.toMatch(/ghp_|github_pat_/u);
  });
});
