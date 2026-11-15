import { createHash } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { MODE_INIT_SCRIPT } from '@/features/mode/initScript';
import {
  assembleDist,
  assembleDistWithCsp,
  htmlProblems,
  injectCsp,
  inlineScripts,
  KNOWN_EXACT_INLINE_SCRIPTS,
  pageCsp,
  scriptHash,
  unknownInlineScripts,
  writePageCsp
} from '../../../scripts/postbuild';

// rmSync は ふだんは本物を呼ぶ。後始末の失敗を作るテストだけ、1回ごとに差し替える
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, rmSync: vi.fn(actual.rmSync) };
});

// D35：専用のドメインで配信するので、out/ をそのままの構成で dist/ に組み立てる（6.4）
describe('assembleDist', () => {
  let root: string;
  let outDir: string;
  let distDir: string;

  const put = (base: string, path: string, body: string): void => {
    const file = join(base, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, body);
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'postbuild-'));
    outDir = join(root, 'out');
    distDir = join(root, 'dist');
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('D35：out/ をそのままの構成で dist/ にコピーし、前の dist/ は消す', () => {
    // Arrange
    put(outDir, '_redirects', 'redirects');
    put(outDir, '_headers', 'headers');
    put(outDir, 'ja/index.html', 'ja');
    put(outDir, '_next/static/chunks/a.js', 'js');
    put(outDir, '404.html', 'not found');
    put(distDir, 'stale.html', 'old');

    // Act
    assembleDist({ outDir, distDir });

    // Assert
    expect(readFileSync(join(distDir, '_redirects'), 'utf8')).toBe('redirects');
    expect(readFileSync(join(distDir, '_headers'), 'utf8')).toBe('headers');
    expect(readFileSync(join(distDir, 'ja/index.html'), 'utf8')).toBe('ja');
    expect(readFileSync(join(distDir, '_next/static/chunks/a.js'), 'utf8')).toBe('js');
    expect(readFileSync(join(distDir, '404.html'), 'utf8')).toBe('not found');
    expect(existsSync(join(distDir, 'stale.html'))).toBe(false);
  });

  test.each(['_redirects', '_headers'])('R7：out/ に %s がなければエラーにする', missing => {
    // Arrange
    for (const file of ['_redirects', '_headers'].filter(name => name !== missing)) {
      put(outDir, file, 'x');
    }
    put(outDir, 'ja/index.html', 'ja');

    // Act & Assert
    expect(() => assembleDist({ outDir, distDir })).toThrow(missing);
  });

  test.each([
    ['同じ', (out: string) => out],
    ['out/ の中', (out: string) => join(out, 'dist')],
    ['dist/ の中に out/', (out: string) => dirname(out)]
  ])('R7：dist/ と out/ が重なるとき（%s）はエラーにし、out/ を消さない', (_label, toDist) => {
    // Arrange
    put(outDir, '_redirects', 'x');
    put(outDir, '_headers', 'x');

    // Act & Assert
    expect(() => assembleDist({ outDir, distDir: toDist(outDir) })).toThrow();
    expect(existsSync(join(outDir, '_redirects'))).toBe(true);
  });

  test('R7：out/ にシンボリックリンクがあればエラーにする', () => {
    // Arrange
    put(outDir, '_redirects', 'x');
    put(outDir, '_headers', 'x');
    put(root, 'outside.txt', 'secret');
    symlinkSync(join(root, 'outside.txt'), join(outDir, 'link.txt'));

    // Act & Assert
    expect(() => assembleDist({ outDir, distDir })).toThrow('link.txt');
  });

  test('R7：out/ がなければエラーにする', () => {
    // Act & Assert
    expect(() => assembleDist({ outDir, distDir })).toThrow();
  });
});

// 5.5・R9：インラインスクリプトの SHA-256 を <meta http-equiv="Content-Security-Policy"> に書く
describe('scriptHash', () => {
  test('5.5：scriptHash は既知の文字列から正しい SHA-256（base64）を返す', () => {
    // 空文字列と "abc" の SHA-256 は公知の値
    expect(scriptHash('')).toBe("'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='");
    expect(scriptHash('abc')).toBe("'sha256-ungWv48Bz+pBQUDeXa4iI7ADYaOWF3qctBD/YfIAFa0='");
  });
});

describe('scriptHash の改行', () => {
  test('5.5（L3）：scriptHash は \\r\\n・\\r を \\n に直してから取る（HTML のパーサーと同じ）', () => {
    expect(scriptHash('a\r\nb\rc')).toBe(scriptHash('a\nb\nc'));
  });
});

describe('unknownInlineScripts', () => {
  const TURBOPACK = '(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push(';

  test('5.5（M1・L1）：知っている形（完全一致の文字列・RSC のデータ・Turbopack の JSON）は通す', () => {
    // Arrange：実際の出力の形
    const known = [
      MODE_INIT_SCRIPT,
      '(self.__next_f=self.__next_f||[]).push([0])',
      'self.__next_f.push([1,"a\\"b\\n\\u003c"])',
      'self.__next_f.push([2,null])',
      'self.__next_f.push([3])',
      `${TURBOPACK}{"otherChunks":["static/chunks/a.js"],"runtimeModuleIds":[5795]});`
    ];

    // Act & Assert
    expect(unknownInlineScripts(known)).toEqual([]);
    expect(KNOWN_EXACT_INLINE_SCRIPTS).toContain(MODE_INIT_SCRIPT);
  });

  test.each([
    ['self.__next_f.push([1,"a<b"])'],
    ['self.__next_f.push([1,"<!--"])'],
    ['self.__next_f.push([1,"</script>"])'],
    ['(globalThis["TURBOPACK"] || (globalThis["TURBOPACK"] = [])).push({"a":"<!--"});']
  ])('5.5（L3）：知っている形でも < を含むインラインスクリプトは止める（script の解析がブラウザと食い違わないように）：%s', script => {
    expect(unknownInlineScripts([script])).toEqual([script]);
  });

  test('5.5（L3）：MODE_INIT_SCRIPT と完全一致の文字列に < はない（< を止めても許可が減らない）', () => {
    for (const script of KNOWN_EXACT_INLINE_SCRIPTS) {
      expect(script).not.toContain('<');
      expect(unknownInlineScripts([script])).toEqual([]);
    }
  });

  test('5.5（M1・L1）：知っている形に続けて別のコードがある・形が少し違うものは止める（全体に一致させる）', () => {
    // Arrange
    const unknown = [
      'alert(1)',
      `${MODE_INIT_SCRIPT};alert(1)`,
      ' self.__next_f.push([1,"a"])',
      'self.__next_f.push([1,"a"]);alert(1)',
      'self.__next_f.push([1,"a"+alert(1)+"b"])',
      'self.__next_f.push([1,"a\\"+alert(1)])',
      'self.__next_f.push([1,alert(1)])',
      'self.__next_f.push([x,"a"])',
      '(self.__next_f=self.__next_f||[]).push([0]);alert(1)',
      '(self.__next_f=alert(1)||[]).push([0])',
      `${TURBOPACK}{"a":1});alert(1);(`,
      `${TURBOPACK}alert(1));`,
      `${TURBOPACK}[1,2]);`,
      `${TURBOPACK}{"a":1})`,
      `${TURBOPACK}{"a":1});alert(1)`
    ];

    // Act & Assert
    expect(unknownInlineScripts(unknown)).toEqual(unknown);
  });
});

describe('htmlProblems', () => {
  const head = '<!DOCTYPE html><html><head><meta charSet="utf-8"/>';

  test('5.5（M2）：知っている形の HTML（script の中身に style= や <style があっても）には問題がない', () => {
    const html = `${head}<link rel="stylesheet" href="/a.css"/><script src="/a.js"></script><script>self.__next_f.push([1,"<style>a{}</style> style=x"])</script></head><body><div class="a style=b" data-style="x" aria-label="style = y"></div><script type="application/json">{"style":1}</script></body></html>`;

    expect(htmlProblems(html)).toEqual([]);
  });

  test.each([
    ['<style> 要素', `${head}<style>a{}</style></head><body></body></html>`, '<style>'],
    ['<style> 要素（属性つき）', `${head}<style media="x">a{}</style></head><body></body></html>`, '<style>'],
    ['style 属性', `${head}</head><body><div style="color:red"></div></body></html>`, 'style 属性'],
    ['style 属性（SVG・スペースなし）', `${head}</head><body><svg><g class="a"style="x"/></svg></body></html>`, 'style 属性'],
    ['style 属性（大文字・= の前に空白）', `${head}</head><body><p STYLE = "x"></p></body></html>`, 'style 属性'],
    ['<meta charset> の前の script', '<html><head><script src="/a.js"></script><meta charSet="utf-8"/></head></html>', '<meta charset> より前'],
    ['<meta charset> の前の link', '<html><head><link rel="stylesheet" href="/a.css"/><meta charset="utf-8"/></head></html>', '<meta charset> より前'],
    ['speculationrules', `${head}<script type="speculationrules">{}</script></head></html>`, 'speculationrules'],
    ['importmap', `${head}<script type="importmap">{}</script></head></html>`, 'importmap'],
    ['text/plain の script', `${head}<script type="text/plain">x</script></head></html>`, 'text/plain']
  ])('5.5（M2）：%s があれば問題として返す', (_label, html, expected) => {
    // Act
    const problems = htmlProblems(html);

    // Assert
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.join('\n')).toContain(expected);
  });

  test('5.5（M2）：JavaScript（type なし・module・text/javascript）と JSON（application/json・ld+json）の script は問題にしない', () => {
    const scripts = [
      '<script>a()</script>',
      '<script type="module">a()</script>',
      '<script type="text/javascript">a()</script>',
      '<script type="application/json">{}</script>',
      '<script type="application/ld+json">{}</script>'
    ];

    expect(htmlProblems(`${head}${scripts.join('')}</head></html>`)).toEqual([]);
  });
});

describe('inlineScripts', () => {
  test('5.5：inlineScripts は src のない script だけを集め、JavaScript でない type（application/json など）を除く', () => {
    // Arrange
    const html = [
      '<script src="/a.js" async=""></script>',
      '<script>self.__next_f.push([1,"a"])</script>',
      '<script id="_R_">var x=1</script>',
      '<script type="module">import "/m.js"</script>',
      '<SCRIPT>upper()</SCRIPT>',
      '<script type="application/json">{"a":1}</script>',
      '<script type="application/ld+json">{"@context":"x"}</script>',
      '<script data-note=">" >quoted()</script>',
      '<script src="/b.js">ignored</script>'
    ].join('');

    // Act
    const scripts = inlineScripts(html);

    // Assert
    expect(scripts).toEqual(['self.__next_f.push([1,"a"])', 'var x=1', 'import "/m.js"', 'upper()', 'quoted()']);
  });

  test('D23：MODE_INIT_SCRIPT のハッシュは、HTML から集めたハッシュに入る', () => {
    // Arrange
    const html = `<head><script>${MODE_INIT_SCRIPT}</script></head>`;
    const expected = `'sha256-${createHash('sha256').update(MODE_INIT_SCRIPT, 'utf8').digest('base64')}'`;

    // Act
    const hashes = inlineScripts(html).map(scriptHash);

    // Assert
    expect(hashes).toContain(expected);
  });
});

describe('pageCsp', () => {
  test('5.5：pageCsp はハッシュを重複なしで script-src に入れ、frame-ancestors を含まない', () => {
    // Act
    const csp = pageCsp(["'sha256-aaa='", "'sha256-bbb='", "'sha256-aaa='"]);

    // Assert
    expect(csp).toContain("script-src 'self' 'sha256-aaa=' 'sha256-bbb=' https://static.cloudflareinsights.com;");
    expect(csp.match(/sha256-aaa=/gu)).toHaveLength(1);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("style-src 'self';");
    expect(csp).toContain("connect-src 'self' https://cloudflareinsights.com;");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain('frame-ancestors');
    expect(csp).not.toContain('unsafe-inline');
  });
});

describe('injectCsp', () => {
  const csp = "default-src 'self'; script-src 'self'";

  test('5.5：injectCsp は <meta charset> の直後（最初の script より前）に CSP の meta を入れる', () => {
    // Arrange（React は charSet と書く）
    const html = '<!DOCTYPE html><html><head><meta charSet="utf-8"/><meta name="viewport" content="x"/><script>a()</script></head><body></body></html>';

    // Act
    const out = injectCsp(html, csp);

    // Assert
    const charset = out.indexOf('<meta charSet="utf-8"/>') + '<meta charSet="utf-8"/>'.length;
    const meta = `<meta http-equiv="Content-Security-Policy" content="${csp}"/>`;
    expect(out.indexOf(meta)).toBe(charset);
    expect(out.indexOf(meta)).toBeLessThan(out.indexOf('<script>'));
    expect(out.replace(meta, '')).toBe(html);
  });

  test('5.5：<meta charset> がない HTML、CSP の meta がすでにある HTML は例外にする', () => {
    // Arrange
    const withCsp = injectCsp('<head><meta charset="utf-8"></head>', csp);

    // Act & Assert
    expect(() => injectCsp('<head><title>x</title></head>', csp)).toThrow('meta charset');
    expect(() => injectCsp(withCsp, csp)).toThrow('すでに');
  });

  test.each(['"', '&', '<', '>'])('5.5（L7）：CSP に %s を含むと属性を壊す・解釈が変わるので例外にする', char => {
    expect(() => injectCsp('<head><meta charset="utf-8"></head>', `a${char}b`)).toThrow();
  });
});

describe('writePageCsp', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'postbuild-csp-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  // 知っている形（Next.js の RSC のデータ）のスクリプトを持つページ
  const next = (id: string): string => `self.__next_f.push([1,"${id}"])`;
  const page = (script: string): string => `<!DOCTYPE html><html><head><meta charSet="utf-8"/><script src="/x.js"></script><script>${script}</script></head><body></body></html>`;
  const put = (path: string, body: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  };
  const metaOf = (path: string): string => {
    const match = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"\/>/u.exec(readFileSync(join(root, path), 'utf8'));
    if (!match) throw new Error(`${path} に CSP の meta がありません`);
    return match[1] ?? '';
  };

  test('5.5：dist/ のすべての HTML に、そのページのハッシュの CSP を書く（ほかのファイルは変えない）', () => {
    // Arrange
    put('ja/index.html', page(next('ja')));
    put('en/index.html', page(next('en')));
    put('404.html', page(next('nf')));
    put('_not-found/index.html', page(next('nf')));
    put('_headers', '/*\n  X-Frame-Options: DENY\n');
    put('_next/static/a.js', 'var a=1;');
    put('geo/muni/01.topo.json', '{}');

    // Act
    const count = writePageCsp(root);

    // Assert
    expect(count).toBe(4);
    expect(metaOf('ja/index.html')).toContain(scriptHash(next('ja')));
    expect(metaOf('ja/index.html')).not.toContain(scriptHash(next('en')));
    expect(metaOf('en/index.html')).toContain(scriptHash(next('en')));
    expect(metaOf('404.html')).toContain(scriptHash(next('nf')));
    expect(metaOf('_not-found/index.html')).toContain(scriptHash(next('nf')));
    expect(readFileSync(join(root, '_headers'), 'utf8')).toBe('/*\n  X-Frame-Options: DENY\n');
    expect(readFileSync(join(root, '_next/static/a.js'), 'utf8')).toBe('var a=1;');
    expect(readFileSync(join(root, 'geo/muni/01.topo.json'), 'utf8')).toBe('{}');
  });

  test('5.5（M2）：style 属性・<style>・<meta charset> の前の script がある HTML は、ファイル名つきの例外にして何も書かない', () => {
    // Arrange
    put('ja/index.html', page(next('ja')));
    put('en/index.html', `<!DOCTYPE html><html><head><meta charSet="utf-8"/></head><body><div style="color:red"></div></body></html>`);

    // Act & Assert
    expect(() => writePageCsp(root)).toThrow(/en[\\/]index\.html.*style 属性/u);
    expect(readFileSync(join(root, 'ja/index.html'), 'utf8')).toBe(page(next('ja')));
  });

  test('5.5：すでに CSP の meta がある dist/ に再び書くと例外にする（二重に入れない）', () => {
    // Arrange
    put('ja/index.html', page(next('ja')));
    writePageCsp(root);

    // Act & Assert
    expect(() => writePageCsp(root)).toThrow('すでに');
  });

  test('5.5（M1）：知っている形に合わないインラインスクリプトがある HTML は、ファイル名つきの例外にして何も書かない', () => {
    // Arrange
    put('ja/index.html', page(next('ja')));
    put('en/index.html', page('alert(document.cookie)'));

    // Act & Assert
    expect(() => writePageCsp(root)).toThrow(/en[\\/]index\.html.*alert\(document\.cookie\)/u);
    expect(readFileSync(join(root, 'ja/index.html'), 'utf8')).toBe(page(next('ja')));
  });

  test('5.5：HTML が1つもないときは例外にする', () => {
    expect(() => writePageCsp(root)).toThrow('HTML');
  });
});

describe('assembleDistWithCsp', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'postbuild-with-csp-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  const put = (path: string, body: string): void => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  };

  /** 3言語の HTML（Service Worker のプリキャッシュに要る。U13）。`ja` の中身だけ変えられる */
  const putPages = (ja = '<head><meta charSet="utf-8"/><script>self.__next_f.push([1,"a"])</script></head>'): void => {
    put('out/ja/index.html', ja);
    put('out/en/index.html', '<head><meta charSet="utf-8"/></head>');
    put('out/zh/index.html', '<head><meta charSet="utf-8"/></head>');
    for (const lang of ['ja', 'en', 'zh']) put(`out/${lang}/app.webmanifest`, '{}');
    put('out/_next/static/chunks/a.js', 'js');
    put('out/icons/icon-192.png', 'png');
  };

  const options = (): { outDir: string; distDir: string } => ({ outDir: join(root, 'out'), distDir: join(root, 'dist') });

  test('5.5：out/ を dist/ に組み立てて、全 HTML に CSP の meta を書く', async () => {
    // Arrange
    put('out/_redirects', 'x');
    put('out/_headers', 'x');
    putPages();

    // Act
    await assembleDistWithCsp(options());

    // Assert
    expect(readFileSync(join(root, 'dist/ja/index.html'), 'utf8')).toContain('Content-Security-Policy');
  });

  test('U13：sw.js を作る。プリキャッシュの版は、CSP を書いた後の HTML の内容のハッシュ', async () => {
    // Arrange
    put('out/_redirects', 'x');
    put('out/_headers', 'x');
    putPages();

    // Act
    await assembleDistWithCsp(options());

    // Assert：out/ の HTML（CSP なし）ではなく、dist/ の HTML（CSP あり）のハッシュ
    const dist = readFileSync(join(root, 'dist/ja/index.html'));
    const out = readFileSync(join(root, 'out/ja/index.html'));
    const sw = readFileSync(join(root, 'dist/sw.js'), 'utf8');
    expect(sw).toContain(`{url:"ja/",revision:"${createHash('md5').update(dist).digest('hex')}"}`);
    expect(sw).not.toContain(createHash('md5').update(out).digest('hex'));
  });

  test('U13：sw.js を作れなければ（3言語の HTML がない）、sw.js のない dist/ を残さずに、元の例外を投げ直す', async () => {
    // Arrange
    put('out/_redirects', 'x');
    put('out/_headers', 'x');
    put('out/ja/index.html', '<head><meta charSet="utf-8"/></head>');

    // Act・Assert
    await expect(assembleDistWithCsp(options())).rejects.toThrow('en/index.html');
    expect(existsSync(join(root, 'dist'))).toBe(false);
    expect(existsSync(join(root, 'out/ja/index.html'))).toBe(true);
  });

  test('5.5（L2）：dist/ へのコピーが途中で失敗しても、中途半端な dist/ を残さずに、元の例外を投げ直す', async () => {
    // Arrange：読めないファイルがあると、コピーが途中で失敗する（root は権限を無視するので、このテストは動かさない）
    if (process.getuid?.() === 0) return;
    put('out/_redirects', 'x');
    put('out/_headers', 'x');
    put('out/ja/index.html', '<head><meta charSet="utf-8"/></head>');
    put('out/ja/secret.txt', 'x');
    chmodSync(join(root, 'out/ja/secret.txt'), 0o000);

    // Act・Assert
    await expect(assembleDistWithCsp(options())).rejects.toThrow(/EACCES|permission/iu);
    expect(existsSync(join(root, 'dist'))).toBe(false);
  });

  test('5.5（L2）：dist/ を消すのに失敗しても、元の例外を投げる（消す側の例外で元の原因を隠さない）', async () => {
    // Arrange：1回目（組み立ての前の掃除）は本物、2回目（失敗の後の後始末）は失敗にする
    put('out/_redirects', 'x');
    put('out/_headers', 'x');
    putPages('<head><meta charSet="utf-8"/><script>alert(1)</script></head>');
    const actual = vi.mocked(rmSync).getMockImplementation();
    vi.mocked(rmSync)
      .mockImplementationOnce((...args) => actual?.(...args))
      .mockImplementationOnce(() => {
        throw new Error('EBUSY：消せません');
      });

    // Act・Assert
    await expect(assembleDistWithCsp(options())).rejects.toThrow('知らない形');
  });

  test('R7：dist/ と out/ が重なるときは、assembleDist の例外を投げ、out/ を消さない', async () => {
    // Arrange
    put('out/_redirects', 'x');
    put('out/_headers', 'x');

    // Act・Assert
    await expect(assembleDistWithCsp({ outDir: join(root, 'out'), distDir: join(root, 'out') })).rejects.toThrow('重なっています');
    expect(existsSync(join(root, 'out/_redirects'))).toBe(true);
  });

  test('5.5：CSP を書けなかったときは、CSP のない dist/ を残さずに、元の例外を投げ直す', async () => {
    // Arrange
    put('out/_redirects', 'x');
    put('out/_headers', 'x');
    putPages('<head><meta charSet="utf-8"/><script>alert(1)</script></head>');

    // Act・Assert
    await expect(assembleDistWithCsp(options())).rejects.toThrow('知らない形');
    expect(existsSync(join(root, 'dist'))).toBe(false);
    expect(existsSync(join(root, 'out/ja/index.html'))).toBe(true);
  });
});
