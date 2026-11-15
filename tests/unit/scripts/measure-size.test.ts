import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';
import { describe, expect, test } from 'vitest';
import { assetPaths, measure, measureLang, run, splitHtml } from '../../../scripts/measure-size';

const SITE = join(import.meta.dirname, '../../fixtures/measure-size/site');
const read = (path: string): Buffer => readFileSync(join(SITE, path));
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

    expect(assetPaths(html)).toEqual({ paths: ['/_next/ok.js'], warnings: [] });
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

    const { paths, warnings } = assetPaths(html);

    expect(paths).toEqual(['/_next/ok.css']);
    expect(warnings).toHaveLength(7);
    expect(warnings[0]).toContain('https://cdn.example.com/x.js');
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

  test('5.1：HTML が読み込むファイルが dist になければ、エラーにする', () => {
    expect(() => measureLang(join(SITE, 'ja'), 'ja')).toThrow(/index\.html/u);
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

  test('5.1：数えなかった参照（外部の URL など）は、言語つきで warn に出し、表には数えない', () => {
    // Arrange：外部の URL の script を足した dist
    const dir = mkdtempSync(join(tmpdir(), 'measure-size-'));
    cpSync(SITE, dir, { recursive: true });
    const htmlPath = join(dir, 'en/index.html');
    writeFileSync(htmlPath, readFileSync(htmlPath, 'utf8').replace('</head>', '<script src="https://cdn.example.com/x.js"></script></head>'));
    const { warnings, io } = capture();

    // Act
    const code = run(['--dist', dir], io);
    rmSync(dir, { recursive: true, force: true });

    // Assert
    expect(code).toBe(0);
    expect(warnings).toEqual([expect.stringMatching(/^\[en\] https:\/\/cdn\.example\.com\/x\.js/u)]);
  });
});
