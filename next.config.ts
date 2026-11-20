import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';
import type { NextConfig } from 'next';
import { langPath } from './src/i18n/lang';

// 6.2・6.4・D35：静的出力を専用のドメインのルートで配信する（basePath は付けない）
const sharedConfig: NextConfig = {
  trailingSlash: true,
  // T0-03・5.2：存在しないパスの404にも <html lang> を付ける（app/global-not-found.tsx）
  experimental: { globalNotFound: true },
  // next dev が AGENTS.md に英語の指示を自動で書き込まないようにする。同じ内容は AGENTS.md に日本語で書いている
  agentRules: false
};

/** F-I18N-02：開発ではルートを日本語トップへ転送し、静的ビルドでは Workers のリダイレクトを使う。 */
export default function nextConfig(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      ...sharedConfig,
      async redirects() {
        return [{ source: '/', destination: langPath('ja'), permanent: false }];
      }
    };
  }

  return { ...sharedConfig, output: 'export' };
}
