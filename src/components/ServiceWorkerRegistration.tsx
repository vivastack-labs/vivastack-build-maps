'use client';

import { useEffect } from 'react';

/** Service Worker の場所と範囲。`sw.js` は `scripts/postbuild.ts` が `dist/` の直下に作る（U13、D41） */
const SERVICE_WORKER_URL = '/sw.js';
const SERVICE_WORKER_OPTIONS: RegistrationOptions = { scope: '/' };

/**
 * Service Worker を登録する（T4-02、5.4、D40）。DOM を出さない。Next.js の JS のチャンク（外部ファイル）から行うので、インラインスクリプトは増えない（5.5）。
 * ページの読み込みが終わってから登録する（インストールのプリキャッシュが、ページの読み込みと通信を取り合わないように）。
 * 開発（`pnpm dev`。`sw.js` がない）と、Service Worker のないブラウザでは何もしない。登録の失敗は利用者に伝えることがないので、握りつぶす（オフラインで使えないだけで、ふだんの表示は変わらない）。
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    const register = (): void => {
      navigator.serviceWorker.register(SERVICE_WORKER_URL, SERVICE_WORKER_OPTIONS).catch(() => undefined);
    };
    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register, { once: true });
    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
