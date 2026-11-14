import { describe, expect, test } from 'vitest';
import { muniTooltipText, tooltipPosition, tooltipTarget, type TooltipInput } from '@/features/map/tooltip';

/** 県（長野県）の上にマウスがある、最大化していない状態 */
const onPref: TooltipInput = { pref: '20', muni: null, maximized: null, pointerType: 'mouse', buttons: 0 };

describe('tooltipTarget：県', () => {
  test('F-TIP-01: 最大化していないとき、県の上ではその県のツールチップ', () => {
    expect(tooltipTarget(onPref)).toEqual({ kind: 'pref', code: '20' });
  });

  test('F-TIP-01: ペンでも出る（カードのホバーと同じ規則）', () => {
    expect(tooltipTarget({ ...onPref, pointerType: 'pen' })).toEqual({ kind: 'pref', code: '20' });
  });

  test('F-TIP-01: 固定中でも、県の上では県のツールチップ（4.11.2）', () => {
    // 固定は状態に入らない（県の上にいるかどうかだけで決まる）。最大化していなければ、固定した県も別の県も同じ
    expect(tooltipTarget({ ...onPref, pref: '13' })).toEqual({ kind: 'pref', code: '13' });
  });

  test('F-TIP-01: 海・余白（県の属性がない）ではなし', () => {
    expect(tooltipTarget({ ...onPref, pref: null })).toBeNull();
  });

  test('4.11.3: タッチではなし', () => {
    expect(tooltipTarget({ ...onPref, pointerType: 'touch' })).toBeNull();
  });

  test('ボタンを押している間（ドラッグ中）はなし', () => {
    expect(tooltipTarget({ ...onPref, buttons: 1 })).toBeNull();
  });

  test('属性の値が県コードの形でなければなし', () => {
    expect(tooltipTarget({ ...onPref, pref: '48' })).toBeNull();
    expect(tooltipTarget({ ...onPref, pref: '1' })).toBeNull();
    expect(tooltipTarget({ ...onPref, pref: '<b>' })).toBeNull();
  });
});

describe('tooltipTarget：市区町村', () => {
  const onMuni: TooltipInput = { pref: null, muni: '01101', maximized: '01', pointerType: 'mouse', buttons: 0 };

  test('F-TIP-02: 最大化中、市区町村の上では市区町村のツールチップ', () => {
    expect(tooltipTarget(onMuni)).toEqual({ kind: 'muni', code: '01101' });
  });

  test('4.11.2: 最大化中、ほかの県の上ではなし（市区町村のツールチップだけ）', () => {
    expect(tooltipTarget({ ...onMuni, pref: '02', muni: null })).toBeNull();
    expect(tooltipTarget({ ...onMuni, pref: '01', muni: null })).toBeNull();
  });

  test('4.11.2: 最大化中、市区町村のない所ではなし', () => {
    expect(tooltipTarget({ ...onMuni, muni: null })).toBeNull();
  });

  test('最大化した県のものではない市区町村コードはなし', () => {
    expect(tooltipTarget({ ...onMuni, muni: '02201' })).toBeNull();
  });

  test('属性の値が市区町村コードの形でなければなし', () => {
    expect(tooltipTarget({ ...onMuni, muni: '0110' })).toBeNull();
    expect(tooltipTarget({ ...onMuni, muni: '01a01' })).toBeNull();
  });

  test('最大化していなければ、市区町村の属性があっても県を見る', () => {
    expect(tooltipTarget({ ...onMuni, maximized: null })).toBeNull();
  });

  test('4.11.3: タッチ・ボタンを押している間はなし', () => {
    expect(tooltipTarget({ ...onMuni, pointerType: 'touch' })).toBeNull();
    expect(tooltipTarget({ ...onMuni, buttons: 1 })).toBeNull();
  });
});

describe('muniTooltipText', () => {
  const ward = { code: '01101', name: { ja: '札幌市中央区', en: 'Chuo-ku, Sapporo-shi' }, kana: 'さっぽろしちゅうおうく', cityName: '札幌市' };

  test('F-TIP-02: 日本語のページは、名前と読み。区は市名を含む', () => {
    expect(muniTooltipText(ward, 'ja')).toEqual({ name: '札幌市中央区', reading: 'さっぽろしちゅうおうく', lang: undefined });
  });

  test('F-I18N-05: 英語のページはローマ字だけ（読みは出さない）', () => {
    expect(muniTooltipText(ward, 'en')).toEqual({ name: 'Chuo-ku, Sapporo-shi', reading: null, lang: undefined });
  });

  test('F-I18N-05: 中国語のページは日本語の漢字表記だけ（lang="ja"。読みは出さない）', () => {
    expect(muniTooltipText(ward, 'zh')).toEqual({ name: '札幌市中央区', reading: null, lang: 'ja' });
  });
});

describe('tooltipPosition', () => {
  const box = { width: 800, height: 600 };
  const tooltip = { width: 100, height: 40 };

  test('マウスの右下に出す', () => {
    expect(tooltipPosition({ pointer: { x: 100, y: 200 }, tooltip, box })).toEqual({ x: 112, y: 212 });
  });

  test('右にはみ出すなら、マウスの左に反転する', () => {
    expect(tooltipPosition({ pointer: { x: 750, y: 200 }, tooltip, box })).toEqual({ x: 638, y: 212 });
  });

  test('下にはみ出すなら、マウスの上に反転する', () => {
    expect(tooltipPosition({ pointer: { x: 100, y: 580 }, tooltip, box })).toEqual({ x: 112, y: 528 });
  });

  test('反転してもはみ出すなら、箱の内側に寄せる', () => {
    const narrow = { width: 150, height: 600 };
    expect(tooltipPosition({ pointer: { x: 70, y: 200 }, tooltip, box: narrow })).toEqual({ x: 50, y: 212 });
  });

  test('箱より大きいときは、左上に寄せる', () => {
    expect(tooltipPosition({ pointer: { x: 10, y: 10 }, tooltip: { width: 900, height: 700 }, box })).toEqual({ x: 0, y: 0 });
  });
});
