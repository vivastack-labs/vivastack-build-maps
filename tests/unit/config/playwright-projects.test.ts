import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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

  it('5.3：E2E は PC／タッチの区別を test.skip ではなくタグ（@pc・@touch）で書く', () => {
    const offenders = readdirSync(E2E_DIR)
      .filter(file => file.endsWith('.ts'))
      .flatMap(file =>
        readFileSync(join(E2E_DIR, file), 'utf8')
          .split('\n')
          .map((line, index) => ({ file, line, number: index + 1 }))
          .filter(({ line }) => /test\.skip\([^)]*\b(hasTouch|isMobile)\b/.test(line))
          .map(({ file: name, number }) => `${name}:${number}`)
      );
    expect(offenders).toEqual([]);
  });
});
