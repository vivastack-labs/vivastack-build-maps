import { describe, expect, test } from 'vitest';
import { SHEET_QUERY, sheetState } from '@/features/map/sheet';

describe('sheetState', () => {
  test('F-MAP-05：固定がなければ closed、固定があれば peek、広げていれば full', () => {
    // Arrange・Act・Assert
    expect(sheetState({ pinned: null, expanded: false })).toBe('closed');
    expect(sheetState({ pinned: '13', expanded: false })).toBe('peek');
    expect(sheetState({ pinned: '13', expanded: true })).toBe('full');
  });

  test('F-MAP-05：固定がなければ、広げる指定があっても closed（閉じたら peek に戻る）', () => {
    expect(sheetState({ pinned: null, expanded: true })).toBe('closed');
  });

  test('F-MAP-05：パネルになる幅は Tailwind の md（48rem）の手前', () => {
    expect(SHEET_QUERY).toBe('(width < 48rem)');
  });
});
