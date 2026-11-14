import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { MapStateProvider } from '@/components/MapStateProvider';
import { Tooltip } from '@/components/Tooltip';
import type { Lang } from '@/i18n/lang';
import { loadedLoader, Probe, toggleMaximize } from './muni-test-helpers';

// 地図の箱（[data-map-box]）の中に、県・海・市区町村の形とツールチップを小さく組む。県の中身はサーバーの出力と同じく hidden で始める
function renderTooltip(lang: Lang = 'ja') {
  return render(
    <MapStateProvider>
      <div data-map-box>
        <svg>
          <rect data-testid="sea" />
          <path data-testid="hokkaido" data-pref="01" />
          <path data-testid="nagano" data-pref="20" />
          <path data-testid="muni" data-muni="20101" data-muni-pref="20" />
          <path data-testid="muni-other" data-muni="20102" data-muni-pref="20" />
        </svg>
        <Tooltip lang={lang} loader={loadedLoader().loader}>
          <div data-tip-pref="01" hidden>
            北海道
          </div>
          <div data-tip-pref="20" hidden>
            長野県
          </div>
        </Tooltip>
      </div>
      <Probe />
    </MapStateProvider>
  );
}

const move = (element: Element, init: PointerEventInit = {}) => fireEvent.pointerMove(element, { pointerType: 'mouse', clientX: 30, clientY: 40, ...init });
const root = () => document.querySelector('[data-tooltip]') as HTMLElement;
const visibleTips = () => [...document.querySelectorAll<HTMLElement>('[data-tip-pref]')].filter(tip => !tip.hidden).map(tip => tip.textContent);

describe('Tooltip：県', () => {
  test('F-TIP-01: マウスで県にのせると、その県の中身だけ hidden が外れる', () => {
    renderTooltip();
    expect(root().hidden).toBe(true);

    move(screen.getByTestId('hokkaido'));

    expect(root().hidden).toBe(false);
    expect(visibleTips()).toEqual(['北海道']);
  });

  test('F-TIP-01: 別の県に動かすと、中身が切り替わる', () => {
    renderTooltip();
    move(screen.getByTestId('hokkaido'));

    move(screen.getByTestId('nagano'));

    expect(visibleTips()).toEqual(['長野県']);
  });

  test('F-TIP-01: 県から海に出ると隠れる', () => {
    renderTooltip();
    move(screen.getByTestId('hokkaido'));

    move(screen.getByTestId('sea'));

    expect(root().hidden).toBe(true);
    expect(visibleTips()).toEqual([]);
  });

  test('F-TIP-01: マウスが地図の箱から出ると隠れる', () => {
    renderTooltip();
    move(screen.getByTestId('hokkaido'));

    fireEvent.pointerLeave(document.querySelector('[data-map-box]') as Element, { pointerType: 'mouse' });

    expect(root().hidden).toBe(true);
  });

  test('WCAG 1.4.13: Esc でツールチップを隠し、マウスが動くとまた出る（フォーカスが地図の外でも）', () => {
    renderTooltip();
    move(screen.getByTestId('hokkaido'));
    expect(root().hidden).toBe(false);

    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(root().hidden).toBe(true);
    expect(visibleTips()).toEqual([]);

    move(screen.getByTestId('hokkaido'), { clientX: 31 });
    expect(root().hidden).toBe(false);
  });

  test('Esc 以外のキーでは隠れない', () => {
    renderTooltip();
    move(screen.getByTestId('hokkaido'));

    fireEvent.keyDown(document.body, { key: 'a' });

    expect(root().hidden).toBe(false);
  });

  test('4.11.3: pointerType が touch のときは出ない', () => {
    renderTooltip();

    move(screen.getByTestId('hokkaido'), { pointerType: 'touch' });

    expect(root().hidden).toBe(true);
    expect(visibleTips()).toEqual([]);
  });

  test('4.11.3: ボタンを押している間（ドラッグ中）は出ない', () => {
    renderTooltip();

    move(screen.getByTestId('hokkaido'), { buttons: 1 });

    expect(root().hidden).toBe(true);
  });

  test('4.11.3: ボタンを押すと隠れ、離すと（マウスを動かさなくても）また出る', () => {
    renderTooltip();
    move(screen.getByTestId('hokkaido'));

    fireEvent.pointerDown(screen.getByTestId('hokkaido'), { pointerType: 'mouse', buttons: 1 });
    expect(root().hidden).toBe(true);
    fireEvent.pointerUp(screen.getByTestId('hokkaido'), { pointerType: 'mouse', buttons: 0 });

    expect(root().hidden).toBe(false);
    expect(visibleTips()).toEqual(['北海道']);
  });

  test('ホイールで地図が動くと、次にマウスを動かすまで隠れる（古い県を出さない）', () => {
    renderTooltip();
    move(screen.getByTestId('hokkaido'));

    fireEvent.wheel(screen.getByTestId('hokkaido'), { deltaY: -100 });

    expect(root().hidden).toBe(true);
    move(screen.getByTestId('nagano'));
    expect(visibleTips()).toEqual(['長野県']);
  });

  test('d3-zoom が伝播を止めても、ホイールで隠れる（capture で受ける）', () => {
    renderTooltip();
    move(screen.getByTestId('hokkaido'));
    screen
      .getByTestId('hokkaido')
      .closest('svg')
      ?.addEventListener('wheel', event => event.stopImmediatePropagation());

    fireEvent.wheel(screen.getByTestId('hokkaido'), { deltaY: -100 });

    expect(root().hidden).toBe(true);
  });

  test('最大化が変わると、次にマウスを動かすまで隠れる（解除でマウスの下が変わっても、古い県を出さない）', async () => {
    renderTooltip();
    move(screen.getByTestId('nagano'));
    expect(visibleTips()).toEqual(['長野県']);

    await toggleMaximize();
    await toggleMaximize();

    expect(root().hidden).toBe(true);
    expect(visibleTips()).toEqual([]);
  });

  test('マウスの動きに合わせて位置（transform）だけを書く', () => {
    renderTooltip();

    move(screen.getByTestId('hokkaido'), { clientX: 100, clientY: 50 });

    expect(root().style.transform).toMatch(/^translate\(/u);
  });

  test('ルートは aria-hidden（同じ情報はカードと一覧で読めるので、二重に読ませない）', () => {
    renderTooltip();

    expect(root().getAttribute('aria-hidden')).toBe('true');
    expect(root().className).toContain('pointer-events-none');
  });
});

describe('Tooltip：市区町村', () => {
  test('F-TIP-02: 最大化中、市区町村にのせると名前と読みが出る（ja）', async () => {
    renderTooltip();
    await toggleMaximize();

    move(screen.getByTestId('muni'));

    expect(root().hidden).toBe(false);
    expect(root().querySelector('[data-tip-muni]')?.textContent).toBe('市20101し');
    expect(root().querySelector('[data-tip-reading]')?.textContent).toBe('し');
  });

  test('4.11.2: 最大化中は、県の中身を出さない（県にのせても、市区町村の外ではなし）', async () => {
    renderTooltip();
    await toggleMaximize();

    move(screen.getByTestId('nagano'));

    expect(root().hidden).toBe(true);
    expect(visibleTips()).toEqual([]);
  });

  test('最大化中に市区町村から海に出ると隠れる', async () => {
    renderTooltip();
    await toggleMaximize();
    move(screen.getByTestId('muni'));

    move(screen.getByTestId('sea'));

    expect(root().hidden).toBe(true);
  });

  test('最大化していなければ、市区町村の形の上でも出ない', () => {
    renderTooltip();

    move(screen.getByTestId('muni'));

    expect(root().hidden).toBe(true);
  });

  test('F-I18N-05: 英語では name.en だけ（読みはなし）', async () => {
    renderTooltip('en');
    await toggleMaximize();

    move(screen.getByTestId('muni'));

    expect(root().querySelector('[data-tip-muni]')?.textContent).toBe('City 20101');
    expect(root().querySelector('[data-tip-reading]')).toBeNull();
  });

  test('F-I18N-05: 中国語では lang="ja" の name.ja だけ（読みはなし）', async () => {
    renderTooltip('zh');
    await toggleMaximize();

    move(screen.getByTestId('muni'));

    const name = root().querySelector('[data-tip-muni]') as HTMLElement;
    expect(name.textContent).toBe('市20101');
    expect(name.getAttribute('lang')).toBe('ja');
    expect(root().querySelector('[data-tip-reading]')).toBeNull();
  });

  test('最大化を解除すると、市区町村のツールチップは消える', async () => {
    renderTooltip();
    await toggleMaximize();
    move(screen.getByTestId('muni'));

    await toggleMaximize();

    expect(root().hidden).toBe(true);
  });
});
