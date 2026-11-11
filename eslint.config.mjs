import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier/flat';

// .claude/rules/coding-style.md のうち、機械的に確かめられる規約
const MAX_FILE_LINES = 800;
const MAX_FUNCTION_LINES = 50;
const MAX_NESTING_DEPTH = 4;

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  globalIgnores(['.next/**', 'out/**', 'dist/**', 'coverage/**', 'next-env.d.ts', '.claude/**', '.codex/**', '.agents/**']),
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
    // テストは describe / test のコールバックが長くなるため、関数の行数は数えない
    files: ['tests/**'],
    rules: {
      'max-lines-per-function': 'off'
    }
  }
]);
