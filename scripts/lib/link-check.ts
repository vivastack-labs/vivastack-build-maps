// 12.4：出典（sources[].url）のリンク切れチェック（T5-03。pnpm content:links）。
// 相手のサーバーに負担をかけないよう、同時に送る数と、同じホストへの間隔に上限を設ける。
// fetch・時計・待ちは引数で受け取る（テストでは本物のネットワークを使わない）。
// scripts/ から Node.js で直接読み込むので、相対の import には .ts を付ける。
import type { Prefecture } from '../../src/lib/content-schema.generated.ts';

/** 同時に確かめる URL の数の上限（12.4） */
export const DEFAULT_CONCURRENCY = 4;
/** 同じホストへ送る間隔の下限（ミリ秒。12.4） */
export const DEFAULT_HOST_INTERVAL_MS = 2000;
/** 1件のタイムアウト（ミリ秒） */
export const DEFAULT_TIMEOUT_MS = 20_000;
/** ボットだと分かるように名乗る。連絡先・URL は入れない */
export const USER_AGENT = 'gotouchi-link-check/1.0';

/** 確かめた結果の分類。ok は正常、broken は直す、残りは人が見て決める（要確認） */
export type LinkKind = 'ok' | 'redirected' | 'broken' | 'http-error' | 'timeout' | 'network-error';

/** 1件の結果。status は HTTP ステータス、finalUrl は辿った先、reason は通信の失敗の理由 */
export type LinkOutcome = { readonly kind: LinkKind; readonly status?: number; readonly finalUrl?: string; readonly reason?: string };

/** 集めた出典の URL と、使われている場所（`26-kyoto specialties/uji-tea` の形） */
export type CollectedLink = { readonly url: string; readonly usages: readonly string[] };

/** 確かめた結果つきの URL */
export type CheckedLink = CollectedLink & { readonly outcome: LinkOutcome };

/** checkLink が使う応答の形（本物の Response から使う分だけ） */
export type LinkResponse = {
  readonly status: number;
  readonly url: string;
  readonly redirected: boolean;
  readonly body: { cancel(): Promise<void> } | null;
};

/** checkLink に渡す fetch の形。本物の fetch がそのまま入る */
export type LinkFetch = (url: string, init: { method: 'GET'; redirect: 'follow'; headers: Record<string, string>; signal: AbortSignal }) => Promise<LinkResponse>;

/** checkLink の設定 */
export type CheckOptions = { readonly fetch: LinkFetch; readonly timeoutMs: number; readonly userAgent: string };

const BROKEN_STATUSES: ReadonlySet<number> = new Set([404, 410]);

/** 出典をもつ項目の名前と出典の並び。access は県に1つ、名物・名所は id で区別する */
function sourceGroups(prefecture: Prefecture): readonly { readonly place: string; readonly urls: readonly string[] }[] {
  const label = `${prefecture.code}-${prefecture.id}`;
  const access = prefecture.access === undefined ? [] : [{ place: `${label} access`, urls: prefecture.access.sources.map(source => source.url) }];
  const items = (list: 'specialties' | 'spots') => prefecture[list].map(item => ({ place: `${label} ${list}/${item.id}`, urls: item.sources.map(source => source.url) }));
  return [...access, ...items('specialties'), ...items('spots')];
}

/**
 * 出典の URL を集める。同じ URL は1つにまとめ、使われている場所をすべて残す（status は問わない）。
 * codes を渡すと、その県の URL だけを集める（空なら全県）。
 */
export function collectLinks(prefectures: readonly Prefecture[], codes: readonly string[] = []): readonly CollectedLink[] {
  const targets = codes.length === 0 ? prefectures : prefectures.filter(prefecture => codes.includes(prefecture.code));
  const usagesByUrl = targets
    .flatMap(sourceGroups)
    .flatMap(({ place, urls }) => urls.map(url => ({ url, place })))
    .reduce((map, { url, place }) => new Map(map).set(url, [...(map.get(url) ?? []), place]), new Map<string, readonly string[]>());
  return [...usagesByUrl].map(([url, usages]) => ({ url, usages }));
}

/**
 * `26,kyoto` のような入力（県コードか id を、カンマ・空白で区切る）を、県コードの一覧にする。空なら全県（空の配列）。
 * 知らない県はエラーにする（打ち間違いで「0件・すべて正常」にならないように）。
 */
export function parsePrefectureFilter(input: string, prefectures: readonly Prefecture[]): readonly string[] {
  const tokens = input.split(/[,\s]+/u).filter(token => token !== '');
  const codes = tokens.map(token => {
    const found = prefectures.find(prefecture => prefecture.code === token || prefecture.id === token);
    if (found === undefined) throw new Error(`知らない県です：${token}（県コードか id で指定してください。例：26,kyoto）`);
    return found.code;
  });
  return [...new Set(codes)];
}

/** fetch の失敗の理由。undici は `fetch failed` の cause に code（ENOTFOUND・CERT_HAS_EXPIRED など）を入れる */
function failureReason(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (cause instanceof Error) return 'code' in cause && typeof cause.code === 'string' ? cause.code : cause.message;
  return error.message;
}

const isTimeout = (error: unknown): boolean => error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

/** リダイレクト先が https でないときの注意（https から http や内部のアドレスへ飛ばされた可能性を、レポートで目立たせる） */
export const NOT_HTTPS_NOTE = '⚠ リダイレクト先が https でない';

const isHttps = (url: string): boolean => {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * ステータスを分類する。2xx は ok、リダイレクトありなら redirected、404・410 は broken、そのほかは http-error。
 * リダイレクトがあれば、ステータスによらず最終の URL を残し、https でなければ注意の理由を付ける。
 */
function classify(response: LinkResponse): LinkOutcome {
  const { status } = response;
  const kind: LinkKind = status >= 200 && status < 300 ? (response.redirected ? 'redirected' : 'ok') : BROKEN_STATUSES.has(status) ? 'broken' : 'http-error';
  if (!response.redirected) return { kind, status };
  return isHttps(response.url) ? { kind, status, finalUrl: response.url } : { kind, status, finalUrl: response.url, reason: NOT_HTTPS_NOTE };
}

/**
 * 1件を GET で1回だけ取り、本文は読まずに捨てて、結果を分類する（HEAD は 403・405 を返すサーバーがあるため使わない）。
 * リダイレクトは辿り、最終の URL を記録する。通信の失敗は例外にせず、結果として返す。
 */
export async function checkLink(url: string, { fetch, timeoutMs, userAgent }: CheckOptions): Promise<LinkOutcome> {
  try {
    const response = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(timeoutMs) });
    // 本文は使わない。cancel の失敗は、結果（ステータス）に関係しないので無視する
    await response.body?.cancel().catch(() => undefined);
    return classify(response);
  } catch (error) {
    return isTimeout(error) ? { kind: 'timeout' } : { kind: 'network-error', reason: failureReason(error) };
  }
}

/** runChecks の設定。check は1件を確かめる関数（checkLink に fetch などを渡したもの） */
export type RunOptions = {
  readonly check: (url: string) => Promise<LinkOutcome>;
  readonly concurrency: number;
  readonly hostIntervalMs: number;
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  /** 1件が終わるたびに呼ぶ（進み具合の表示用） */
  readonly onResult?: (checked: CheckedLink, done: number, total: number) => void;
};

const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** ホストごとの送信の状態。busy は送っている最中、readyAt は次に送れる時刻（前の応答が終わった時刻 + 間隔） */
type HostState = { busy: boolean; readyAt: number };

/** URL の順番ごとに、そのホストの状態を返す関数を作る。ホストは最初に一度だけ読む。同じホストの URL は同じ状態を共有する */
function hostStates(links: readonly CollectedLink[]): (index: number) => HostState {
  const byHost = new Map<string, HostState>();
  const states = links.map(link => {
    const host = hostOf(link.url);
    const state = byHost.get(host) ?? { busy: false, readyAt: 0 };
    byHost.set(host, state);
    return state;
  });
  return index => states[index]!;
}

/**
 * 同時に確かめる数を concurrency までにし、すべて確かめる。同じホストへは同時に1件だけ送り、
 * 前の応答が終わってから hostIntervalMs 以上あけて次を送る（応答が遅いホストに重ねて送らない）。
 * 作業は、今すぐ送れる URL（そのホストが空いていて、間隔も過ぎている）を先に取るので、
 * 同じホストの URL が続いても、ほかのホストの URL は待たされない。送れるものがなければ、いちばん早く送れる時刻まで待つ。
 * 結果は入力と同じ順に返す。間隔が効くのは、最初の URL のホストだけ（リダイレクト先のホストへの送信は数えない）。
 */
export async function runChecks(links: readonly CollectedLink[], { check, concurrency, hostIntervalMs, now, sleep, onResult }: RunOptions): Promise<readonly CheckedLink[]> {
  const results: (CheckedLink | undefined)[] = links.map(() => undefined);
  const hostState = hostStates(links);
  const pending: number[] = links.map((_, index) => index);
  const waiters: (() => void)[] = [];
  const wakeAll = (): void => waiters.splice(0).forEach(wake => wake());
  let done = 0;
  // どこかで例外が起きたら、ほかの作業は次の URL を取らずに抜ける（レポートが出ないのに、裏で送り続けない）
  let failed = false;

  const runOne = async (index: number): Promise<void> => {
    const state = hostState(index);
    state.busy = true;
    try {
      const checked: CheckedLink = { ...links[index]!, outcome: await check(links[index]!.url) };
      results[index] = checked;
      done += 1;
      onResult?.(checked, done, links.length);
    } catch (error) {
      failed = true;
      throw error;
    } finally {
      state.busy = false;
      state.readyAt = now() + hostIntervalMs;
      wakeAll();
    }
  };

  /** 今すぐ送れるものがなければ、待つ。送れるようになる時刻があればそこまで、すべてのホストが送信中なら、どれかが終わるまで */
  const waitForTurn = async (): Promise<void> => {
    const free = pending.map(hostState).filter(state => !state.busy);
    if (free.length > 0) return sleep(Math.max(0, Math.min(...free.map(state => state.readyAt)) - now()));
    await new Promise<void>(resolve => waiters.push(resolve));
  };

  const worker = async (): Promise<void> => {
    while (pending.length > 0 && !failed) {
      const position = pending.findIndex(index => {
        const state = hostState(index);
        return !state.busy && state.readyAt <= now();
      });
      if (position < 0) {
        await waitForTurn();
        continue;
      }
      const [index] = pending.splice(position, 1);
      await runOne(index!);
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, links.length) }, worker));
  return results.filter((result): result is CheckedLink => result !== undefined);
}

/** レポートの見出しに出す情報 */
export type ReportMeta = { readonly generatedAt: Date; readonly prefectures: readonly string[] };

const KIND_LABELS: Readonly<Record<LinkKind, string>> = {
  ok: '正常',
  redirected: 'リダイレクト（移転の可能性）',
  broken: 'リンク切れ（404・410）',
  'http-error': 'HTTP エラー（403・429・5xx など）',
  timeout: 'タイムアウト',
  'network-error': '通信の失敗（DNS・証明書・接続）'
};

const KIND_ORDER: readonly LinkKind[] = ['ok', 'redirected', 'broken', 'http-error', 'timeout', 'network-error'];

/** 理由の最大の長さ（相手が長い文字列を返しても、レポートが膨らまないように） */
const MAX_REASON_LENGTH = 200;

/** 表の1マスに入れられる形にする（\ は %5C に、| は \| に、改行・空白の連続は空白1つに。\ の直後の | で表が割れないように、\ を先に直す） */
const cell = (text: string): string => text.replaceAll('\\', '%5C').replaceAll('|', '\\|').replace(/\s+/gu, ' ');

const longestBacktickRun = (text: string): number => Math.max(0, ...(text.match(/`+/gu) ?? []).map(run => run.length));

/**
 * 相手が決めた文字列（最終の URL・理由）を、リンクや強調にならないコードスパンにする。
 * 中のバッククォートより長い囲みにし、端がバッククォートなら空白を足す。
 */
const codeSpan = (text: string): string => {
  const body = cell(text).trim();
  const fence = '`'.repeat(longestBacktickRun(body) + 1);
  const pad = body.startsWith('`') || body.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${body}${pad}${fence}`;
};

const truncate = (text: string, max: number): string => {
  const chars = [...text.replace(/\s+/gu, ' ').trim()];
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : chars.join('');
};

const TABLE_HEADER = ['| 分類 | HTTP | URL | 最終の URL・理由 | 使われている場所 |', '| --- | --- | --- | --- | --- |'];

function row({ url, usages, outcome }: CheckedLink): string {
  const detail = [outcome.finalUrl, outcome.reason === undefined ? undefined : truncate(outcome.reason, MAX_REASON_LENGTH)].flatMap(part => (part === undefined ? [] : [codeSpan(part)]));
  return `| ${KIND_LABELS[outcome.kind]} | ${outcome.status ?? ''} | ${codeSpan(url)} | ${detail.join(' ')} | ${usages.map(cell).join('<br>')} |`;
}

const section = (title: string, rows: readonly CheckedLink[]): readonly string[] => (rows.length === 0 ? [] : ['', `## ${title}（${rows.length}件）`, '', ...TABLE_HEADER, ...rows.map(row)]);

/** 結果を Markdown のレポートにする。リンク切れ・要確認の表と、分類ごとの件数のまとめ */
export function formatReport(results: readonly CheckedLink[], { generatedAt, prefectures }: ReportMeta): string {
  const broken = results.filter(result => result.outcome.kind === 'broken');
  const review = results.filter(result => result.outcome.kind !== 'broken' && result.outcome.kind !== 'ok');
  const counts = KIND_ORDER.map(kind => `| ${KIND_LABELS[kind]} | ${results.filter(result => result.outcome.kind === kind).length} |`);
  const verdict = results.length === 0 ? '出典の URL がありません。' : broken.length + review.length === 0 ? '問題なし：すべてのリンクが正常でした。' : '';
  const lines = [
    '# 出典のリンク切れチェック',
    '',
    `- 実行日時：${generatedAt.toISOString()}`,
    `- 対象の県：${prefectures.length === 0 ? '全県' : prefectures.join('、')}`,
    `- 確かめた URL：${results.length}件`,
    '',
    '| 分類 | 件数 |',
    '| --- | --- |',
    ...counts,
    ...(verdict === '' ? [] : ['', verdict]),
    ...section('リンク切れ', broken),
    ...section('要確認', review)
  ];
  return lines.join('\n');
}

/** runLinkCheck が使うもの。本物の入出力は scripts/check-links.ts がつなぐ */
export type LinkCheckDeps = {
  readonly contentDir: string;
  readonly loadContent: (dir: string) => readonly Prefecture[];
  readonly fetch: LinkFetch;
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly writeOut: (text: string) => void;
  readonly writeErr: (line: string) => void;
  readonly writeFile: (path: string, text: string) => void;
};

type Args = { readonly pref: string; readonly out: string | undefined };

/** `--pref <値>`・`--pref=<値>`・`--out <ファイル>`・`--out=<ファイル>` を読む。誤りは例外 */
function parseArgs(args: readonly string[]): Args {
  const parsed = { pref: '', out: undefined as string | undefined };
  for (let index = 0; index < args.length; index += 1) {
    const [name, inline] = (args[index] ?? '').split(/=(.*)/su);
    if (name !== '--pref' && name !== '--out') throw new Error(`知らない引数です：${args[index]}`);
    const value = inline ?? args[(index += 1)];
    if (value === undefined) throw new Error(`${name} の値がありません`);
    if (value.startsWith('-')) throw new Error(`${name} の値が - で始まっています：${value}`);
    if (name === '--out' && value === '') throw new Error('--out の値が空です');
    if (name === '--pref') parsed.pref = value;
    else parsed.out = value;
  }
  return parsed;
}

const USAGE = '使い方：pnpm content:links [--pref 26,kyoto] [--out <ファイル>]';

/**
 * 出典のリンクを確かめて、レポートを出す。終了コードを返す：
 * リンク切れ（404・410）があれば 1、なければ 0（要確認だけでも 0）、引数・コンテンツの誤りは 2。
 */
export async function runLinkCheck(args: readonly string[], deps: LinkCheckDeps): Promise<number> {
  try {
    return await execute(args, deps);
  } catch (error) {
    deps.writeErr(`思わぬ誤りで止まりました：${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

async function execute(args: readonly string[], deps: LinkCheckDeps): Promise<number> {
  const { writeOut, writeErr } = deps;
  let setup: { readonly out: string | undefined; readonly codes: readonly string[]; readonly prefectures: readonly Prefecture[] };
  try {
    const { pref, out } = parseArgs(args);
    const prefectures = deps.loadContent(deps.contentDir);
    setup = { out, codes: parsePrefectureFilter(pref, prefectures), prefectures };
  } catch (error) {
    writeErr(error instanceof Error ? error.message : String(error));
    writeErr(USAGE);
    return 2;
  }
  const links = collectLinks(setup.prefectures, setup.codes);
  const results = await runChecks(links, {
    check: url => checkLink(url, { fetch: deps.fetch, timeoutMs: DEFAULT_TIMEOUT_MS, userAgent: USER_AGENT }),
    concurrency: DEFAULT_CONCURRENCY,
    hostIntervalMs: DEFAULT_HOST_INTERVAL_MS,
    now: deps.now,
    sleep: deps.sleep,
    onResult: ({ url, outcome }, done, total) => writeErr(`[${done}/${total}] ${outcome.kind}${outcome.status === undefined ? '' : ` ${outcome.status}`} ${url}`)
  });
  const labels = setup.codes.map(code => {
    const found = setup.prefectures.find(prefecture => prefecture.code === code);
    return found === undefined ? code : `${found.code}-${found.id}`;
  });
  const report = formatReport(results, { generatedAt: new Date(deps.now()), prefectures: labels });
  writeOut(report);
  if (setup.out !== undefined) {
    try {
      deps.writeFile(setup.out, report);
    } catch (error) {
      writeErr(`レポートのファイルを書けませんでした：${setup.out}（${error instanceof Error ? error.message : String(error)}）`);
      return 2;
    }
  }
  return results.some(result => result.outcome.kind === 'broken') ? 1 : 0;
}
