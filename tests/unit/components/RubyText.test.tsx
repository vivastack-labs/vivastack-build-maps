import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { RubyText } from '@/components/RubyText';

// 7.2・6.6 (2)：ふりがなの記法を <ruby> として描く（T1-06）
describe('RubyText', () => {
  test('7.2：{北海道|ほっかいどう} を <ruby>北海道<rt>ほっかいどう</rt></ruby> として描く', () => {
    // Arrange・Act
    const { container } = render(<RubyText text="{北海道|ほっかいどう}" />);

    // Assert
    expect(container.innerHTML).toBe('<ruby>北海道<rt>ほっかいどう</rt></ruby>');
  });

  test('7.2：記法の外の文字は、そのまま文字として描く', () => {
    const { container } = render(<RubyText text="{生産量|せいさんりょう}は日本一" />);

    expect(container.innerHTML).toBe('<ruby>生産量<rt>せいさんりょう</rt></ruby>は日本一');
  });

  test('6.6 (2)：<script> を含む文字列は、タグではなく文字として表示する', () => {
    const { container } = render(<RubyText text="<script>alert(1)</script>{<b>北</b>|ほく}" />);

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('b')).toBeNull();
    expect(container.textContent).toBe('<script>alert(1)</script><b>北</b>ほく');
  });

  test('7.2：記法に誤りがあれば、描かずにエラーにする', () => {
    expect(() => render(<RubyText text="{北海道|}" />)).toThrow(/読みが空/);
  });
});
