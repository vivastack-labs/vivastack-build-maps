import { expect, test } from 'vitest';

test('T0-04：CI がテストの失敗で失敗することを確かめる（確認後に消す）', () => {
  expect(1 + 1).toBe(3);
});
