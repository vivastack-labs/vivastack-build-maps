import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import {
  checkLink,
  collectLinks,
  formatReport,
  parsePrefectureFilter,
  runChecks,
  runLinkCheck,
  type CheckedLink,
  type LinkFetch,
  type LinkOutcome,
  NOT_HTTPS_NOTE,
  type LinkResponse
} from '../../../scripts/lib/link-check';
import type { Prefecture } from '../../../src/lib/content';

const source = (url: string) => ({ title: 'テスト', url, accessed: '2026-11-01' });
const localized = { ja: 'あ', en: 'a', zh: '啊' };
const description = { ja: { kids: 'あ', adult: 'あ' }, en: { kids: 'a', adult: 'a' }, zh: { kids: '啊', adult: '啊' } };

/** 出典の URL だけを指定して、県を作る */
function prefecture(
  code: string,
  id: string,
  urls: { access?: readonly string[]; specialties?: Readonly<Record<string, readonly string[]>>; spots?: Readonly<Record<string, readonly string[]>> } = {}
): Prefecture {
  const item = (itemId: string, itemUrls: readonly string[]) => ({
    id: itemId,
    emoji: '🍎',
    name: localized,
    description,
    sources: itemUrls.map(source),
    status: 'draft' as const
  });
  return {
    id,
    code,
    region: 'kinki',
    name: localized,
    capital: { name: localized, lat: 35, lon: 135 },
    ...(urls.access === undefined ? {} : { access: { emoji: '🚄', mode: localized, route: localized, durationMin: 60, sources: urls.access.map(source), status: 'draft' as const } }),
    specialties: Object.entries(urls.specialties ?? {}).map(([itemId, itemUrls]) => item(itemId, itemUrls)),
    spots: Object.entries(urls.spots ?? {}).map(([itemId, itemUrls]) => item(itemId, itemUrls))
  };
}

/** 偽の fetch の応答。本文は読まれず、cancel が呼ばれる */
function response(status: number, options: { url?: string; redirected?: boolean } = {}): LinkResponse & { cancel: ReturnType<typeof vi.fn> } {
  const cancel = vi.fn(async () => undefined);
  return { status, url: options.url ?? 'https://example.com/a', redirected: options.redirected ?? false, body: { cancel }, cancel };
}

const fetchReturning =
  (res: LinkResponse): LinkFetch =>
  async () =>
    res;
const fetchRejecting =
  (error: unknown): LinkFetch =>
  async () => {
    throw error;
  };
const options = (fetch: LinkFetch) => ({ fetch, timeoutMs: 20_000, userAgent: 'test-agent/1.0' });

describe('checkLink', () => {
  test('12.4 200 を ok に分類する', async () => {
    await expect(checkLink('https://example.com/a', options(fetchReturning(response(200))))).resolves.toEqual({ kind: 'ok', status: 200 });
  });

  test('12.4 301 → 200（リダイレクトあり）を redirected に分類し、最終の URL を記録する', async () => {
    const res = response(200, { url: 'https://example.com/new', redirected: true });

    await expect(checkLink('https://example.com/old', options(fetchReturning(res)))).resolves.toEqual({ kind: 'redirected', status: 200, finalUrl: 'https://example.com/new' });
  });

  test('12.4 リダイレクト先が https でなければ、redirected のまま、理由に「https でない」を添える（SSRF の注意）', async () => {
    const res = response(200, { url: 'http://169.254.169.254/latest/', redirected: true });

    const outcome = await checkLink('https://example.com/old', options(fetchReturning(res)));

    expect(outcome).toMatchObject({ kind: 'redirected', status: 200, finalUrl: 'http://169.254.169.254/latest/' });
    expect(outcome.reason).toContain('https でない');
  });

  test('12.4 リダイレクト先が https なら、理由は付けない', async () => {
    const outcome = await checkLink('https://example.com/old', options(fetchReturning(response(200, { url: 'https://example.com/new', redirected: true }))));

    expect(outcome.reason).toBeUndefined();
  });

  test.each([
    [404, 'broken'],
    [500, 'http-error']
  ])('12.4 リダイレクト先が https でなく、そこで %i が返ったときも、最終の URL を残し、https でない注意を添える（分類は %s のまま）', async (status, kind) => {
    const res = response(status, { url: 'http://169.254.169.254/latest/', redirected: true });

    await expect(checkLink('https://example.com/old', options(fetchReturning(res)))).resolves.toEqual({ kind, status, finalUrl: 'http://169.254.169.254/latest/', reason: NOT_HTTPS_NOTE });
  });

  test('12.4 リダイレクト先が https で 404 が返ったときは、最終の URL を残し、注意は付けない', async () => {
    const res = response(404, { url: 'https://example.com/moved', redirected: true });

    await expect(checkLink('https://example.com/old', options(fetchReturning(res)))).resolves.toEqual({ kind: 'broken', status: 404, finalUrl: 'https://example.com/moved' });
  });

  test.each([404, 410])('12.4 %i を broken（リンク切れ）に分類する', async status => {
    await expect(checkLink('https://example.com/a', options(fetchReturning(response(status))))).resolves.toEqual({ kind: 'broken', status });
  });

  test.each([403, 429, 500, 503])('12.4 %i を http-error（要確認）に分類する', async status => {
    await expect(checkLink('https://example.com/a', options(fetchReturning(response(status))))).resolves.toEqual({ kind: 'http-error', status });
  });

  test('12.4 タイムアウト（TimeoutError）を timeout に分類する', async () => {
    const error = new DOMException('The operation was aborted due to timeout', 'TimeoutError');

    await expect(checkLink('https://example.com/a', options(fetchRejecting(error)))).resolves.toEqual({ kind: 'timeout' });
  });

  test('12.4 DNS・証明書の失敗を network-error に分類し、理由（cause の code）を添える', async () => {
    const dns = new TypeError('fetch failed', { cause: Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }) });
    const tls = new TypeError('fetch failed', { cause: Object.assign(new Error('certificate has expired'), { code: 'CERT_HAS_EXPIRED' }) });

    await expect(checkLink('https://example.com/a', options(fetchRejecting(dns)))).resolves.toEqual({ kind: 'network-error', reason: 'ENOTFOUND' });
    await expect(checkLink('https://example.com/a', options(fetchRejecting(tls)))).resolves.toEqual({ kind: 'network-error', reason: 'CERT_HAS_EXPIRED' });
  });

  test('12.4 cause が Error で code がなければ、cause のメッセージを理由にする（リダイレクトの回数の超過など）', async () => {
    const error = new TypeError('fetch failed', { cause: new Error('redirect count exceeded') });

    await expect(checkLink('https://example.com/a', options(fetchRejecting(error)))).resolves.toEqual({ kind: 'network-error', reason: 'redirect count exceeded' });
  });

  test('12.4 タイムアウトの設定（timeoutMs）が、AbortSignal.timeout に渡される', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout');

    await checkLink('https://example.com/a', { ...options(fetchReturning(response(200))), timeoutMs: 1234 });

    expect(spy).toHaveBeenCalledWith(1234);
    spy.mockRestore();
  });

  test('12.4 cause がない失敗は、メッセージを理由にする。Error でない値も文字列にする', async () => {
    await expect(checkLink('https://example.com/a', options(fetchRejecting(new TypeError('Invalid URL'))))).resolves.toEqual({ kind: 'network-error', reason: 'Invalid URL' });
    await expect(checkLink('https://example.com/a', options(fetchRejecting('boom')))).resolves.toEqual({ kind: 'network-error', reason: 'boom' });
  });

  test('12.4 本文を読まずに捨てる（body.cancel が呼ばれる）。GET・リダイレクトを辿る・User-Agent・タイムアウトの signal を渡す', async () => {
    const res = response(200);
    const fetch = vi.fn<LinkFetch>(async () => res);

    await checkLink('https://example.com/a', options(fetch));

    expect(res.cancel).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://example.com/a');
    expect(init).toMatchObject({ method: 'GET', redirect: 'follow', headers: { 'User-Agent': 'test-agent/1.0' } });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  test('12.4 本文がない応答でも分類できる。cancel が失敗しても結果は変わらない', async () => {
    await expect(checkLink('https://example.com/a', options(fetchReturning({ status: 200, url: 'https://example.com/a', redirected: false, body: null })))).resolves.toEqual({
      kind: 'ok',
      status: 200
    });
    const failing: LinkResponse = { status: 404, url: 'https://example.com/a', redirected: false, body: { cancel: async () => Promise.reject(new Error('x')) } };

    await expect(checkLink('https://example.com/a', options(fetchReturning(failing)))).resolves.toEqual({ kind: 'broken', status: 404 });
  });
});

describe('collectLinks', () => {
  const prefectures = [
    prefecture('13', 'tokyo', { access: ['https://example.com/shared'], specialties: { monja: ['https://example.com/monja'] } }),
    prefecture('26', 'kyoto', { specialties: { 'uji-tea': ['https://example.com/shared', 'https://example.com/tea'] }, spots: { kiyomizu: ['https://example.com/shared'] } })
  ];

  test('12.4 出典の URL を集める。同じ URL は1つにまとめ、使われている場所をすべて残す', () => {
    const links = collectLinks(prefectures);

    expect(links.map(link => link.url)).toEqual(['https://example.com/shared', 'https://example.com/monja', 'https://example.com/tea']);
    expect(links[0]!.usages).toEqual(['13-tokyo access', '26-kyoto specialties/uji-tea', '26-kyoto spots/kiyomizu']);
  });

  test('12.4 県のコードを指定すると、その県の URL だけを集める（ほかの県でだけ使われる URL は含めない）', () => {
    const links = collectLinks(prefectures, ['26']);

    expect(links.map(link => link.url)).toEqual(['https://example.com/shared', 'https://example.com/tea']);
    expect(links[0]!.usages).toEqual(['26-kyoto specialties/uji-tea', '26-kyoto spots/kiyomizu']);
  });

  test('12.4 出典がなければ空', () => {
    expect(collectLinks([prefecture('01', 'hokkaido')])).toEqual([]);
  });
});

describe('parsePrefectureFilter', () => {
  const prefectures = [prefecture('13', 'tokyo'), prefecture('26', 'kyoto'), prefecture('27', 'osaka')];

  test('12.4 県のコードと id を、カンマ・空白で区切って受け取り、コードにする', () => {
    expect(parsePrefectureFilter('26,tokyo 27', prefectures)).toEqual(['26', '13', '27']);
  });

  test('12.4 空（または空白だけ）は全県（空の配列）。同じ県を2回書いても1つにする', () => {
    expect(parsePrefectureFilter('', prefectures)).toEqual([]);
    expect(parsePrefectureFilter('  , ', prefectures)).toEqual([]);
    expect(parsePrefectureFilter('26,kyoto', prefectures)).toEqual(['26']);
  });

  test('12.4 知らない県はエラー（打ち間違いで「0件・すべて正常」にならない）', () => {
    expect(() => parsePrefectureFilter('26,kyouto', prefectures)).toThrow('kyouto');
  });
});

describe('runChecks', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
  const links = (urls: readonly string[]) => urls.map(url => ({ url, usages: [`u ${url}`] }));

  /** durationMs（既定は 10ms）かかる check。開始・終了の時刻と、同時に動いた最大数（全体・ホストごと）を記録する */
  function recordingCheck(durationMs = 10) {
    const starts = new Map<string, number>();
    const ends = new Map<string, number>();
    const state = { running: 0, maxRunning: 0, maxRunningPerHost: 0 };
    const runningByHost = new Map<string, number>();
    const check = async (url: string): Promise<LinkOutcome> => {
      const host = new URL(url).host;
      starts.set(url, Date.now());
      state.running += 1;
      runningByHost.set(host, (runningByHost.get(host) ?? 0) + 1);
      state.maxRunning = Math.max(state.maxRunning, state.running);
      state.maxRunningPerHost = Math.max(state.maxRunningPerHost, runningByHost.get(host)!);
      await sleep(durationMs);
      state.running -= 1;
      runningByHost.set(host, runningByHost.get(host)! - 1);
      ends.set(url, Date.now());
      return { kind: 'ok', status: 200 };
    };
    return { check, starts, ends, state };
  }

  async function run(urls: readonly string[], settings: { concurrency: number; hostIntervalMs: number }, check: (url: string) => Promise<LinkOutcome>) {
    const promise = runChecks(links(urls), { check, now: () => Date.now(), sleep, ...settings });
    await vi.runAllTimersAsync();
    return promise;
  }

  test('12.4 結果は入力と同じ順に返し、使われている場所を引き継ぐ', async () => {
    const { check } = recordingCheck();
    const spy = vi.fn(check);

    const results = await run(['https://a.example/1', 'https://b.example/2', 'https://c.example/3'], { concurrency: 2, hostIntervalMs: 0 }, spy);

    expect(results.map(result => result.url)).toEqual(['https://a.example/1', 'https://b.example/2', 'https://c.example/3']);
    expect(results[1]).toEqual({ url: 'https://b.example/2', usages: ['u https://b.example/2'], outcome: { kind: 'ok', status: 200 } });
    expect(spy).toHaveBeenCalledTimes(3);
  });

  test('12.4 同時に確かめる数が上限を超えない', async () => {
    const { check, state } = recordingCheck();
    const urls = Array.from({ length: 10 }, (_, index) => `https://host${index}.example/`);

    await run(urls, { concurrency: 3, hostIntervalMs: 0 }, check);

    expect(state.maxRunning).toBe(3);
  });

  test('12.4 同じホストへの間隔が設定より短くならない', async () => {
    const { check, starts } = recordingCheck();
    const urls = ['https://a.example/1', 'https://a.example/2', 'https://a.example/3'];

    await run(urls, { concurrency: 3, hostIntervalMs: 2000 }, check);

    const times = urls.map(url => starts.get(url)!).sort((x, y) => x - y);
    expect(times[1]! - times[0]!).toBeGreaterThanOrEqual(2000);
    expect(times[2]! - times[1]!).toBeGreaterThanOrEqual(2000);
  });

  test('12.4 同じホストへは同時に1件だけ送る（応答が間隔より遅くても、重ならない）', async () => {
    const { check, state } = recordingCheck(5000);

    await run(['https://a.example/1', 'https://a.example/2', 'https://a.example/3'], { concurrency: 4, hostIntervalMs: 2000 }, check);

    expect(state.maxRunningPerHost).toBe(1);
  });

  test('12.4 同じホストでは、前の応答が終わった時刻から間隔をあける', async () => {
    const { check, starts, ends } = recordingCheck(500);

    await run(['https://a.example/1', 'https://a.example/2'], { concurrency: 2, hostIntervalMs: 2000 }, check);

    expect(starts.get('https://a.example/2')! - ends.get('https://a.example/1')!).toBeGreaterThanOrEqual(2000);
  });

  test('12.4 同じホストの URL が続いても、別のホストの URL は待たされない（作業が止まらない）', async () => {
    const { check, starts } = recordingCheck();
    const begin = Date.now();

    await run(['https://a.example/1', 'https://a.example/2', 'https://a.example/3', 'https://b.example/1'], { concurrency: 2, hostIntervalMs: 2000 }, check);

    expect(starts.get('https://b.example/1')).toBe(begin);
  });

  test('12.4 別のホストは待たない（同時に始まる）', async () => {
    const { check, starts } = recordingCheck();

    await run(['https://a.example/1', 'https://b.example/1', 'https://c.example/1'], { concurrency: 3, hostIntervalMs: 2000 }, check);

    expect(new Set(starts.values()).size).toBe(1);
  });

  test('12.4 リンクがなければ、何も確かめずに空を返す', async () => {
    const { check } = recordingCheck();
    const spy = vi.fn(check);

    await expect(run([], { concurrency: 4, hostIntervalMs: 2000 }, spy)).resolves.toEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('formatReport', () => {
  const meta = { generatedAt: new Date('2026-11-17T09:30:00Z'), prefectures: [] as readonly string[] };
  const checked = (url: string, outcome: LinkOutcome, usages: readonly string[] = ['26-kyoto access']): CheckedLink => ({ url, usages, outcome });

  test('12.4 まとめ（実行日時・対象の県・件数）と、リンク切れ・要確認の表を出す', () => {
    const report = formatReport(
      [
        checked('https://example.com/ok', { kind: 'ok', status: 200 }),
        checked('https://example.com/gone', { kind: 'broken', status: 404 }, ['26-kyoto access', '13-tokyo spots/x']),
        checked('https://example.com/old', { kind: 'redirected', status: 200, finalUrl: 'https://example.com/new' }),
        checked('https://example.com/slow', { kind: 'timeout' }),
        checked('https://bad.example/', { kind: 'network-error', reason: 'ENOTFOUND' }),
        checked('https://example.com/deny', { kind: 'http-error', status: 403 })
      ],
      { ...meta, prefectures: ['26-kyoto'] }
    );

    expect(report).toContain('# 出典のリンク切れチェック');
    expect(report).toContain('2026-11-17T09:30:00.000Z');
    expect(report).toContain('26-kyoto');
    expect(report).toContain('確かめた URL：6件');
    expect(report).toMatch(/## リンク切れ（1件）[\s\S]*\| 404 \| `https:\/\/example\.com\/gone` \|[\s\S]*26-kyoto access<br>13-tokyo spots\/x/u);
    expect(report).toMatch(/## 要確認（4件）/u);
    expect(report).toContain('`https://example.com/new`');
    expect(report).toContain('`ENOTFOUND`');
    expect(report).toContain('| 403 |');
    expect(report).not.toContain('https://example.com/ok');
  });

  test('12.4 対象の県が空なら「全県」と書く', () => {
    expect(formatReport([], meta)).toContain('全県');
  });

  test('12.4 問題がなければ「問題なし」と書き、表は出さない', () => {
    const report = formatReport([checked('https://example.com/ok', { kind: 'ok', status: 200 })], meta);

    expect(report).toContain('問題なし');
    expect(report).not.toContain('| 分類 | HTTP |');
  });

  test('12.4 URL が0件なら、そう書く', () => {
    expect(formatReport([], meta)).toContain('確かめた URL：0件');
    expect(formatReport([], meta)).toContain('出典の URL がありません');
  });

  test('12.4 表の中の | と改行は、表が崩れないように直す', () => {
    const report = formatReport([checked('https://example.com/a|b', { kind: 'network-error', reason: 'line1\nline2' })], meta);

    expect(report).toContain('`https://example.com/a\\|b`');
    expect(report).toContain('`line1 line2`');
  });

  test('12.4 バックスラッシュの直後の | でも表が割れない（バックスラッシュを %5C にしてから、| を \| にする）', () => {
    const report = formatReport([checked('https://example.com/a\\|b', { kind: 'broken', status: 404 })], meta);

    expect(report).toContain('`https://example.com/a%5C\\|b`');
  });

  test('12.4 リダイレクト先が決めた文字列（リンク・強調の記法）は、コードスパンで囲んで、そのまま見せる', () => {
    const finalUrl = 'https://evil.example/[x](https://evil.example/)*a*_b_<script>';
    const report = formatReport([checked('https://example.com/old', { kind: 'redirected', status: 200, finalUrl })], meta);

    expect(report).toContain(`\`${finalUrl}\``);
  });

  test('12.4 中にバッククォートがあれば、それより長い囲みにする（端にあれば空白を足す）', () => {
    const report = formatReport(
      [checked('https://example.com/a', { kind: 'redirected', status: 200, finalUrl: 'https://e.example/a`b``c' }), checked('https://example.com/b', { kind: 'network-error', reason: '`start' })],
      meta
    );

    expect(report).toContain('```https://e.example/a`b``c```');
    expect(report).toContain('`` `start ``');
  });

  test('12.4 理由は200字で切る（相手が長い文字列を返しても、レポートが膨らまない）', () => {
    const report = formatReport([checked('https://example.com/a', { kind: 'network-error', reason: 'x'.repeat(300) })], meta);

    expect(report).toContain(`\`${'x'.repeat(200)}…\``);
    expect(report).not.toContain('x'.repeat(201));
  });
});

describe('runLinkCheck', () => {
  const prefectures = [
    prefecture('13', 'tokyo', { access: ['https://example.com/ok'] }),
    prefecture('26', 'kyoto', { specialties: { 'uji-tea': ['https://example.com/gone', 'https://example.com/deny'] } })
  ];
  const statusByUrl: Readonly<Record<string, number>> = { 'https://example.com/ok': 200, 'https://example.com/gone': 404, 'https://example.com/deny': 403 };

  function setup(overrides: { prefectures?: readonly Prefecture[]; statuses?: Readonly<Record<string, number>>; load?: () => readonly Prefecture[] } = {}) {
    const out: string[] = [];
    const err: string[] = [];
    const files = new Map<string, string>();
    const statuses = overrides.statuses ?? statusByUrl;
    // 待つと、その分だけ時刻が進む（待ちが終わらない無限ループにならないように）
    const clock = { time: Date.UTC(2026, 10, 17) };
    const fetch = vi.fn<LinkFetch>(async url => response(statuses[url] ?? 200, { url }));
    const deps = {
      contentDir: 'content/prefectures',
      loadContent: overrides.load ?? (() => overrides.prefectures ?? prefectures),
      fetch,
      now: () => clock.time,
      sleep: async (ms: number) => {
        clock.time += ms;
      },
      writeOut: (text: string) => void out.push(text),
      writeErr: (line: string) => void err.push(line),
      writeFile: (path: string, text: string) => void files.set(path, text)
    };
    return { deps, out, err, files, fetch };
  }

  test('12.4 2県が同じ URL を使っていても、その URL は1回だけ確かめ、レポートの「使われている場所」に両方を出す', async () => {
    const shared = 'https://example.com/shared';
    const { deps, out, fetch } = setup({
      prefectures: [prefecture('13', 'tokyo', { access: [shared] }), prefecture('26', 'kyoto', { specialties: { 'uji-tea': [shared] } })],
      statuses: { [shared]: 404 }
    });

    await runLinkCheck([], deps);

    expect(fetch.mock.calls.map(([url]) => url)).toEqual([shared]);
    expect(out.join('\n')).toContain('13-tokyo access<br>26-kyoto specialties/uji-tea');
  });

  test('12.4 タイムアウトは 20 秒で確かめる', async () => {
    const spy = vi.spyOn(AbortSignal, 'timeout');
    const { deps } = setup();

    await runLinkCheck(['--pref', '13'], deps);

    expect(spy).toHaveBeenCalledWith(20_000);
    spy.mockRestore();
  });

  test('12.4 思わぬ例外は、メッセージを出して終了コード 2（リンク切れの 1 と区別する）', async () => {
    const { deps, err } = setup();

    const code = await runLinkCheck([], {
      ...deps,
      sleep: async () => {
        throw new Error('sleep が壊れた');
      }
    });

    expect(code).toBe(2);
    expect(err.join('\n')).toContain('sleep が壊れた');
  });

  test('12.4 リンク切れ（404）があれば終了コード 1。レポートを標準出力に出し、進み具合は標準エラーに出す', async () => {
    const { deps, out, err } = setup();

    await expect(runLinkCheck([], deps)).resolves.toBe(1);

    expect(out.join('\n')).toContain('## リンク切れ（1件）');
    expect(err.length).toBeGreaterThanOrEqual(3);
  });

  test('12.4 要確認（403）だけなら終了コード 0', async () => {
    const { deps, out } = setup({ statuses: { ...statusByUrl, 'https://example.com/gone': 200 } });

    await expect(runLinkCheck([], deps)).resolves.toBe(0);

    expect(out.join('\n')).toContain('## 要確認（1件）');
  });

  test('12.4 --pref で指定した県の URL だけを確かめる', async () => {
    const { deps, fetch } = setup();

    await runLinkCheck(['--pref', '13'], deps);

    expect(fetch.mock.calls.map(([url]) => url)).toEqual(['https://example.com/ok']);
  });

  test('12.4 --pref=26,tokyo の形でも受け取る', async () => {
    const { deps, fetch } = setup();

    await runLinkCheck(['--pref=tokyo'], deps);

    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('12.4 --pref が空文字なら全県（workflow の入力が空のとき）', async () => {
    const { deps, fetch } = setup();

    await runLinkCheck(['--pref', ''], deps);

    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test('12.4 --out のファイルにも同じレポートを書く', async () => {
    const { deps, out, files } = setup();

    await runLinkCheck(['--out', 'report.md'], deps);

    expect(files.get('report.md')).toBe(out.join('\n'));
  });

  test('12.4 出典が0件なら、何も確かめずに終了コード 0（レポートは0件と書く）', async () => {
    const { deps, out, fetch } = setup({ prefectures: [prefecture('01', 'hokkaido')] });

    await expect(runLinkCheck([], deps)).resolves.toBe(0);

    expect(fetch).not.toHaveBeenCalled();
    expect(out.join('\n')).toContain('出典の URL がありません');
  });

  test.each([
    [['--unknown']],
    [['--pref']],
    [['--out']],
    [['extra']],
    [['--pref', 'nowhere']],
    [['--pref', '--out']],
    [['--out', '-x']],
    [['--out=-x']],
    [['--pref=-1']],
    [['--out=']],
    [['--out', '']]
  ])('12.4 引数の誤り %j は終了コード 2。何も確かめない', async args => {
    const { deps, fetch, err } = setup();

    await expect(runLinkCheck(args, deps)).resolves.toBe(2);

    expect(fetch).not.toHaveBeenCalled();
    expect(err.length).toBeGreaterThan(0);
  });

  test('12.4 レポートのファイルを書けなければ、メッセージを出して終了コード 2（リンク切れの 1 と区別する）。レポートは標準出力に出ている', async () => {
    const { deps, out, err } = setup();

    const code = await runLinkCheck(['--out', 'report.md'], {
      ...deps,
      writeFile: () => {
        throw new Error('EACCES: permission denied');
      }
    });

    expect(code).toBe(2);
    expect(out.join('\n')).toContain('## リンク切れ');
    expect(err.join('\n')).toContain('EACCES');
  });

  test('12.4 コンテンツの誤り（読み込みで例外）は終了コード 2', async () => {
    const { deps, err } = setup({
      load: () => {
        throw new Error('検証に失敗しました');
      }
    });

    await expect(runLinkCheck([], deps)).resolves.toBe(2);

    expect(err.join('\n')).toContain('検証に失敗しました');
  });
});
