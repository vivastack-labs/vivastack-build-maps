import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

// 10.2：コンポーネントテストの道具（Vitest＋Testing Library＋jsdom）が動くことを確かめる。
// 最初の本当のコンポーネントテストができたら、このファイルは消してよい
describe('コンポーネントテストの道具', () => {
  test('10.2：Testing Library で描画した要素を jest-dom のマッチャーで確かめられる', () => {
    // Arrange
    render(
      <main>
        <h1>ご当地めいぶつ日本地図</h1>
      </main>
    );

    // Act
    const heading = screen.getByRole('heading', { level: 1 });

    // Assert
    expect(heading).toBeInTheDocument();
    expect(heading).toHaveTextContent('ご当地めいぶつ日本地図');
  });
});
