import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { validateMuniTopology } from '@/features/map/muniLoader';

// F-MUNI-05・4.11.5：コミットされた47県の市区町村データが、クライアントの検証（validateMuniTopology）を通る。
// 検証が厳しすぎて、本物のデータを失敗にしてしまわないことを確かめる

const MUNI_DIR = join(process.cwd(), 'public', 'geo', 'muni');
const CODES = Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, '0'));

describe('validateMuniTopology（コミットされたデータ）', () => {
  test.each(CODES)('F-MUNI-05: %s.topo.json は検証を通る', code => {
    const json: unknown = JSON.parse(readFileSync(join(MUNI_DIR, `${code}.topo.json`), 'utf8'));

    expect(validateMuniTopology(json, code)).not.toBeNull();
  });

  test('別の県のファイルは検証を通らない', () => {
    const json: unknown = JSON.parse(readFileSync(join(MUNI_DIR, '20.topo.json'), 'utf8'));

    expect(validateMuniTopology(json, '21')).toBeNull();
  });
});
