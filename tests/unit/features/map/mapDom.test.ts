// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from 'vitest';
import { applyCardState, applyLabelVisibility, applyPrefState, applyTipState } from '@/features/map/mapDom';
import { INITIAL_MAP_STATE, type MapState } from '@/features/map/state';

const MAP_HTML = `
  <svg>
    <path data-pref="01" aria-pressed="false"></path>
    <path data-pref="13" aria-pressed="false"></path>
    <path data-pref="47" aria-pressed="false"></path>
    <text data-pref-label="01">北海道</text>
    <text data-pref-label="13">東京</text>
  </svg>`;

const CARD_HTML = `
  <div>
    <p data-card-guide>案内文</p>
    <p data-card-pref="01" hidden>北海道</p>
    <p data-card-pref="13" hidden>東京都</p>
  </div>`;

const pref = (code: string): Element => document.querySelector(`[data-pref="${code}"]`) as Element;
const card = (code: string): HTMLElement => document.querySelector(`[data-card-pref="${code}"]`) as HTMLElement;
const guide = (): HTMLElement => document.querySelector('[data-card-guide]') as HTMLElement;

describe('applyPrefState', () => {
  beforeEach(() => {
    document.body.innerHTML = MAP_HTML;
  });

  test('4.11.2：固定中の県だけ aria-pressed が true になり、data-state が pinned になる', () => {
    const state: MapState = { ...INITIAL_MAP_STATE, pinned: '13' };

    applyPrefState(document.body, state);

    expect(pref('13').getAttribute('aria-pressed')).toBe('true');
    expect(pref('13').getAttribute('data-state')).toBe('pinned');
    for (const other of ['01', '47']) {
      expect(pref(other).getAttribute('aria-pressed')).toBe('false');
      expect(pref(other).hasAttribute('data-state')).toBe(false);
    }
  });

  test('F-ZOOM-04：最大化中の県は data-state が maximized になる（aria-pressed は true）', () => {
    const state: MapState = { ...INITIAL_MAP_STATE, pinned: '13', maximized: '13' };

    applyPrefState(document.body, state);

    expect(pref('13').getAttribute('data-state')).toBe('maximized');
    expect(pref('13').getAttribute('aria-pressed')).toBe('true');
  });

  test('F-MUNI-04: 最大化中は根の要素に data-map-maximized を書き、解除で消す', () => {
    applyPrefState(document.body, { ...INITIAL_MAP_STATE, pinned: '13', maximized: '13' });
    expect(document.body.getAttribute('data-map-maximized')).toBe('13');

    applyPrefState(document.body, { ...INITIAL_MAP_STATE, pinned: '13' });

    expect(document.body.hasAttribute('data-map-maximized')).toBe(false);
  });

  test('最大化した県の県名ラベルに data-state を書く', () => {
    applyPrefState(document.body, { ...INITIAL_MAP_STATE, pinned: '13', maximized: '13' });

    expect(document.querySelector('[data-pref-label="13"]')?.getAttribute('data-state')).toBe('maximized');
    expect(document.querySelector('[data-pref-label="01"]')?.hasAttribute('data-state')).toBe(false);

    applyPrefState(document.body, INITIAL_MAP_STATE);

    expect(document.querySelector('[data-pref-label="13"]')?.hasAttribute('data-state')).toBe(false);
  });

  test('固定を解除すると aria-pressed が false に戻り、data-state がなくなる', () => {
    applyPrefState(document.body, { ...INITIAL_MAP_STATE, pinned: '13' });

    applyPrefState(document.body, INITIAL_MAP_STATE);

    expect(pref('13').getAttribute('aria-pressed')).toBe('false');
    expect(pref('13').hasAttribute('data-state')).toBe(false);
  });

  test('別の県に固定を移すと、前の県の属性が戻る', () => {
    applyPrefState(document.body, { ...INITIAL_MAP_STATE, pinned: '13' });

    applyPrefState(document.body, { ...INITIAL_MAP_STATE, pinned: '01' });

    expect(pref('13').getAttribute('aria-pressed')).toBe('false');
    expect(pref('01').getAttribute('aria-pressed')).toBe('true');
  });

  test('値が変わらない要素は書き換えない', () => {
    const records: MutationRecord[] = [];
    const observer = new MutationObserver(list => records.push(...list));
    observer.observe(document.body, { attributes: true, subtree: true });
    applyPrefState(document.body, { ...INITIAL_MAP_STATE, pinned: '13' });
    records.push(...observer.takeRecords());
    records.length = 0;

    applyPrefState(document.body, { ...INITIAL_MAP_STATE, pinned: '13' });

    expect([...records, ...observer.takeRecords()]).toHaveLength(0);
    observer.disconnect();
  });
});

describe('applyCardState', () => {
  beforeEach(() => {
    document.body.innerHTML = CARD_HTML;
  });

  test('4.11.1：表示する県のカードだけ hidden が外れ、案内文が隠れる', () => {
    applyCardState(document.body, '13');

    expect(card('13').hidden).toBe(false);
    expect(card('01').hidden).toBe(true);
    expect(guide().hidden).toBe(true);
  });

  test('県がないときは案内文だけが見える', () => {
    applyCardState(document.body, '13');

    applyCardState(document.body, null);

    expect(card('13').hidden).toBe(true);
    expect(card('01').hidden).toBe(true);
    expect(guide().hidden).toBe(false);
  });

  test('県を切り替えると、前の県のカードは隠れる', () => {
    applyCardState(document.body, '13');

    applyCardState(document.body, '01');

    expect(card('13').hidden).toBe(true);
    expect(card('01').hidden).toBe(false);
  });
});

describe('applyLabelVisibility', () => {
  const label = (code: string): Element => document.querySelector(`[data-muni-label="${code}"]`) as Element;

  beforeEach(() => {
    document.body.innerHTML = `
      <svg>
        <text data-muni-label="a" data-min-scale="1"></text>
        <text data-muni-label="b" data-min-scale="4.5"></text>
        <text data-muni-label="c" data-min-scale="x"></text>
      </svg>`;
  });

  test('F-MUNI-02: 倍率が出はじめる倍率に届かないラベルは visibility="hidden" にする', () => {
    applyLabelVisibility(document.body, 2);

    expect(label('a').hasAttribute('visibility')).toBe(false);
    expect(label('b').getAttribute('visibility')).toBe('hidden');
  });

  test('F-MUNI-02: 倍率を上げると、隠れていたラベルが出る（出はじめる倍率ちょうどで出る）', () => {
    applyLabelVisibility(document.body, 2);

    applyLabelVisibility(document.body, 4.5);

    expect(label('b').hasAttribute('visibility')).toBe(false);
  });

  test('出はじめる倍率が数でないラベルは隠す', () => {
    applyLabelVisibility(document.body, 100);

    expect(label('c').getAttribute('visibility')).toBe('hidden');
  });
});

describe('applyTipState', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div>
        <div data-tip-pref="01" hidden>北海道</div>
        <div data-tip-pref="13" hidden>東京都</div>
      </div>`;
  });

  const tip = (code: string): HTMLElement => document.querySelector(`[data-tip-pref="${code}"]`) as HTMLElement;

  test('F-TIP-01：表示する県の中身だけ hidden が外れる', () => {
    applyTipState(document.body, '13');

    expect(tip('13').hidden).toBe(false);
    expect(tip('01').hidden).toBe(true);
  });

  test('F-TIP-01：県がない（null）ときは、すべて隠れる', () => {
    applyTipState(document.body, '13');

    applyTipState(document.body, null);

    expect(tip('13').hidden).toBe(true);
    expect(tip('01').hidden).toBe(true);
  });
});
