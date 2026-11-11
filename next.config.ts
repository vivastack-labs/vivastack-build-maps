import type { NextConfig } from 'next';

// 6.2・6.4：静的出力を /maps の下で配信する
const nextConfig: NextConfig = {
  output: 'export',
  basePath: '/maps',
  trailingSlash: true
};

export default nextConfig;
