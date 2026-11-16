import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { ModeText } from '@/components/ModeText';

// F-MODE-04・7.2：こども向け・おとな向けの文を、両方出力する（表示の切替は T3-05 の CSS）
describe('ModeText', () => {
  test('F-MODE-04：こども向けとおとな向けの両方を、kids・adult のクラスを付けて出力する', () => {
    // Arrange・Act
    const { container } = render(<ModeText text={{ kids: 'こども向けの文', adult: 'おとな向けの文' }} />);

    // Assert
    const kids = container.querySelectorAll('span.kids');
    const adult = container.querySelectorAll('span.adult');
    expect(kids).toHaveLength(1);
    expect(adult).toHaveLength(1);
    expect(kids[0]?.textContent).toBe('こども向けの文');
    expect(adult[0]?.textContent).toBe('おとな向けの文');
  });

  test('7.2：ふりがなの記法を <ruby> で描く', () => {
    const { container } = render(<ModeText text={{ kids: '{県|けん}だよ', adult: '{県|けん}です' }} />);

    expect(container.querySelector('.kids')?.innerHTML).toBe('<ruby>県<rt aria-hidden="true">けん</rt></ruby>だよ');
    expect(container.querySelector('.adult')?.innerHTML).toBe('<ruby>県<rt aria-hidden="true">けん</rt></ruby>です');
  });
});
