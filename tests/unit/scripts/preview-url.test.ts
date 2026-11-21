import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { PREVIEW_WORKER_NAME, parsePreviewUrls, previewAliasUrl, previewPageUrls, runPreviewUrl, type PreviewUrlDeps } from '../../../scripts/lib/preview-url';

const FIXTURE = readFileSync('tests/fixtures/wrangler/version-upload.ndjson', 'utf8');
const VERSION_ID = '8e319cb0-21b9-44fc-a4da-b71cf0212d86';
const PREVIEW = 'https://8e319cb0-jp-map.vivastack-dev.workers.dev';
const ALIAS = 'https://pr-70-jp-map.vivastack-dev.workers.dev';

/** version-upload の1行（URL などは上書きできる） */
const uploadLine = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({ type: 'version-upload', version: 1, version_id: VERSION_ID, preview_url: PREVIEW, preview_alias_url: ALIAS, ...overrides });

describe('parsePreviewUrls', () => {
  test('12.3 wrangler の出力ファイルの version-upload の行から、プレビュー URL・別名の URL・バージョン ID を取り出す（ほかの種類の行は飛ばす）', () => {
    expect(parsePreviewUrls(FIXTURE)).toEqual({ previewUrl: PREVIEW, aliasUrl: ALIAS, versionId: VERSION_ID });
  });

  test('12.3 空行・JSON でない行・ほかの種類の行があっても、version-upload の行を取り出す', () => {
    const ndjson = `\n{broken\n"text"\n{"type":"wrangler-session"}\n${uploadLine()}\n\n`;

    expect(parsePreviewUrls(ndjson).aliasUrl).toBe(ALIAS);
  });

  test('12.3 version-upload の行が複数あれば、最後の行を使う', () => {
    const ndjson = `${uploadLine({ preview_alias_url: 'https://pr-1-jp-map.vivastack-dev.workers.dev' })}\n${uploadLine()}`;

    expect(parsePreviewUrls(ndjson).aliasUrl).toBe(ALIAS);
  });

  test('12.3 URL の末尾のスラッシュは取り除く', () => {
    expect(parsePreviewUrls(uploadLine({ preview_alias_url: `${ALIAS}/` })).aliasUrl).toBe(ALIAS);
  });

  test('12.3 version-upload の行がないときはエラーにする', () => {
    expect(() => parsePreviewUrls('{"type":"wrangler-session"}\n')).toThrow(/version-upload/);
    expect(() => parsePreviewUrls('')).toThrow(/version-upload/);
  });

  test.each([
    ['preview_url が null（プレビューが無効のとき）', { preview_url: null }],
    ['preview_alias_url がない', { preview_alias_url: undefined }],
    ['preview_url が文字列でない', { preview_url: 42 }],
    ['version_id がない', { version_id: undefined }],
    ['version_id に改行が入っている', { version_id: `${VERSION_ID}\nx=1` }]
  ])('12.3 %s ときはエラーにする', (_name, overrides) => {
    expect(() => parsePreviewUrls(uploadLine(overrides))).toThrow();
  });

  test.each([
    ['http://pr-70-jp-map.vivastack-dev.workers.dev', 'https'],
    ['https://pr-70-jp-map.example.com', 'workers.dev'],
    ['https://evil.workers.dev.example.com', 'workers.dev'],
    ['https://workers.dev', 'workers.dev'],
    ['https://pr-70-jp-map.someone-else.workers.dev', 'workers.dev'],
    ['https://pr-70-other.vivastack-dev.workers.dev', 'workers.dev'],
    ['https://pr-70-maps.vivastack-dev.workers.dev', 'workers.dev'],
    ['https://jp-map.vivastack-dev.workers.dev', 'workers.dev'],
    ['https://-jp-map.vivastack-dev.workers.dev', 'workers.dev'],
    ['https://x.pr-70-jp-map.vivastack-dev.workers.dev', 'workers.dev'],
    ['https://pr-70-jp-map.vivastack-dev.workers.dev:8443', 'ポート'],
    ['https://user:pass@pr-70-jp-map.vivastack-dev.workers.dev', '認証'],
    ['https://pr-70-jp-map.vivastack-dev.workers.dev/ja/?x=1', 'パス'],
    ['not a url', 'URL']
  ])('12.3 %s はエラーにする（%s）', (url, reason) => {
    expect(() => parsePreviewUrls(uploadLine({ preview_alias_url: url }))).toThrow(new RegExp(reason));
  });
});

describe('previewAliasUrl', () => {
  test('12.3 PR の番号から、別名の URL（https://pr-N-jp-map.vivastack-dev.workers.dev）を作る', () => {
    expect(previewAliasUrl(70)).toBe(ALIAS);
  });

  test('12.3 Worker の名前は wrangler.jsonc の name と合っている（合わないと、プレビューの URL が通らなくなる）', () => {
    expect(readFileSync('wrangler.jsonc', 'utf8')).toMatch(new RegExp(`"name":\\s*"${PREVIEW_WORKER_NAME}"`, 'u'));
  });
});

describe('previewPageUrls', () => {
  test('12.3 言語ごとのページの URL（/ja/・/en/・/zh/）を作る', () => {
    expect(previewPageUrls(ALIAS)).toEqual([
      { lang: 'ja', url: `${ALIAS}/ja/` },
      { lang: 'en', url: `${ALIAS}/en/` },
      { lang: 'zh', url: `${ALIAS}/zh/` }
    ]);
  });
});

/** 偽の入出力。files に載せたパスだけ読める */
function fakeDeps(files: Readonly<Record<string, string | Error>>) {
  const out: string[] = [];
  const err: string[] = [];
  const deps: PreviewUrlDeps = {
    readFile: path => {
      const file = files[path];
      if (file === undefined) throw new Error(`ENOENT: ${path}`);
      if (file instanceof Error) throw file;
      return file;
    },
    writeOut: text => void out.push(text),
    writeErr: line => void err.push(line)
  };
  return { deps, out, err };
}

describe('runPreviewUrl', () => {
  test('12.3 CLI は $GITHUB_OUTPUT の形（名前=値）で出し、終了コード 0', () => {
    const { deps, out } = fakeDeps({ 'wrangler-output.ndjson': FIXTURE });

    const code = runPreviewUrl(['wrangler-output.ndjson'], deps);

    expect(code).toBe(0);
    expect(out.join('')).toBe(`alias_url=${ALIAS}\npreview_url=${PREVIEW}\nversion_id=${VERSION_ID}\n`);
  });

  test('12.3 ファイルがない・読めないときは終了コード 1（標準出力には何も出さない）', () => {
    const { deps, out, err } = fakeDeps({});

    expect(runPreviewUrl(['missing.ndjson'], deps)).toBe(1);
    expect(out).toEqual([]);
    expect(err.join('\n')).toContain('missing.ndjson');
  });

  test('12.3 引数がない（または2つ以上）ときは終了コード 1', () => {
    const { deps, err } = fakeDeps({});

    expect(runPreviewUrl([], deps)).toBe(1);
    expect(runPreviewUrl(['a', 'b'], deps)).toBe(1);
    expect(err.length).toBe(2);
  });

  test('12.3 出力に version-upload の行がないときは終了コード 1', () => {
    const { deps, out, err } = fakeDeps({ 'o.ndjson': '{"type":"wrangler-session"}\n' });

    expect(runPreviewUrl(['o.ndjson'], deps)).toBe(1);
    expect(out).toEqual([]);
    expect(err.join('\n')).toContain('version-upload');
  });
});
