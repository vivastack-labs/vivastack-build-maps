import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { DisplayToggle } from '@/components/DisplayToggle';
import { getMessages } from '@/i18n/messages';

const html = document.documentElement;

beforeEach(() => {
  html.dataset.mode = 'kids';
  html.dataset.ruby = 'on';
  window.localStorage.clear();
});

afterEach(() => {
  delete html.dataset.mode;
  delete html.dataset.ruby;
});

const pressed = (name: string) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

describe('DisplayToggle', () => {
  test('F-MODE-01：モードのボタンを押すと <html> の data-mode と aria-pressed が変わり、localStorage に残る', () => {
    // Arrange
    render(<DisplayToggle lang="ja" labels={getMessages('ja').display} />);
    expect(pressed('こども')).toBe('true');
    expect(pressed('おとな')).toBe('false');

    // Act
    fireEvent.click(screen.getByRole('button', { name: 'おとな' }));

    // Assert
    expect(html.dataset.mode).toBe('adult');
    expect(pressed('こども')).toBe('false');
    expect(pressed('おとな')).toBe('true');
    expect(window.localStorage.getItem('maps.mode')).toBe('adult');
  });

  test('F-MODE-01：モードのボタンは「モード」の名前のグループに入っている', () => {
    // Arrange・Act
    render(<DisplayToggle lang="ja" labels={getMessages('ja').display} />);

    // Assert
    expect(screen.getByRole('group', { name: 'モード' })).toContainElement(screen.getByRole('button', { name: 'おとな' }));
  });

  test('F-MODE-02：ふりがなのボタンを押すと data-ruby が on/off で入れ替わる', () => {
    // Arrange
    render(<DisplayToggle lang="ja" labels={getMessages('ja').display} />);
    expect(pressed('ふりがな')).toBe('true');

    // Act・Assert
    fireEvent.click(screen.getByRole('button', { name: 'ふりがな' }));
    expect(html.dataset.ruby).toBe('off');
    expect(pressed('ふりがな')).toBe('false');
    expect(window.localStorage.getItem('maps.ruby')).toBe('off');
    fireEvent.click(screen.getByRole('button', { name: 'ふりがな' }));
    expect(html.dataset.ruby).toBe('on');
    expect(pressed('ふりがな')).toBe('true');
  });

  test.each(['en', 'zh'] as const)('F-MODE-02：%s にはふりがなのボタンがない', lang => {
    // Arrange・Act
    const { container } = render(<DisplayToggle lang={lang} labels={getMessages(lang).display} />);

    // Assert
    expect(container.querySelector('[data-ruby-button]')).toBeNull();
    expect(container.querySelectorAll('[data-mode-button]')).toHaveLength(2);
  });

  test('<html> の属性が外から変わっても aria-pressed が追従する', async () => {
    // Arrange
    render(<DisplayToggle lang="ja" labels={getMessages('ja').display} />);

    // Act：初期化スクリプトなど、ボタン以外が属性を書く
    await act(async () => {
      html.dataset.mode = 'adult';
      html.dataset.ruby = 'off';
      await Promise.resolve();
    });

    // Assert
    expect(pressed('おとな')).toBe('true');
    expect(pressed('ふりがな')).toBe('false');
  });

  test('D23：<html> の属性がなければ、言語の既定値（en はおとな）で出す', () => {
    // Arrange
    delete html.dataset.mode;
    delete html.dataset.ruby;

    // Act
    render(<DisplayToggle lang="en" labels={getMessages('en').display} />);

    // Assert
    expect(pressed('Adults')).toBe('true');
    expect(pressed('Kids')).toBe('false');
  });

  test('4.11.5：localStorage を使えなくても、ボタンは効く', () => {
    // Arrange
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage') as PropertyDescriptor;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('SecurityError');
      }
    });
    render(<DisplayToggle lang="ja" labels={getMessages('ja').display} />);

    try {
      // Act
      fireEvent.click(screen.getByRole('button', { name: 'おとな' }));

      // Assert
      expect(html.dataset.mode).toBe('adult');
      expect(pressed('おとな')).toBe('true');
    } finally {
      Object.defineProperty(window, 'localStorage', original);
    }
  });

  test('ボタンの外側のコンテナは data-display-toggle で、JavaScript がないときに隠すクラスを持つ', () => {
    // Arrange・Act
    const { container } = render(<DisplayToggle lang="ja" labels={getMessages('ja').display} />);

    // Assert
    expect(container.querySelector('[data-display-toggle]')?.className).toContain('noscript:hidden');
  });

  test('ハイドレーション直後など、描いた値と <html> の属性がずれていても、押した時点の属性から次の値を決める', () => {
    // Arrange：描いた時点では ruby=on。購読の通知なしに属性だけを off にする（通知が届く前に押した状況）
    render(<DisplayToggle lang="ja" labels={getMessages('ja').display} />);
    html.dataset.ruby = 'off';

    // Act
    fireEvent.click(screen.getByRole('button', { name: 'ふりがな' }));

    // Assert：描いた値（on）から決めると off のままになる。押した時点の値（off）から on になる
    expect(html.dataset.ruby).toBe('on');
  });

  test('アンマウントすると購読が外れ、MutationObserver も止まる', () => {
    // Arrange
    const disconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const { unmount } = render(<DisplayToggle lang="ja" labels={getMessages('ja').display} />);
    const before = disconnect.mock.calls.length;

    // Act
    unmount();

    // Assert：observer を止めた（2つの設定ぶん）。以降の属性の変更・ボタンの通知で、例外も再描画も起きない
    expect(disconnect.mock.calls.length - before).toBe(2);
    expect(() => {
      html.dataset.mode = 'adult';
    }).not.toThrow();
    disconnect.mockRestore();
  });

  test('T4-05：マウントしたら data-display-ready が付く（サーバーの出力にはない。E2E がハイドレーションの完了を待つ）', () => {
    // Arrange・Act
    const server = renderToString(<DisplayToggle lang="ja" labels={getMessages('ja').display} />);
    const { container } = render(<DisplayToggle lang="ja" labels={getMessages('ja').display} />);

    // Assert
    expect(server).not.toContain('data-display-ready');
    expect(container.querySelector('[data-display-toggle][data-display-ready]')).not.toBeNull();
  });
});
