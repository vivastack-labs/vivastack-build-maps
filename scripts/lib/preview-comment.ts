// 12.3：PR にプレビューの URL のコメントを付ける・書き換える（T0-06）。
// 印（COMMENT_MARKER）のある、github-actions[bot] のコメントがあればそれを PATCH し、なければ POST する（push のたびにコメントが増えない）。
// gh api の呼び出しと出力は引数で受け取る（テストでは本物の GitHub に繋がない）。Secrets は扱わない（GITHUB_TOKEN は gh が環境変数から読む）。
// scripts/ から Node.js で直接読み込むので、相対の import には .ts を付ける。
import type { GhGet, GhWrite } from './github-setup.ts';
import { normalizePreviewUrl, normalizeVersionId, previewAliasUrl, previewPageUrls } from './preview-url.ts';

/** コメントを見つける印。HTML のコメントなので、画面には出ない */
export const COMMENT_MARKER = '<!-- preview-url -->';

/** コメントを書くのが GITHUB_TOKEN のときの user.login。ほかの人が印を真似たコメントを書き換えないために確かめる */
const BOT_LOGIN = 'github-actions[bot]';
const PER_PAGE = 100;
/** コメントの一覧を読むページ数の上限（終わらない応答で止まらなくなるのを防ぐ） */
const MAX_PAGES = 50;
const SHORT_SHA_LENGTH = 7;

/** buildPreviewComment の入力。URL・バージョン ID・コミットは、呼び出し側で形を確かめてから渡す */
export type PreviewCommentInput = {
  readonly aliasUrl: string;
  readonly previewUrl: string;
  readonly versionId: string;
  /** PR の head のコミット */
  readonly sha: string;
  /** 実際にビルドした、main と merge した結果のコミット（pull_request の github.sha） */
  readonly mergeSha: string;
};

const linkList = (baseUrl: string) => previewPageUrls(baseUrl).map(({ lang, url }) => `- ${lang}：${url}`);

/** PR のコメントの本文（Markdown）。言語ごとのリンク、最新・固定の URL の違い、「下書き」の印・noindex の説明、バージョン ID・コミットを書く */
export function buildPreviewComment({ aliasUrl, previewUrl, versionId, sha, mergeSha }: PreviewCommentInput): string {
  return [
    COMMENT_MARKER,
    '## プレビュー',
    '',
    `最新のコミット（\`${sha.slice(0, SHORT_SHA_LENGTH)}\`）を、main と merge した結果（${mergeSha.slice(0, SHORT_SHA_LENGTH)}）でビルドしたプレビューです。認証なしで開けます。`,
    '',
    '### この PR の最新（push のたびに更新されます）',
    '',
    ...linkList(aliasUrl),
    '',
    '### このコミットに固定した URL',
    '',
    ...linkList(previewUrl),
    '',
    `- コミット：${sha}`,
    `- main と merge した結果：${mergeSha}`,
    `- バージョン ID：${versionId}`,
    '',
    'プレビューは、すべての項目に「下書き」の印を付けて出しています。検索に載らないよう `noindex` が付いています。'
  ].join('\n');
}

/** runPreviewComment が使うもの。本物の入出力は scripts/preview-comment.ts がつなぐ */
export type PreviewCommentDeps = {
  readonly get: GhGet;
  readonly write: GhWrite;
  readonly writeOut: (text: string) => void;
  readonly writeErr: (line: string) => void;
};

type Env = Readonly<Record<string, string | undefined>>;
type Settings = PreviewCommentInput & { readonly repo: string; readonly prNumber: number };

const REPO_PATTERN = /^[\w-][\w.-]*\/[\w-][\w.-]*$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const PR_NUMBER_PATTERN = /^[1-9]\d{0,8}$/u;

function required(env: Env, name: string): string {
  const value = env[name];
  if (value === undefined || value === '') throw new Error(`環境変数 ${name} がありません`);
  return value;
}

function matching(value: string, pattern: RegExp, name: string): string {
  if (!pattern.test(value)) throw new Error(`環境変数 ${name} の形が正しくありません：${JSON.stringify(value)}`);
  return value;
}

/** 別名の URL が、この PR の番号の別名（pr-<番号>）であることを確かめる（ほかの PR の出力の取り違えに気づく） */
function matchingAlias(aliasUrl: string, prNumber: number): string {
  if (aliasUrl !== previewAliasUrl(prNumber)) throw new Error(`ALIAS_URL が PR #${prNumber} の別名の URL（${previewAliasUrl(prNumber)}）ではありません：${aliasUrl}`);
  return aliasUrl;
}

/** 環境変数を確かめて、設定にする。足りない・形が違うものは例外（PR への書き込みの前に止める） */
function readSettings(env: Env): Settings {
  const prNumber = Number(matching(required(env, 'PR_NUMBER'), PR_NUMBER_PATTERN, 'PR_NUMBER'));
  return {
    repo: matching(required(env, 'GITHUB_REPOSITORY'), REPO_PATTERN, 'GITHUB_REPOSITORY'),
    prNumber,
    aliasUrl: matchingAlias(normalizePreviewUrl(required(env, 'ALIAS_URL'), 'ALIAS_URL'), prNumber),
    previewUrl: normalizePreviewUrl(required(env, 'PREVIEW_URL'), 'PREVIEW_URL'),
    versionId: normalizeVersionId(required(env, 'VERSION_ID'), 'VERSION_ID'),
    sha: matching(required(env, 'HEAD_SHA'), SHA_PATTERN, 'HEAD_SHA'),
    mergeSha: matching(required(env, 'MERGE_SHA'), SHA_PATTERN, 'MERGE_SHA')
  };
}

/** 印のある、github-actions[bot] のコメントの ID を、ページを順に読んで探す（なければ undefined） */
async function findCommentId(get: GhGet, listPath: string): Promise<number | undefined> {
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const comments = await get(`${listPath}?per_page=${PER_PAGE}&page=${page}`);
    if (!Array.isArray(comments)) throw new Error('コメントの一覧が配列ではありません');
    const found = comments.find(
      (comment: { id?: unknown; body?: unknown; user?: { login?: unknown } | null }) =>
        typeof comment.id === 'number' && typeof comment.body === 'string' && comment.body.includes(COMMENT_MARKER) && comment.user?.login === BOT_LOGIN
    );
    if (found !== undefined) return found.id as number;
    if (comments.length < PER_PAGE) return undefined;
  }
  return undefined;
}

/**
 * 環境変数（GITHUB_REPOSITORY・PR_NUMBER・ALIAS_URL・PREVIEW_URL・VERSION_ID・HEAD_SHA・MERGE_SHA）を確かめてから、PR にコメントを付ける（なければ POST）・
 * 書き換える（あれば PATCH）。足りない・形が違う・gh api の失敗は、理由を writeErr に出して 1 を返す（0 は成功）。
 */
export async function runPreviewComment(env: Env, deps: PreviewCommentDeps): Promise<number> {
  try {
    const { repo, prNumber, ...input } = readSettings(env);
    const body = buildPreviewComment(input);
    const existingId = await findCommentId(deps.get, `repos/${repo}/issues/${prNumber}/comments`);
    if (existingId === undefined) {
      await deps.write('POST', `repos/${repo}/issues/${prNumber}/comments`, { body });
      deps.writeOut(`PR #${prNumber} にプレビューのコメントを付けました`);
    } else {
      await deps.write('PATCH', `repos/${repo}/issues/comments/${existingId}`, { body });
      deps.writeOut(`PR #${prNumber} のプレビューのコメント（${existingId}）を書き換えました`);
    }
    return 0;
  } catch (error) {
    deps.writeErr(`プレビューのコメントを付けられませんでした：${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
