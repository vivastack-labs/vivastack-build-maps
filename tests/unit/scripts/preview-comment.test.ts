import { describe, expect, test } from 'vitest';
import { COMMENT_MARKER, buildPreviewComment, runPreviewComment, type PreviewCommentDeps } from '../../../scripts/lib/preview-comment';

const ALIAS = 'https://pr-70-jp-map.vivastack-dev.workers.dev';
const PREVIEW = 'https://1a2b3c4d-jp-map.vivastack-dev.workers.dev';
const VERSION_ID = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const SHA = '0123456789abcdef0123456789abcdef01234567';
const MERGE_SHA = 'fedcba9876543210fedcba9876543210fedcba98';
const REPO = 'vivastack-labs/vivastack-build-maps';
const BOT = 'github-actions[bot]';

const ENV = { GITHUB_REPOSITORY: REPO, PR_NUMBER: '70', ALIAS_URL: ALIAS, PREVIEW_URL: PREVIEW, VERSION_ID, HEAD_SHA: SHA, MERGE_SHA };
const comment = (id: number, body: string, login = BOT) => ({ id, body, user: { login } });

describe('buildPreviewComment', () => {
  const body = buildPreviewComment({ aliasUrl: ALIAS, previewUrl: PREVIEW, versionId: VERSION_ID, sha: SHA, mergeSha: MERGE_SHA });

  test('12.3 コメントは印・言語ごとのリンク・コミット・バージョン ID を含む', () => {
    expect(body.startsWith(COMMENT_MARKER)).toBe(true);
    for (const lang of ['ja', 'en', 'zh']) {
      expect(body).toContain(`${ALIAS}/${lang}/`);
      expect(body).toContain(`${PREVIEW}/${lang}/`);
    }
    expect(body).toContain(SHA);
    expect(body).toContain(SHA.slice(0, 7));
    expect(body).toContain(MERGE_SHA);
    expect(body).toContain(VERSION_ID);
  });

  test('12.3 コメントに、main と merge した結果（ビルドしたコミット）の先頭7文字を併記する', () => {
    expect(body).toContain(`main と merge した結果（${MERGE_SHA.slice(0, 7)}）`);
  });

  test('12.3 コメントに「下書き」の印と noindex の説明がある', () => {
    expect(body).toContain('下書き');
    expect(body).toContain('noindex');
  });
});

/** gh api の偽。comments はページ（100件ずつ）に分けて返す。呼び出しを記録する */
function fakeApi(comments: readonly ReturnType<typeof comment>[]) {
  const calls: { method: string; path: string; body?: unknown }[] = [];
  const out: string[] = [];
  const err: string[] = [];
  const deps: PreviewCommentDeps = {
    get: async path => {
      calls.push({ method: 'GET', path });
      const page = Number(new URL(`https://x/${path}`).searchParams.get('page') ?? '1');
      return comments.slice((page - 1) * 100, page * 100);
    },
    write: async (method, path, body) => {
      calls.push({ method, path, body });
      return undefined;
    },
    writeOut: text => void out.push(text),
    writeErr: line => void err.push(line)
  };
  return { deps, calls, out, err };
}

const writes = <T extends { method: string }>(calls: readonly T[]) => calls.filter(call => call.method !== 'GET');

describe('runPreviewComment', () => {
  test('12.3 印のあるコメントがなければ POST する', async () => {
    const { deps, calls } = fakeApi([comment(1, 'レビューのコメント', 'someone')]);

    const code = await runPreviewComment(ENV, deps);

    expect(code).toBe(0);
    expect(writes(calls)).toEqual([
      { method: 'POST', path: `repos/${REPO}/issues/70/comments`, body: { body: buildPreviewComment({ aliasUrl: ALIAS, previewUrl: PREVIEW, versionId: VERSION_ID, sha: SHA, mergeSha: MERGE_SHA }) } }
    ]);
  });

  test('12.3 印のあるコメントがあれば、そのコメントだけを PATCH する（ほかのコメントは触らない）', async () => {
    const { deps, calls } = fakeApi([comment(1, 'ふつうのコメント', 'someone'), comment(2, `${COMMENT_MARKER}\n古い内容`), comment(3, 'ボットの別のコメント')]);

    expect(await runPreviewComment(ENV, deps)).toBe(0);

    const [write, ...rest] = writes(calls);
    expect(rest).toEqual([]);
    expect(write?.method).toBe('PATCH');
    expect(write?.path).toBe(`repos/${REPO}/issues/comments/2`);
  });

  test('12.3 印があっても、github-actions[bot] 以外が書いたコメントは書き換えない（POST する）', async () => {
    const { deps, calls } = fakeApi([comment(5, `${COMMENT_MARKER}\nなりすまし`, 'someone')]);

    await runPreviewComment(ENV, deps);

    expect(writes(calls).map(call => call.method)).toEqual(['POST']);
  });

  test('12.3 2ページ目にある印のコメントも探して PATCH する', async () => {
    const filler = Array.from({ length: 100 }, (_, index) => comment(index + 10, 'ほかのコメント', 'someone'));
    const { deps, calls } = fakeApi([...filler, comment(999, `${COMMENT_MARKER}\n古い内容`)]);

    await runPreviewComment(ENV, deps);

    expect(calls.filter(call => call.method === 'GET').map(call => call.path)).toEqual([
      `repos/${REPO}/issues/70/comments?per_page=100&page=1`,
      `repos/${REPO}/issues/70/comments?per_page=100&page=2`
    ]);
    expect(writes(calls)).toMatchObject([{ method: 'PATCH', path: `repos/${REPO}/issues/comments/999` }]);
  });

  test('12.3 コメントの一覧が配列でなければ終了コード 1', async () => {
    const { deps, err } = fakeApi([]);

    const code = await runPreviewComment(ENV, { ...deps, get: async () => ({ message: 'x' }) });

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('コメント');
  });

  test('12.3 gh api が失敗したときは終了コード 1（理由を標準エラーに出す）', async () => {
    const { deps, err } = fakeApi([]);

    const code = await runPreviewComment(ENV, {
      ...deps,
      write: async () => {
        throw new Error('HTTP 403');
      }
    });

    expect(code).toBe(1);
    expect(err.join('\n')).toContain('HTTP 403');
  });

  test.each([
    ['PR_NUMBER がない', { PR_NUMBER: undefined }],
    ['PR_NUMBER が空', { PR_NUMBER: '' }],
    ['ALIAS_URL がない', { ALIAS_URL: undefined }],
    ['VERSION_ID がない', { VERSION_ID: undefined }],
    ['HEAD_SHA がない', { HEAD_SHA: undefined }],
    ['GITHUB_REPOSITORY がない', { GITHUB_REPOSITORY: undefined }],
    ['PR_NUMBER が数でない', { PR_NUMBER: '70/../1' }],
    ['PR_NUMBER が 0', { PR_NUMBER: '0' }],
    ['ALIAS_URL が http', { ALIAS_URL: 'http://pr-70-jp-map.vivastack-dev.workers.dev' }],
    ['PREVIEW_URL が https でない', { PREVIEW_URL: 'ftp://x.workers.dev' }],
    ['PREVIEW_URL が workers.dev でない', { PREVIEW_URL: 'https://example.com' }],
    ['MERGE_SHA がない', { MERGE_SHA: undefined }],
    ['MERGE_SHA が40桁の16進数でない', { MERGE_SHA: 'xyz' }],
    ['ALIAS_URL が PR の番号と合わない（ほかの PR の URL）', { ALIAS_URL: 'https://pr-71-jp-map.vivastack-dev.workers.dev' }],
    ['ALIAS_URL が別名でない（バージョンの URL）', { ALIAS_URL: PREVIEW }],
    ['HEAD_SHA が40桁の16進数でない', { HEAD_SHA: 'abc' }],
    ['VERSION_ID に改行がある', { VERSION_ID: `${VERSION_ID}\n- [x]` }],
    ['GITHUB_REPOSITORY が owner/repo の形でない', { GITHUB_REPOSITORY: '../x' }]
  ])('12.3 %s ときは終了コード 1（gh api を呼ばない）', async (_name, overrides) => {
    const { deps, calls, err } = fakeApi([]);

    const code = await runPreviewComment({ ...ENV, ...overrides }, deps);

    expect(code).toBe(1);
    expect(calls).toEqual([]);
    expect(err.length).toBeGreaterThan(0);
  });
});
