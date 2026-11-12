import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// 10.2・testing.md：全体80%以上、ドメインロジック（src/lib・src/features・geo/scripts/lib）は90%以上
const OVERALL = { lines: 80, functions: 80, branches: 80, statements: 80 };
const DOMAIN = { lines: 90, functions: 90, branches: 90, statements: 90 };

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) }
  },
  test: {
    // ロジックのテスト（.ts）は node、コンポーネントのテスト（.tsx）は jsdom で動かす（10.2）
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.test.ts'], environment: 'node' }
      },
      {
        extends: true,
        test: {
          name: 'component',
          include: ['tests/unit/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['tests/setup/component.ts']
        }
      },
      {
        // 10.2 の「データ」：コミットされた地図データ（T1-05）などの全体を検査する
        extends: true,
        test: { name: 'data', include: ['tests/data/**/*.test.ts'], environment: 'node' }
      }
    ],
    coverage: {
      provider: 'v8',
      // app/ はE2E（T0-02）で確かめるので対象外。scripts/ はデプロイの中身を決めるので対象にする（T0-03、R7）
      // geo/scripts/ は地図データの名前・形を決めるので対象にする（T1-02）
      include: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts', 'geo/scripts/**/*.ts'],
      thresholds: {
        ...OVERALL,
        'src/lib/**': DOMAIN,
        'src/features/**': DOMAIN,
        'geo/scripts/lib/**': DOMAIN
      }
    }
  }
});
