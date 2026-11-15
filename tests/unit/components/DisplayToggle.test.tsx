import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

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

    // Act：初期化スクリプトや別のタブからの変更など、ボタン以外が属性を書く
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
});
