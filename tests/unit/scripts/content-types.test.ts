import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { generateContentTypes, GENERATED_TYPES_FILE, SCHEMA_FILE } from '../../../scripts/content-types';

const repoRoot = join(import.meta.dirname, '../../..');

// 7.1：TypeScript の型はスキーマから作る（T1-07）。作り直し忘れを CI で止める
describe('content-types', () => {
  test('7.1：コミットした型（src/lib/content-schema.generated.ts）が、スキーマから作った型と一致する', async () => {
    // Arrange
    const schema: unknown = JSON.parse(readFileSync(join(repoRoot, SCHEMA_FILE), 'utf8'));
    const committed = readFileSync(join(repoRoot, GENERATED_TYPES_FILE), 'utf8');

    // Act
    const generated = await generateContentTypes(schema, join(repoRoot, GENERATED_TYPES_FILE));

    // Assert
    expect(generated).toBe(committed);
  });

  test('7.1：名物・名所は配列の型にし、件数ごとのタプルにしない', async () => {
    const schema: unknown = JSON.parse(readFileSync(join(repoRoot, SCHEMA_FILE), 'utf8'));

    const generated = await generateContentTypes(schema, join(repoRoot, GENERATED_TYPES_FILE));

    expect(generated).toContain('specialties: Specialty[];');
    expect(generated).toContain('spots: Spot[];');
  });
});
