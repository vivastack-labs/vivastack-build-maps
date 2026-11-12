import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';
import jsdoc from 'eslint-plugin-jsdoc';

// .claude/rules/coding-style.md のうち、機械的に確かめられる規約
const MAX_FILE_LINES = 800;
const MAX_FUNCTION_LINES = 50;
const MAX_NESTING_DEPTH = 4;

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores(['.next/**', 'out/**', 'dist/**', '.wrangler/**', 'coverage/**', 'next-env.d.ts', '.claude/**', '.codex/**', '.agents/**']),
  {
    rules: {
      'max-lines': ['error', { max: MAX_FILE_LINES, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: MAX_FUNCTION_LINES, skipBlankLines: true, skipComments: true }],
      'max-depth': ['error', MAX_NESTING_DEPTH],
      'no-console': 'error',
      'no-param-reassign': ['error', { props: true }],
      'prefer-const': 'error'
    }
  },
  {
    // export する関数・クラス・型・定数には JSDoc を付ける（coding-style.md）。
    // app/ は Next.js が決めた名前（page・layout など）の export なので対象にしない
    files: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts', 'geo/scripts/**/*.ts'],
    ignores: ['src/**/*.generated.ts'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          // --fix で中身のない /** */ を入れさせない
          enableFixer: false,
          require: { FunctionDeclaration: true, ArrowFunctionExpression: true, FunctionExpression: true, ClassDeclaration: true },
          // 変数は export したものだけ（関数の中の const を対象にしないため）
          contexts: ['TSTypeAliasDeclaration', 'TSInterfaceDeclaration', 'TSEnumDeclaration', 'ExportNamedDeclaration > VariableDeclaration']
        }
      ]
    }
  },
  {
    // テストは describe / test のコールバックが長くなるため、関数の行数は数えない
    files: ['tests/**'],
    rules: {
      'max-lines-per-function': 'off'
    }
  }
]);
