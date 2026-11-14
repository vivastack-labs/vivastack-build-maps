import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { CardSwitch } from '@/components/CardSwitch';
import { MapStateProvider, useMapState } from '@/components/MapStateProvider';

/** 状態（固定・最大化）を文字にして出す */
function StateProbe() {
  const { state } = useMapState();
  return <output data-testid="state">{`pinned=${state.pinned ?? ''} maximized=${state.maximized ?? ''}`}</output>;
}

/** サーバーの出力と同じく、最大化ボタンは hidden で始める */
function Fixture({ bareCode }: { readonly bareCode?: string }) {
  return (
    <MapStateProvider>
      <CardSwitch>
        <p data-card-guide>案内文</p>
        <article data-card-pref="13" hidden>
          <h2>東京都</h2>
          <button type="button" data-testid="maximize-13" data-card-maximize="13" hidden>
            <span data-label-maximize>大きくして見る</span>
            <span data-label-restore hidden>
              元にもどす
            </span>
          </button>
        </article>
        <article data-card-pref="01" hidden>
          <button type="button" data-testid="maximize-01" data-card-maximize="01" hidden>
            <span data-label-maximize>大きくして見る</span>
            <span data-label-restore hidden>
              元にもどす
            </span>
          </button>
        </article>
        <button type="button" data-testid="maximize-bad" data-card-maximize={bareCode ?? 'xx'}>
          <span data-testid="bad-inner">不正</span>
        </button>
        <button type="button" data-testid="plain">
          ふつうのボタン
        </button>
      </CardSwitch>
      <StateProbe />
    </MapStateProvider>
  );
}

const state = () => screen.getByTestId('state').textContent;

describe('CardSwitch', () => {
  test('6.6 (2)：マウントすると data-card-ready を付け、最大化ボタンの hidden を外す', () => {
    // Arrange・Act
    const { container } = render(<Fixture />);

    // Assert
    expect(container.querySelector('[data-card-switch]')?.hasAttribute('data-card-ready')).toBe(true);
    expect((screen.getByTestId('maximize-13') as HTMLElement).hidden).toBe(false);
    expect((screen.getByTestId('maximize-01') as HTMLElement).hidden).toBe(false);
  });

  test('F-CARD-08：最大化ボタンのクリックで doubleClick を送り、もう一度で元に戻す（固定は残す）', () => {
    // Arrange
    render(<Fixture />);

    // Act・Assert：最大化＋固定
    fireEvent.click(screen.getByTestId('maximize-13'));
    expect(state()).toBe('pinned=13 maximized=13');
    // 文言が「元の大きさにもどす」になり、カードは固定した県のものを見せる
    expect((screen.getByText('元にもどす', { selector: '[data-card-pref="13"] [data-label-restore]' }) as HTMLElement).hidden).toBe(false);
    expect((document.querySelector('[data-card-pref="13"]') as HTMLElement).hidden).toBe(false);

    // Act・Assert：もう一度で元に戻る（固定は残る）
    fireEvent.click(screen.getByTestId('maximize-13'));
    expect(state()).toBe('pinned=13 maximized=');
    expect((document.querySelector('[data-card-pref="13"] [data-label-maximize]') as HTMLElement).hidden).toBe(false);
  });

  test('F-CARD-08：ボタンの中の文言（span）のクリックでも動く', () => {
    // Arrange
    render(<Fixture />);

    // Act
    fireEvent.click(document.querySelector('[data-card-pref="01"] [data-label-maximize]') as Element);

    // Assert
    expect(state()).toBe('pinned=01 maximized=01');
  });

  test('F-CARD-08：県コードの形でない data-card-maximize は無視する', () => {
    // Arrange
    render(<Fixture />);

    // Act
    fireEvent.click(screen.getByTestId('maximize-bad'));
    fireEvent.click(screen.getByTestId('bad-inner'));

    // Assert
    expect(state()).toBe('pinned= maximized=');
  });

  test('F-CARD-08：最大化ボタンでない要素のクリックは無視する', () => {
    // Arrange
    render(<Fixture />);

    // Act
    fireEvent.click(screen.getByTestId('plain'));

    // Assert
    expect(state()).toBe('pinned= maximized=');
  });
});
