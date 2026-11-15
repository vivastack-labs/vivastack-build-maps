import { fireEvent, render, screen } from '@testing-library/react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { HashSync } from '@/components/HashSync';
import { MapStateProvider, useMapState } from '@/components/MapStateProvider';

/** 状態（固定）を文字にして出し、固定・解除の操作を送るボタンを置く */
function Probe() {
  const { state, dispatch } = useMapState();
  return (
    <div>
      <output data-testid="pinned">{state.pinned ?? ''}</output>
      <output data-testid="maximized">{state.maximized ?? ''}</output>
      <button type="button" onClick={() => dispatch({ type: 'click', pref: '20' })}>
        pin-20
      </button>
      <button type="button" onClick={() => dispatch({ type: 'click', pref: '13' })}>
        pin-13
      </button>
    </div>
  );
}

/** ヘッダーの言語切替の代わり（サーバーの出力と同じ href） */
function Links() {
  return (
    <ul>
      {['ja', 'en', 'zh'].map(code => (
        <li key={code}>
          <a data-lang-link={code} href={`/${code}/`} aria-current={code === 'en' ? 'page' : undefined}>
            {code}
          </a>
        </li>
      ))}
    </ul>
  );
}

function renderSync() {
  return render(
    <MapStateProvider>
      <Links />
      <HashSync />
      <Probe />
    </MapStateProvider>
  );
}

const hrefs = () => [...document.querySelectorAll('a[data-lang-link]')].map(link => link.getAttribute('href'));

beforeEach(() => {
  window.history.replaceState(null, '', '/en/');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('HashSync（4.11.2、F-I18N-03）', () => {
  test('4.11.2：開いたときのハッシュの県を固定する（最大化はしない）', () => {
    // Arrange
    window.history.replaceState(null, '', '/en/#pref-13');

    // Act
    renderSync();

    // Assert
    expect(screen.getByTestId('pinned')).toHaveTextContent('13');
    expect(screen.getByTestId('maximized')).toBeEmptyDOMElement();
  });

  test.each(['#pref-99', '#foo', '#pref-1'])('4.11.2：正しくないハッシュ %s では固定しない（ハッシュも消さない）', hash => {
    // Arrange
    window.history.replaceState(null, '', `/en/${hash}`);

    // Act
    renderSync();

    // Assert
    expect(screen.getByTestId('pinned')).toBeEmptyDOMElement();
    expect(window.location.hash).toBe(hash);
    expect(hrefs()).toEqual(['/ja/', '/en/', '/zh/']);
  });

  test('4.11.2：復元の前に、ハッシュを消さない（replaceState でハッシュを空にする書き込みをしない）', () => {
    // Arrange
    window.history.replaceState(null, '', '/en/#pref-13');
    const spy = vi.spyOn(window.history, 'replaceState');

    // Act
    renderSync();

    // Assert
    expect(window.location.hash).toBe('#pref-13');
    expect(spy.mock.calls.filter(call => new URL(String(call[2]), window.location.href).hash === '')).toEqual([]);
  });

  test('4.11.2：固定が変わると replaceState でハッシュを書く（解除で消す。履歴は増やさない）', () => {
    // Arrange
    window.history.replaceState({ marker: 1 }, '', '/en/');
    const lengthBefore = window.history.length;
    renderSync();
    const spy = vi.spyOn(window.history, 'replaceState');

    // Act・Assert：固定
    fireEvent.click(screen.getByText('pin-20'));
    expect(window.location.hash).toBe('#pref-20');
    expect(window.location.pathname).toBe('/en/');
    expect(window.history.state).toEqual({ marker: 1 });
    // 別の県に移す
    fireEvent.click(screen.getByText('pin-13'));
    expect(window.location.hash).toBe('#pref-13');
    // 解除：ハッシュを消す
    fireEvent.click(screen.getByText('pin-13'));
    expect(window.location.hash).toBe('');
    expect(window.location.href.endsWith('/en/')).toBe(true);
    expect(window.history.length).toBe(lengthBefore);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  test('F-I18N-03：言語切替のリンクの href にハッシュを付ける（解除で外す）。今の言語（aria-current）のリンクは書き換えない', () => {
    // Arrange
    renderSync();
    expect(hrefs()).toEqual(['/ja/', '/en/', '/zh/']);

    // Act・Assert
    fireEvent.click(screen.getByText('pin-20'));
    expect(hrefs()).toEqual(['/ja/#pref-20', '/en/', '/zh/#pref-20']);
    fireEvent.click(screen.getByText('pin-20'));
    expect(hrefs()).toEqual(['/ja/', '/en/', '/zh/']);
  });

  test('F-I18N-03：開いたときのハッシュの県も、リンクの href に付く（今の言語のリンクは除く）', () => {
    // Arrange
    window.history.replaceState(null, '', '/en/#pref-13');

    // Act
    renderSync();

    // Assert
    expect(hrefs()).toEqual(['/ja/#pref-13', '/en/', '/zh/#pref-13']);
  });

  test('4.11.2：正しくないハッシュのあとに固定して外すと、ハッシュは消える', () => {
    // Arrange
    window.history.replaceState(null, '', '/en/#foo');
    renderSync();

    // Act
    fireEvent.click(screen.getByText('pin-20'));
    expect(window.location.hash).toBe('#pref-20');
    fireEvent.click(screen.getByText('pin-20'));

    // Assert
    expect(window.location.hash).toBe('');
  });

  test('DOM の要素を出さない', () => {
    // Arrange・Act
    const { container } = render(
      <MapStateProvider>
        <HashSync />
      </MapStateProvider>
    );

    // Assert
    expect(container).toBeEmptyDOMElement();
  });

  test('F-I18N-03：data-lang-link が言語でない値のリンクは書き換えない', () => {
    // Arrange
    render(
      <MapStateProvider>
        <a data-lang-link="fr" href="#fr">
          fr
        </a>
        <a data-lang-link href="#x">
          none
        </a>
        <HashSync />
        <Probe />
      </MapStateProvider>
    );

    // Act
    fireEvent.click(screen.getByText('pin-20'));

    // Assert
    expect(hrefs()).toEqual(['#fr', '#x']);
  });

  test('4.11.2：開いたページの path と query を保ち、ハッシュだけを書く', () => {
    // Arrange
    window.history.replaceState(null, '', '/en/?a=1');
    renderSync();

    // Act
    fireEvent.click(screen.getByText('pin-20'));

    // Assert
    expect(window.location.pathname + window.location.search + window.location.hash).toBe('/en/?a=1#pref-20');
  });
});

describe('HashSync：描画の前に復元が終わる（T3-03・M1）', () => {
  test('T3-03：flushSync が戻った直後に、固定が復元した県になっている（useEffect では間に合わない）', () => {
    // Arrange：act を使わない（act は、effect が遅れても最後に全部を流してしまう）
    const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT = false;
    window.history.replaceState(null, '', '/en/#pref-13');
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    // Act
    flushSync(() => {
      root.render(
        <MapStateProvider>
          <HashSync />
          <Probe />
        </MapStateProvider>
      );
    });

    // Assert
    expect(container.querySelector('[data-testid="pinned"]')?.textContent).toBe('13');
    flushSync(() => root.unmount());
    container.remove();
    env.IS_REACT_ACT_ENVIRONMENT = previous;
  });
});
