import type { NextConfig } from 'next';

// 6.2・6.4：静的出力を /maps の下で配信する
const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/maps',
  trailingSlash: true,
  // next dev が AGENTS.md に英語の指示を自動で書き込まないようにする。同じ内容は AGENTS.md に日本語で書いている
  agentRules: false
};

export default nextConfig;
