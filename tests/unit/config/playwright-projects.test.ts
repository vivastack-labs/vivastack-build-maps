import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';
import config from '../../../playwright.config';

const ROOT = join(__dirname, '..', '..', '..');
const E2E_DIR = join(ROOT, 'tests', 'e2e');

type Project = NonNullable<typeof config.projects>[number];

const projects: readonly Project[] = config.projects ?? [];

/** プロジェクトの viewport の幅（端末の定義かプロジェクトの指定。なければ undefined） */
function widthOf(project: Project): number | undefined {
  return project.use?.viewport?.width;
}

function byName(name: string): Project {
  const found = projects.find(project => project.name === name);
  if (!found) throw new Error(`プロジェクトがない：${name}`);
  return found;
}

/** テストの引数で受け取らない Playwright のフィクスチャ。PC／タッチは `@pc`・`@touch` のタグ、「代表の1つ」は `testInfo.project.name` で書く */
const FORBIDDEN_FIXTURES = ['hasTouch', 'isMobile', 'browserName'] as const;

/** 受け取ってよいファイルと理由（操作の一部を分けるだけで、テストそのものはすべてのプロジェクトで動かす場合） */
const FIXTURE_EXCEPTIONS: Readonly<Record<string, string>> = {
  'csp.spec.ts': 'マウスのホバー（hover）だけを PC に分ける。CSP 違反の検査そのものはタッチの端末でも動かす'
};

/** ファイルの下の `.ts` を再帰的に集める */
function listTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listTsFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

/**
 * ソースの中で、分割代入（`({ page, hasTouch })` など。複数行も）の中に禁止のフィクスチャがある箇所を返す。
 * 行コメントは除く。`hasTouch: false`（`test.use` の設定）は見ない
 */
function findFixtureUses(source: string): string[] {
  const code = source.replace(/(^|\s)\/\/.*$/gm, '$1');
  const found: string[] = [];
  for (const pattern of code.matchAll(/\(\{([^{}]*)\}/g)) {
    for (const name of FORBIDDEN_FIXTURES) {
      if (new RegExp(`\\b${name}\\b(?!\\s*:)`).test(pattern[1] ?? '')) found.push(name);
    }
  }
  return found;
}

/** e2e.yml の「Install Playwright browsers」の run のスクリプト */
function installScript(): string {
  const workflow = parse(readFileSync(join(ROOT, '.github', 'workflows', 'e2e.yml'), 'utf8')) as {
    jobs: { e2e: { steps: { name?: string; run?: string }[] } };
  };
  const step = workflow.jobs.e2e.steps.find(candidate => candidate.name === 'Install Playwright browsers');
  if (!step?.run) throw new Error('Install Playwright browsers のステップがない');
  return step.run;
}

/** スクリプトの `case` で、そのプロジェクトのときに導入されるブラウザ（`*` は残りのすべて） */
function browsersInstalledFor(script: string, project: string): string[] {
  for (const match of script.matchAll(/^\s*(.+?)\)\s*browsers="([^"]*)"\s*;;/gm)) {
    const patterns = (match[1] ?? '').split('|').map(pattern => pattern.trim());
    if (patterns.includes(project) || patterns.includes('*')) return (match[2] ?? '').split(' ').filter(Boolean);
  }
  return [];
}

describe('playwright.config.ts のプロジェクト（開発概要書 5.3、T4-06）', () => {
  it('5.3：PC のプロジェクトは @touch を、タッチのプロジェクトは @pc を除く', () => {
    expect(projects.length).toBeGreaterThan(0);
    for (const project of projects) {
      const expected = project.use?.hasTouch ? '@pc' : '@touch';
      expect(String(project.grepInvert), `${project.name} の grepInvert`).toBe(`/${expected}/`);
    }
  });

  it('5.3：画面幅 360・768・1024・1366px のプロジェクトがある', () => {
    const widths = projects.map(widthOf);
    for (const width of [360, 768, 1024, 1366]) {
      expect(widths, `${width}px`).toContain(width);
    }
  });

  it('5.3：PC・スマホ・タブレット（iPad の縦・横、Android）のプロジェクトがある', () => {
    const names = projects.map(project => project.name);
    expect(names).toEqual(expect.arrayContaining(['chromium', 'firefox', 'webkit', 'chromebook', 'iphone', 'pixel', 'ipad-portrait', 'ipad-landscape', 'android-tablet']));
    // 向きが縦・横で、iPad・Android のタブレットがタッチの端末である
    const portrait = byName('ipad-portrait');
    const landscape = byName('ipad-landscape');
    expect(portrait.use?.hasTouch).toBe(true);
    expect(landscape.use?.hasTouch).toBe(true);
    expect(portrait.use?.viewport?.width).toBeLessThan(portrait.use?.viewport?.height ?? 0);
    expect(landscape.use?.viewport?.width).toBeGreaterThan(landscape.use?.viewport?.height ?? 0);
    expect(byName('android-tablet').use?.hasTouch).toBe(true);
    expect(byName('chromebook').use?.hasTouch).toBeFalsy();
  });

  it('T0-04：e2e.yml の project の選択肢が、all と全プロジェクトの名前に一致する', () => {
    const workflow = parse(readFileSync(join(ROOT, '.github', 'workflows', 'e2e.yml'), 'utf8')) as {
      on: { workflow_dispatch: { inputs: { project: { options: string[] } } } };
    };
    const options = workflow.on.workflow_dispatch.inputs.project.options;
    expect([...options].sort()).toEqual(['all', ...projects.map(project => project.name)].sort());
  });

  it('T0-04：e2e.yml の case で導入されるブラウザが、プロジェクトの defaultBrowserType と合う', () => {
    const script = installScript();
    const mismatches = projects.flatMap(project => {
      const expected = project.use?.defaultBrowserType;
      const installed = browsersInstalledFor(script, project.name ?? '');
      return installed.length === 1 && installed[0] === expected ? [] : [`${project.name}：導入 ${installed.join(',')}／必要 ${expected}`];
    });
    expect(mismatches).toEqual([]);
    expect(browsersInstalledFor(script, 'all')).toEqual(['chromium', 'firefox', 'webkit']);
  });
});

describe('E2E の書き方の決まり（5.3、T4-06）', () => {
  it('5.3：テストの引数で hasTouch・isMobile・browserName を受け取らない（PC／タッチはタグ、代表の1つは project.name で書く）', () => {
    const offenders = listTsFiles(E2E_DIR).flatMap(file => {
      const name = relative(E2E_DIR, file);
      if (name in FIXTURE_EXCEPTIONS) return [];
      return findFixtureUses(readFileSync(file, 'utf8')).map(use => `${name}：${use}`);
    });
    expect(offenders).toEqual([]);
  });

  it('5.3：例外の一覧は、実際にその引数を使っているファイルだけ（使わなくなったら消す）', () => {
    const stale = Object.keys(FIXTURE_EXCEPTIONS).filter(name => findFixtureUses(readFileSync(join(E2E_DIR, name), 'utf8')).length === 0);
    expect(stale).toEqual([]);
  });

  it('検出：1行・複数行（Prettier の折り返し）・beforeEach・関数呼び出しを含む引数を見つける', () => {
    expect(findFixtureUses("test('a', async ({ page, hasTouch }) => {});")).toEqual(['hasTouch']);
    expect(findFixtureUses("test('a', async ({\n  page,\n  isMobile\n}) => {});")).toEqual(['isMobile']);
    expect(findFixtureUses('test.beforeEach(({ browserName }) => {});')).toEqual(['browserName']);
    expect(findFixtureUses("test.skip(foo(bar) && hasTouch, 'x'); test('a', async ({ page, browserName }) => {});")).toEqual(['browserName']);
    expect(findFixtureUses("test.fixme('a', async ({ page, hasTouch }) => {});")).toEqual(['hasTouch']);
  });

  it('検出：プロジェクトの名前での判定・コメント・test.use の設定は見つけない', () => {
    expect(findFixtureUses("test('a', async ({ page }, testInfo) => { test.skip(testInfo.project.name !== 'chromium', 'x'); });")).toEqual([]);
    expect(findFixtureUses('// 端末の（isMobile）は ({ hasTouch }) と違う\ntest.use({ hasTouch: false });')).toEqual([]);
  });
});
