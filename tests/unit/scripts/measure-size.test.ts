import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { afterEach, describe, expect, test } from 'vitest';
import { assetPaths, measure, measureLang, run, splitHtml } from '../../../scripts/measure-size';

const SITE = join(import.meta.dirname, '../../fixtures/measure-size/site');
const read = (path: string): Buffer => readFileSync(join(SITE, path));
const dirs: string[] = [];
/** フィクスチャを写した一時ディレクトリ（テストごとに片付ける） */
const copySite = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'measure-size-'));
  dirs.push(dir);
  cpSync(SITE, dir, { recursive: true });
  return dir;
};
afterEach(() => {
  dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true }));
});
const gzipSize = (...paths: readonly string[]): number => paths.reduce((sum, path) => sum + gzipSync(read(path)).length, 0);

// 5.1：最初に読み込むサイズの計測（T3-08）
describe('assetPaths', () => {
  test('5.1：assetPaths は script の src・stylesheet・preload・modulepreload を重複なしで返す', () => {
    // Arrange
    const html = [
      '<head>',
      '<link rel="stylesheet" href="/_next/static/a.css" data-precedence="next"/>',
      '<link rel="preload" as="script" fetchPriority="low" href="/_next/static/b.js"/>',
      '<link as="style" rel="preload" href="/_next/static/c.css"/>',
      '<link rel="modulepreload" href="/_next/static/d.js"/>',
      '<script src="/_next/static/b.js" async=""></script>',
      '<script src="/_next/static/e.js?v=1#x" async></script>',
      "<script src='/_next/static/f.js'></script>",
      '</head>'
    ].join('');

    // Act
    const { paths, warnings } = assetPaths(html);

    // Assert
    expect([...paths].sort()).toEqual(['/_next/static/a.css', '/_next/static/b.js', '/_next/static/c.css', '/_next/static/d.js', '/_next/static/e.js', '/_next/static/f.js']);
    expect(warnings).toEqual([]);
  });

  test('5.1：assetPaths は noModule の script・画像などの preload・script の中身・script 以外の link を数えない', () => {
    const html = [
      '<script src="/legacy.js" noModule=""></script>',
      '<link rel="preload" as="image" href="/a.png"/>',
      '<link rel="canonical" href="/ja/"/>',
      '<link rel="alternate" hrefLang="en" href="/en/"/>',
      '<script>document.write(\'<script src="/inline.js"></script>\')</script>',
      '<script>var x = "<link rel=\\"stylesheet\\" href=\\"/inside.css\\"/>"</script>',
      '<script src="/_next/ok.js"></script>'
    ].join('');

    expect(assetPaths(html)).toEqual({ paths: ['/_next/ok.js'], skipped: [], warnings: [] });
  });

  test('5.1：assetPaths は外部の URL と dist の外を指すパスを数えずに警告する', () => {
    const html = [
      '<script src="https://cdn.example.com/x.js"></script>',
      '<script src="//cdn.example.com/y.js"></script>',
      '<script src="../outside.js"></script>',
      '<script src="/_next/../../outside.js"></script>',
      '<script src="/%2e%2e/outside.js"></script>',
      '<script src="/_next/%E0%A4%A.js"></script>',
      '<script src="relative.js"></script>',
      '<link rel="stylesheet" href="/_next/ok.css"/>'
    ].join('');

    const { paths, skipped, warnings } = assetPaths(html);

    expect(paths).toEqual(['/_next/ok.css']);
    expect(skipped).toEqual(['https://cdn.example.com/x.js', '//cdn.example.com/y.js', '../outside.js', '/_next/../../outside.js', '/%2e%2e/outside.js', '/_next/%E0%A4%A.js', 'relative.js']);
    expect(warnings).toHaveLength(7);
    expect(warnings[0]).toContain('"https://cdn.example.com/x.js"');
  });

  test('S2：警告に入れる HTML 由来の値は JSON.stringify で出し、改行・制御文字をそのまま出さない', () => {
    const html = '<script src="https://x.example/a\n::error::injected\u001b[31m"></script>';

    const { warnings } = assetPaths(html);

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).not.toMatch(/[\n\u001b]/u);
    expect(warnings[0]).toContain(String.raw`\n::error::injected\u001b[31m`);
  });
});

describe('splitHtml', () => {
  test('6.6 (2)：splitHtml は HTML を本体と RSC のデータ（self.__next_f.push）に分ける', () => {
    // Arrange
    const first = '<script>self.__next_f.push([1,"0:{\\"a\\":1}\\n"])</script>';
    const second = '<script>self.__next_f.push([1,"1:\\"</b>\\"\\n"])</script>';
    const html = `<html><body><p>本体</p>${first}<script>var inline = 1;</script>${second}</body></html>`;

    // Act
    const { body, rsc } = splitHtml(html);

    // Assert
    expect(rsc).toBe(first + second);
    expect(body).toBe('<html><body><p>本体</p><script>var inline = 1;</script></body></html>');
    expect(body.length + rsc.length).toBe(html.length);
  });

  test('6.6 (2)：splitHtml は RSC のデータがなければ、全体が本体になる', () => {
    expect(splitHtml('<html></html>')).toEqual({ body: '<html></html>', rsc: '' });
  });
});

describe('measure', () => {
  test('5.1：measure はファイルごとに圧縮して、圧縮前・gzip・brotli を合計する', () => {
    // Arrange
    const a = Buffer.from('hello '.repeat(200));
    const b = Buffer.from('世界'.repeat(300));
    const brotli = (buffer: Buffer): number => brotliCompressSync(buffer, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length;

    // Act
    const size = measure([a, b]);

    // Assert
    expect(size).toEqual({ raw: a.length + b.length, gzip: gzipSync(a).length + gzipSync(b).length, brotli: brotli(a) + brotli(b) });
    expect(measure([])).toEqual({ raw: 0, gzip: 0, brotli: 0 });
  });
});

describe('measureLang', () => {
  test('5.1：フィクスチャの dist で、HTML と、それが読み込む JS・CSS だけを数え、gzip 後のサイズを合計する', () => {
    // Act
    const report = measureLang(SITE, 'ja');

    // Assert：数えるのは main.js・lazy.js（preload と script の両方で指すが1回）・app.css。legacy.js（noModule）・unused.js・__next.ja.txt は数えない
    expect(report.files).toEqual(['/_next/static/chunks/app.css', '/_next/static/chunks/lazy.js', '/_next/static/chunks/main.js']);
    expect(report.warnings).toEqual([]);
    expect(report.js).toMatchObject({ count: 2, raw: read('_next/static/chunks/main.js').length + read('_next/static/chunks/lazy.js').length });
    expect(report.js.gzip).toBe(gzipSize('_next/static/chunks/main.js', '_next/static/chunks/lazy.js'));
    expect(report.css).toMatchObject({ count: 1, gzip: gzipSize('_next/static/chunks/app.css') });
    expect(report.html).toMatchObject({ raw: read('ja/index.html').length, gzip: gzipSize('ja/index.html') });
    expect(report.total.gzip).toBe(report.html.gzip + report.js.gzip + report.css.gzip);
    expect(report.total.raw).toBe(report.html.raw + report.js.raw + report.css.raw);
    expect(report.body.raw + report.rsc.raw).toBe(report.html.raw);
    expect(report.rsc.raw).toBeGreaterThan(0);
  });

  test('5.1：dist に {lang}/index.html がなければ、エラーにする', () => {
    expect(() => measureLang(join(SITE, 'ja'), 'ja')).toThrow(/index\.html/u);
  });

  test('M2：HTML が指す JS が dist になければ、そのパスを含む例外にする', () => {
    // Arrange：HTML が指す chunk を消した dist
    const dir = copySite();
    rmSync(join(dir, '_next/static/chunks/main.js'));

    // Act・Assert
    expect(() => measureLang(dir, 'ja')).toThrow(/\/_next\/static\/chunks\/main\.js/u);
  });

  test('S1：参照先がシンボリックリンクで dist の外を指していれば、例外にする', () => {
    // Arrange：main.js を、dist の外のファイルへのリンクにする
    const dir = copySite();
    const outside = join(copySite(), 'outside.js');
    writeFileSync(outside, '// outside\n');
    rmSync(join(dir, '_next/static/chunks/main.js'));
    symlinkSync(outside, join(dir, '_next/static/chunks/main.js'));

    // Act・Assert
    expect(() => measureLang(dir, 'ja')).toThrow(/シンボリックリンク/u);
  });

  test('S1：dist の中を指すシンボリックリンクと、`..` で始まるファイル名（`..x.js`）は数える', () => {
    // Arrange
    const dir = copySite();
    writeFileSync(join(dir, '_next/static/chunks/..x.js'), '// dot dot\n');
    symlinkSync(join(dir, '_next/static/chunks/lazy.js'), join(dir, '_next/static/chunks/link.js'));
    const htmlPath = join(dir, 'ja/index.html');
    writeFileSync(htmlPath, readFileSync(htmlPath, 'utf8').replace('</head>', '<script src="/_next/static/chunks/..x.js"></script><script src="/_next/static/chunks/link.js"></script></head>'));

    // Act
    const report = measureLang(dir, 'ja');

    // Assert
    expect(report.files).toContain('/_next/static/chunks/..x.js');
    expect(report.files).toContain('/_next/static/chunks/link.js');
    expect(report.js.count).toBe(4);
  });
});

describe('run', () => {
  const args = (...rest: readonly string[]): readonly string[] => ['--dist', SITE, ...rest];
  const capture = (): { lines: string[]; warnings: string[]; io: { write: (line: string) => void; warn: (line: string) => void } } => {
    const lines: string[] = [];
    const warnings: string[] = [];
    return { lines, warnings, io: { write: line => lines.push(line), warn: line => warnings.push(line) } };
  };

  test('5.1：基準値を超えた言語があれば終了コード 1、なければ 0', () => {
    // Arrange
    const under = capture();
    const over = capture();
    const total = measureLang(SITE, 'ja').total.gzip;
    const budgetKB = (total / 1000) * 0.99;

    // Act・Assert
    expect(run(args('--budget', '300'), under.io)).toBe(0);
    expect(run(args('--budget', String(budgetKB)), over.io)).toBe(1);
    expect(over.lines.join('\n')).toContain('超過');
    expect(under.lines.join('\n')).toContain('収まる');
  });

  test('5.1：言語ごとの Markdown の表を出す', () => {
    const { lines, io } = capture();

    run(args(), io);

    const text = lines.join('\n');
    expect(text).toContain('## ja');
    expect(text).toContain('## en');
    expect(text).toContain('## zh');
    expect(text).toContain('| HTML 全体 |');
    expect(text).toContain('| 合計（HTML 全体＋JS＋CSS） |');
  });

  test('5.1：--json は言語ごとの結果を JSON で出す', () => {
    const { lines, io } = capture();

    const code = run(args('--json', '--budget', '300'), io);

    const parsed = JSON.parse(lines.join('\n')) as { budgetKB: number; ok: boolean; results: { lang: string; total: { gzip: number } }[] };
    expect(code).toBe(0);
    expect(parsed.budgetKB).toBe(300);
    expect(parsed.ok).toBe(true);
    expect(parsed.results.map(r => r.lang)).toEqual(['ja', 'en', 'zh']);
    expect(parsed.results[0]?.total.gzip).toBe(measureLang(SITE, 'ja').total.gzip);
  });

  test('5.1：dist がない・基準値が正の数でない・知らない引数なら、メッセージを出して終了コード 2', () => {
    const cases = [['--dist', join(SITE, 'none')], args('--budget', '0'), args('--budget', 'abc'), args('--unknown')];

    const codes = cases.map(argv => {
      const { warnings, io } = capture();
      const code = run(argv, io);
      expect(warnings.length).toBeGreaterThan(0);
      return code;
    });

    expect(codes).toEqual([2, 2, 2, 2]);
  });

  /** 英語のページだけに外部の script を足した dist */
  const withExternal = (url: string): string => {
    const dir = copySite();
    const htmlPath = join(dir, 'en/index.html');
    writeFileSync(htmlPath, readFileSync(htmlPath, 'utf8').replace('</head>', `<script src="${url}"></script></head>`));
    return dir;
  };

  test('M1：数えられなかった参照（外部の URL など）があれば、言語つきで warn に出し、基準値に収まっていても終了コード 2', () => {
    // Arrange
    const dir = withExternal('https://static.cloudflareinsights.com/beacon.min.js');
    const { lines, warnings, io } = capture();

    // Act
    const code = run(['--dist', dir, '--budget', '300'], io);

    // Assert
    expect(code).toBe(2);
    expect(warnings[0]).toMatch(/^\[en\] "https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js"/u);
    expect(warnings).toHaveLength(2);
    expect(lines.join('\n')).toContain('## en');
  });

  test('M1：--allow-external で許した参照は、見込みのバイト数を合計に足し、収まれば 0・超えれば 1', () => {
    // Arrange
    const url = 'https://static.example.com/beacon.min.js?a=b';
    const dir = withExternal(url);
    const base = measureLang(dir, 'en', new Map([[url, 0]])).total.gzip;
    const bytes = 5000;
    const under = capture();
    const over = capture();

    // Act
    const okCode = run(['--dist', dir, '--json', '--allow-external', `${url}=${bytes}`], under.io);
    const overCode = run(['--dist', dir, '--budget', String((base + bytes - 1) / 1000), '--allow-external', `${url}=${bytes}`], over.io);

    // Assert
    const en = (JSON.parse(under.lines.join('\n')) as { results: { lang: string; total: { gzip: number; raw: number }; external: { count: number; gzip: number } }[] }).results[1];
    expect(okCode).toBe(0);
    expect(under.warnings).toEqual([]);
    expect(en?.lang).toBe('en');
    expect(en?.external).toMatchObject({ count: 1, gzip: bytes });
    expect(en?.total.gzip).toBe(base + bytes);
    expect(overCode).toBe(1);
    expect(over.lines.join('\n')).toContain('外部の参照（見込み。1 件）');
    expect(over.warnings).toEqual([]);
  });

  test('M1：--allow-external は、許していない別の参照が残っていれば、2 のまま', () => {
    const dir = withExternal('https://other.example.com/x.js');
    const { io } = capture();

    expect(run(['--dist', dir, '--allow-external', 'https://static.example.com/b.js=100'], io)).toBe(2);
  });

  test('M1：--allow-external の値が <URL>=<バイト数> の形でなければ、終了コード 2', () => {
    const codes = ['no-equals', '=100', 'https://x.example/a.js=abc', 'https://x.example/a.js=-1', 'https://x.example/a.js='].map(value => {
      const { warnings, io } = capture();
      const code = run(args('--allow-external', value), io);
      expect(warnings.join('')).toContain('--allow-external');
      return code;
    });

    expect(codes).toEqual([2, 2, 2, 2, 2]);
  });

  test('M2：HTML が指す JS が dist になければ、run は終了コード 2 とそのパスを含むメッセージを返す', () => {
    const dir = copySite();
    rmSync(join(dir, '_next/static/chunks/main.js'));
    const { warnings, io } = capture();

    const code = run(['--dist', dir], io);

    expect(code).toBe(2);
    expect(warnings.join('')).toContain('/_next/static/chunks/main.js');
  });
});
