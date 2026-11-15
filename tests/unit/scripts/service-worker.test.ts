import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { writeServiceWorker } from '../../../scripts/service-worker';

// T4-02、5.4、D40・D41：dist/sw.js（workbox-build の generateSW）。アプリの枠組みだけをプリキャッシュし、市区町村・カードの JSON は一度読んだものだけを NetworkFirst で持つ
describe('writeServiceWorker', () => {
  let dist: string;

  const put = (path: string, body: string): void => {
    mkdirSync(dirname(join(dist, path)), { recursive: true });
    writeFileSync(join(dist, path), body);
  };

  /** 本物の dist/ に近い小さな dist/（プリキャッシュする・しないものが両方ある） */
  const putFixtureDist = (): void => {
    for (const lang of ['ja', 'en', 'zh']) {
      put(`${lang}/index.html`, `<html lang="${lang}">${lang}</html>`);
      put(`${lang}/index.txt`, 'rsc');
      put(`${lang}/__next._full.txt`, 'rsc');
      put(`${lang}/app.webmanifest`, `{"id":"/${lang}/"}`);
      put(`cards/${lang}/01.json`, '{}');
    }
    put('404.html', '404');
    put('404/index.html', '404');
    put('_not-found/index.html', '404');
    put('_next/static/chunks/0abc.js', 'js');
    put('_next/static/chunks/0abc.css', 'css');
    put('_next/static/build-id/_buildManifest.js', 'js');
    put('_next/static/chunks/0abc.js.map', 'map');
    put('geo/muni/01.topo.json', '{}');
    put('icons/icon-192.png', 'png');
    put('_headers', 'h');
    put('_redirects', 'r');
  };

  const precacheUrls = (): readonly string[] => [...readFileSync(join(dist, 'sw.js'), 'utf8').matchAll(/\{url:"([^"]+)",revision:/gu)].map(match => match[1] ?? '').sort();

  beforeEach(() => {
    dist = mkdtempSync(join(tmpdir(), 'sw-'));
  });

  afterEach(() => {
    rmSync(dist, { recursive: true, force: true });
  });

  test('U13：アプリの枠組み（3言語の HTML・manifest・JS・CSS・アイコン）だけをプリキャッシュする', async () => {
    // Arrange
    putFixtureDist();

    // Act
    await writeServiceWorker(dist);

    // Assert：RSC の txt・404・カード・市区町村・_headers・_redirects・ソースマップは入らない
    expect(precacheUrls()).toEqual([
      '_next/static/build-id/_buildManifest.js',
      '_next/static/chunks/0abc.css',
      '_next/static/chunks/0abc.js',
      'en/app.webmanifest',
      'en/index.html',
      'icons/icon-192.png',
      'ja/app.webmanifest',
      'ja/index.html',
      'zh/app.webmanifest',
      'zh/index.html'
    ]);
  });

  test('U13：sw.js 1つにまとめ、workbox-*.js を別に置かない（inlineWorkboxRuntime）', async () => {
    // Arrange
    putFixtureDist();

    // Act
    await writeServiceWorker(dist);

    // Assert
    expect(readdirSync(dist).filter(name => name.endsWith('.js'))).toEqual(['sw.js']);
    expect(existsSync(join(dist, 'sw.js.map'))).toBe(false);
  });

  test('U3・D40：市区町村とカードの JSON は、一度読んだものだけを実行時にキャッシュする（プリキャッシュしない）', async () => {
    // Arrange
    putFixtureDist();

    // Act
    await writeServiceWorker(dist);

    // Assert：実行時のキャッシュの名前と、URL の規則（同じオリジンの /geo/muni/NN.topo.json・/cards/{lang}/NN.json）
    const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
    expect(sw).toContain('maps-muni');
    expect(sw).toContain('maps-cards');
    expect(sw).toMatch(/geo\\?\/muni\\?\/\\d\{2\}\\\.topo\\\.json/u);
    expect(sw).toMatch(/cards\\?\/\(ja\|en\|zh\)\\?\/\\d\{2\}\\\.json/u);
    expect(precacheUrls().some(url => url.startsWith('cards/') || url.startsWith('geo/'))).toBe(false);
  });

  test('D40：新しい Service Worker はすぐ有効になる（skipWaiting・clientsClaim）', async () => {
    // Arrange
    putFixtureDist();

    // Act
    await writeServiceWorker(dist);

    // Assert
    const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
    expect(sw).toContain('skipWaiting()');
    expect(sw).toContain('self.clients.claim()');
  });

  test('U13：プリキャッシュの版（revision）は、dist/ の HTML の内容のハッシュ。JS・CSS は名前にハッシュがあるので版を付けない', async () => {
    // Arrange
    putFixtureDist();
    const html = readFileSync(join(dist, 'ja/index.html'));

    // Act
    await writeServiceWorker(dist);

    // Assert
    const sw = readFileSync(join(dist, 'sw.js'), 'utf8');
    expect(sw).toContain(`{url:"ja/index.html",revision:"${createHash('md5').update(html).digest('hex')}"}`);
    expect(sw).toContain('{url:"_next/static/chunks/0abc.js",revision:null}');
  });

  test('U13：書いたファイル数とプリキャッシュの数を返す', async () => {
    // Arrange
    putFixtureDist();

    // Act
    const result = await writeServiceWorker(dist);

    // Assert
    expect(result.count).toBe(10);
    expect(result.size).toBeGreaterThan(0);
  });

  test('U13：3言語のどれかの HTML がなければ、オフラインで開けなくなるので例外にする', async () => {
    // Arrange
    putFixtureDist();
    rmSync(join(dist, 'zh/index.html'));

    // Act・Assert
    await expect(writeServiceWorker(dist)).rejects.toThrow('zh/index.html');
    expect(existsSync(join(dist, 'sw.js'))).toBe(false);
  });

  test('U13：大きすぎてプリキャッシュから外れたファイルがあれば（workbox の警告）、例外にする', async () => {
    // Arrange：既定の上限（2MB）を超える HTML
    putFixtureDist();
    put('ja/index.html', `<html>${'a'.repeat(2 * 1024 * 1024 + 1)}</html>`);

    // Act・Assert
    await expect(writeServiceWorker(dist)).rejects.toThrow('ja/index.html');
  });
});
