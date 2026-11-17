// 12.3：wrangler versions upload の出力ファイル（WRANGLER_OUTPUT_FILE_PATH。ND-JSON）から、プレビューの URL を取り出す（T0-06）。
// 標準出力の文言（Version Preview URL:）は表示用で変わりやすいので、版つきの機械向けの出力（version-upload の行）を読む。
// 取り出した値は $GITHUB_OUTPUT・PR のコメントに書くので、https の workers.dev の URL とバージョン ID の形だけを通す（改行などを入れさせない）。
// scripts/ から Node.js で直接読み込むので、相対の import には .ts を付ける。
import { LANGS, type Lang } from '../../src/i18n/lang.ts';

/** wrangler versions upload が作ったバージョンのプレビューの URL（末尾のスラッシュなし）とバージョン ID */
export type PreviewUrls = {
  /** バージョンごとの URL（`https://<バージョンIDの先頭8文字>-maps.….workers.dev`）。そのコミットに固定 */
  readonly previewUrl: string;
  /** `--preview-alias` の URL（`https://pr-N-maps.….workers.dev`）。PR の最新のコミットを指す */
  readonly aliasUrl: string;
  readonly versionId: string;
};

/** Worker の名前（wrangler.jsonc の name と合わせる。テストで確かめる）。プレビューの URL のホスト名は `<ラベル>-<この名前>.<サブドメイン>.workers.dev` になる */
export const PREVIEW_WORKER_NAME = 'maps';
/** アカウントの workers.dev のサブドメイン（D35）。ほかのアカウントの workers.dev の URL を通さないために決め打ちにする */
const WORKERS_DEV_SUBDOMAIN = 'vivastack-dev';
const PREVIEW_HOST_SUFFIX = `-${PREVIEW_WORKER_NAME}.${WORKERS_DEV_SUBDOMAIN}.workers.dev`;
/** プレビューの URL のホスト名。先頭のラベル（バージョン ID の先頭8文字・pr-N）は英数字とハイフンで、ハイフンで始まらない */
const PREVIEW_HOST_PATTERN = new RegExp(`^[a-z0-9][a-z0-9-]*${PREVIEW_HOST_SUFFIX.replaceAll('.', '\\.')}$`, 'u');
const VERSION_ID_PATTERN = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/iu;

/**
 * プレビューの URL を確かめて、末尾にスラッシュのない形（origin）にして返す。
 * https で、ホスト名が `<ラベル>-maps.vivastack-dev.workers.dev` で、認証情報・ポート・パス・クエリ・ハッシュがないもの以外は例外
 * （本番の `maps.vivastack-dev.workers.dev` やほかのアカウントの workers.dev も通さない）。
 */
export function normalizePreviewUrl(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new Error(`${name} がありません（プレビューが有効でない可能性があります）`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} が URL ではありません：${JSON.stringify(value)}`);
  }
  if (url.protocol !== 'https:') throw new Error(`${name} が https ではありません：${JSON.stringify(value)}`);
  if (!PREVIEW_HOST_PATTERN.test(url.hostname)) {
    throw new Error(`${name} がこの Worker の workers.dev のプレビューの URL（*${PREVIEW_HOST_SUFFIX}）ではありません：${JSON.stringify(value)}`);
  }
  if (url.port !== '') throw new Error(`${name} にポートが入っています：${JSON.stringify(value)}`);
  if (url.username !== '' || url.password !== '') throw new Error(`${name} に認証情報が入っています`);
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') throw new Error(`${name} にパス・クエリ・ハッシュが入っています：${JSON.stringify(value)}`);
  return url.origin;
}

/** PR の番号（正の整数）から、別名（`--preview-alias pr-<番号>`）の URL を作る */
export function previewAliasUrl(prNumber: number): string {
  return `https://pr-${prNumber}${PREVIEW_HOST_SUFFIX}`;
}

/** バージョン ID（UUID の形）を確かめる。ほかの形は例外 */
export function normalizeVersionId(value: unknown, name = 'version_id'): string {
  if (typeof value !== 'string' || !VERSION_ID_PATTERN.test(value)) throw new Error(`${name} が UUID の形ではありません：${JSON.stringify(value)}`);
  return value;
}

/** 1行を JSON として読む。読めない行・オブジェクトでない行は undefined（wrangler のほかの出力が混ざってよい） */
function parseLine(line: string): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * wrangler の出力ファイル（ND-JSON）から、`type` が `version-upload` の行（複数あれば最後）を探して URL・バージョン ID を返す。
 * 行がない、URL がない（preview_url が null など）、形が違うときは例外。
 */
export function parsePreviewUrls(ndjson: string): PreviewUrls {
  const upload = ndjson
    .split('\n')
    .map(line => parseLine(line.trim()))
    .filter(entry => entry?.type === 'version-upload')
    .at(-1);
  if (upload === undefined) throw new Error('wrangler の出力に version-upload の行がありません');
  return {
    previewUrl: normalizePreviewUrl(upload.preview_url, 'preview_url'),
    aliasUrl: normalizePreviewUrl(upload.preview_alias_url, 'preview_alias_url'),
    versionId: normalizeVersionId(upload.version_id)
  };
}

/** 言語ごとのトップページの URL（`<baseUrl>/ja/` など）。言語の一覧は src/i18n/lang.ts から作る */
export function previewPageUrls(baseUrl: string): readonly { readonly lang: Lang; readonly url: string }[] {
  return LANGS.map(lang => ({ lang, url: `${baseUrl}/${lang}/` }));
}

/** runPreviewUrl が使うもの。本物の入出力は scripts/preview-url.ts がつなぐ */
export type PreviewUrlDeps = {
  /** ファイルを読む。ない・読めないときは例外 */
  readonly readFile: (path: string) => string;
  readonly writeOut: (text: string) => void;
  readonly writeErr: (line: string) => void;
};

/**
 * 引数（出力ファイルのパス1つ）のファイルを読み、`alias_url=…`・`preview_url=…`・`version_id=…` を $GITHUB_OUTPUT の形で writeOut に渡す。
 * 引数の誤り・ファイルが読めない・URL が取り出せないときは、何も出さずに 1 を返す（0 は成功）。
 */
export function runPreviewUrl(args: readonly string[], deps: PreviewUrlDeps): number {
  const [path, ...rest] = args;
  if (path === undefined || rest.length > 0) {
    deps.writeErr('使い方：node scripts/preview-url.ts <wrangler の出力ファイル>');
    return 1;
  }
  try {
    const { aliasUrl, previewUrl, versionId } = parsePreviewUrls(deps.readFile(path));
    deps.writeOut(`alias_url=${aliasUrl}\npreview_url=${previewUrl}\nversion_id=${versionId}\n`);
    return 0;
  } catch (error) {
    deps.writeErr(`${path} からプレビューの URL を取り出せませんでした：${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
