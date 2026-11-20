import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from 'next/constants';
import { describe, expect, it } from 'vitest';
import nextConfig from '../../../next.config';

describe('next.config.ts のフェーズ別設定（F-I18N-02）', () => {
  it('開発サーバーでは / を日本語トップへ一時転送する', async () => {
    const config = nextConfig(PHASE_DEVELOPMENT_SERVER);

    await expect(config.redirects?.()).resolves.toEqual([{ source: '/', destination: '/ja/', permanent: false }]);
  });

  it('静的ビルドでは開発用リダイレクトを含めない', async () => {
    const config = nextConfig(PHASE_PRODUCTION_BUILD);

    expect(config.output).toBe('export');
    expect(config.redirects).toBeUndefined();
  });
});
