// 7.1：コンテンツのスキーマから TypeScript の型を作る（T1-07。pnpm content:types）。
// 作った型はコミットし、スキーマと一致するかを tests/unit/scripts/content-types.test.ts で確かめる。
// 実行：node scripts/content-types.ts（Node.js の型の除去で直接動かすので、enum などは使わない）
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compile, type JSONSchema } from 'json-schema-to-typescript';
import { format, resolveConfig } from 'prettier';

export const SCHEMA_FILE = 'content/schema/prefecture.schema.json';
export const GENERATED_TYPES_FILE = 'src/lib/content-schema.generated.ts';

const BANNER = [`// ${SCHEMA_FILE} から pnpm content:types で作ったファイル。手で直さない（T1-07、開発概要書 7.1）。`, '// スキーマを変えたら pnpm content:types で作り直す。'].join('\n');

/** スキーマから型のソースを作り、リポジトリの Prettier の設定で整える。outputFile は設定を探す場所 */
export async function generateContentTypes(schema: unknown, outputFile: string): Promise<string> {
  // maxItems: -1：名物・名所の件数（0 か 3）を、件数ごとのタプルではなく配列の型にする
  const source = await compile(schema as JSONSchema, 'Prefecture', {
    bannerComment: BANNER,
    additionalProperties: false,
    maxItems: -1,
    format: false
  });
  const options = await resolveConfig(outputFile);
  return format(source, { ...options, filepath: outputFile });
}

if (import.meta.main) {
  const repoRoot = join(import.meta.dirname, '..');
  const { default: schema } = await import(join(repoRoot, SCHEMA_FILE), { with: { type: 'json' } });
  const outputFile = join(repoRoot, GENERATED_TYPES_FILE);
  writeFileSync(outputFile, await generateContentTypes(schema, outputFile));
}
