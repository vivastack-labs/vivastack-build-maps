// T4-02、5.4、U3・U13、D40・D41：dist/sw.js（Service Worker）を workbox-build の generateSW で作る。自分で Service Worker のコードを書かない。
// scripts/postbuild.ts が、CSP を書いた後（writePageCsp）に呼ぶ（プリキャッシュの版を、配信する HTML の内容から求めるため）。
// 相対の import には .ts を付ける（postbuild.ts が Node.js で直接読む）。
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import workboxBuild from 'workbox-build';
import type { ManifestTransform } from 'workbox-build';
import { LANGS } from '../src/i18n/lang.ts';

/** 市区町村データ（`/geo/muni/NN.topo.json`。T2-07）の実行時のキャッシュの名前と、持つ数の上限（47都道府県） */
const MUNI_CACHE = { name: 'maps-muni', maxEntries: 47 } as const;
/** カードの内容（`/cards/{lang}/NN.json`。T3-09）の実行時のキャッシュの名前と、持つ数の上限（47県 × 3言語） */
const CARD_CACHE = { name: 'maps-cards', maxEntries: 141 } as const;

/** プリキャッシュする、`dist/` の中のファイル（アプリの枠組み。D40）。RSC の `*.txt`・404・`cards/`・`geo/`・`_headers`・`_redirects`・ソースマップは入れない */
const PRECACHE_PATTERNS: readonly string[] = [`{${LANGS.join(',')}}/index.html`, `{${LANGS.join(',')}}/app.webmanifest`, '_next/static/**/*.{js,css}', 'icons/*'];

/**
 * NetworkFirst がキャッシュに切り替えるまでの待ち時間（秒）。つながっているのに通信が進まないとき（`navigator.onLine` は true）に、
 * 読み込みの打ち切り（`FETCH_TIMEOUT_MS` の15秒）より先にキャッシュを返すため。キャッシュがなければ、時間が切れてもネットワークを待ち続ける（初回の読み込み・大きいデータは失敗しない）。
 */
const NETWORK_TIMEOUT_SECONDS = 4;

/** `_next/static/` のファイルは名前に内容のハッシュ（ビルド ID）が入っているので、版（revision）を付けない */
const HASHED_FILES = /^_next\/static\//u;

/** `sw.js` を作った結果：プリキャッシュしたファイルの数と、その大きさ（圧縮前のバイト数） */
export type ServiceWorkerResult = { readonly count: number; readonly size: number };

// 失敗したら捨てる必要がないよう、ファイルを書く前に、3言語の HTML があることを確かめる
const assertLanguagePages = (distDir: string): void => {
  const missing = LANGS.map(lang => `${lang}/index.html`).filter(path => !existsSync(join(distDir, path)));
  if (missing.length > 0) {
    throw new Error(`${distDir} に ${missing.join('・')} がありません（オフラインで開けなくなるので、sw.js を作りません）`);
  }
};

/**
 * プリキャッシュの URL の `xx/index.html` を `xx/` にする。Workers の静的配信（既定の auto-trailing-slash）では `/ja/index.html` は `/ja/` へ転送されるので、
 * ナビゲーションの URL（`/ja/`）とキャッシュのキーを合わせる（転送の応答はプリキャッシュに入らない）。版（revision）はファイルの内容のハッシュのまま。
 */
const toDirectoryUrl: ManifestTransform = entries => ({
  manifest: entries.map(entry => (entry.url.endsWith('/index.html') ? { ...entry, url: entry.url.slice(0, -'index.html'.length) } : entry))
});

/**
 * `dist/sw.js`（1ファイル。`workbox-*.js` を別に置かない）を作る。
 * - アプリの枠組み（3言語の HTML・manifest・`_next/static/` の JS・CSS・アイコン）を、インストールのときにプリキャッシュする。HTML の版は、CSP を書いた後の内容のハッシュ。
 * - 市区町村・カードの JSON は、一度読んだものだけを NetworkFirst で持つ（オンラインでは今までどおりネットワークから読み、失敗したときだけキャッシュから返す。成功した 200 の応答だけを入れる）。
 * - `skipWaiting`・`clientsClaim`：最初に開いたページも、インストールが終わったらすぐ Service Worker を通る。古いプリキャッシュは削除する。
 * 3言語の HTML がない・大きさの上限などでプリキャッシュから外れたファイルがある（workbox の警告）ときは例外（オフラインの範囲が黙って小さくならないように）。
 */
export const writeServiceWorker = async (distDir: string): Promise<ServiceWorkerResult> => {
  assertLanguagePages(distDir);
  const { count, size, warnings } = await workboxBuild.generateSW({
    globDirectory: distDir,
    globPatterns: [...PRECACHE_PATTERNS],
    swDest: join(distDir, 'sw.js'),
    dontCacheBustURLsMatching: HASHED_FILES,
    inlineWorkboxRuntime: true,
    sourcemap: false,
    mode: 'production',
    skipWaiting: true,
    clientsClaim: true,
    cleanupOutdatedCaches: true,
    manifestTransforms: [toDirectoryUrl],
    runtimeCaching: [
      {
        // 同じオリジンだけ（RegExp は、別のオリジンでは URL の先頭から一致するものだけを受ける）
        urlPattern: /\/geo\/muni\/\d{2}\.topo\.json$/u,
        handler: 'NetworkFirst',
        options: { cacheName: MUNI_CACHE.name, networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS, expiration: { maxEntries: MUNI_CACHE.maxEntries }, cacheableResponse: { statuses: [200] } }
      },
      {
        urlPattern: new RegExp(`/cards/(${LANGS.join('|')})/\\d{2}\\.json$`, 'u'),
        handler: 'NetworkFirst',
        options: { cacheName: CARD_CACHE.name, networkTimeoutSeconds: NETWORK_TIMEOUT_SECONDS, expiration: { maxEntries: CARD_CACHE.maxEntries }, cacheableResponse: { statuses: [200] } }
      }
    ]
  });
  if (warnings.length > 0) {
    throw new Error(`sw.js のプリキャッシュで警告が出ました：${warnings.join('／')}`);
  }
  return { count, size };
};
