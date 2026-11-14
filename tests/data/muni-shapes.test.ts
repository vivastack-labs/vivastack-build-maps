import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { neighbors } from 'topojson-client';
import { validateMuniTopology, type MuniProperties, type MuniTopology } from '@/features/map/muniLoader';
import { muniShapes } from '@/features/map/muniShapes';
import { OKINAWA_FRAME } from '@/features/map/projection';

// F-MUNI-01・D16：コミットされた47県の市区町村データを、すべて描ける形（パス・濃淡・ラベルの位置）にできる

const MUNI_DIR = join(process.cwd(), 'public', 'geo', 'muni');
const CODES = Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, '0'));

function load(code: string): MuniTopology {
  const data = validateMuniTopology(JSON.parse(readFileSync(join(MUNI_DIR, `${code}.topo.json`), 'utf8')) as unknown, code);
  if (data === null) throw new Error(`${code}.topo.json が検証を通りません`);
  return data;
}

describe('muniShapes（コミットされたデータ）', () => {
  test.each(CODES)('F-MUNI-01: %s.topo.json は全件を描け、隣り合う市区町村が同じ濃淡にならない', code => {
    const data = load(code);

    const result = muniShapes(data, code);

    expect(result).not.toBeNull();
    const shapes = result?.shapes ?? [];
    expect(shapes).toHaveLength(data.objects.municipalities.geometries.length);
    expect(shapes.every(shape => shape.d.startsWith('M') && Number.isFinite(shape.label.x) && Number.isFinite(shape.label.y) && shape.label.area > 0)).toBe(true);
    expect(result?.outline.startsWith('M')).toBe(true);
    const shadeByCode = new Map(shapes.map(shape => [shape.code, shape.shade]));
    const codes = data.objects.municipalities.geometries.map(geometry => (geometry.properties as MuniProperties).code);
    neighbors(data.objects.municipalities.geometries).forEach((adjacent, i) => {
      for (const j of adjacent) {
        expect(shadeByCode.get(codes[i] as string), `${codes[i]} と ${codes[j]}`).not.toBe(shadeByCode.get(codes[j] as string));
      }
    });
  });

  test('F-MUNI-01: 沖縄県（47）のラベルの位置は、点線枠の中にある', () => {
    const shapes = muniShapes(load('47'), '47')?.shapes ?? [];

    for (const { label } of shapes) {
      expect(label.x).toBeGreaterThanOrEqual(OKINAWA_FRAME.x);
      expect(label.x).toBeLessThanOrEqual(OKINAWA_FRAME.x + OKINAWA_FRAME.width);
      expect(label.y).toBeGreaterThanOrEqual(OKINAWA_FRAME.y);
      expect(label.y).toBeLessThanOrEqual(OKINAWA_FRAME.y + OKINAWA_FRAME.height);
    }
  });

  test('D36: 東京都（13）の小笠原村は、実際の位置（viewBox の外）に描く', () => {
    const shapes = muniShapes(load('13'), '13')?.shapes ?? [];

    const ogasawara = shapes.find(shape => shape.properties.name.ja === '小笠原村');

    expect(ogasawara).toBeDefined();
    expect(ogasawara?.label.y).toBeGreaterThan(1130);
  });
});

describe('政令指定都市', () => {
  // 20市：北海道（札幌）〜 熊本県。市のコード（xx100・xx130 など）は区に分かれていて、データにない
  const DESIGNATED_CITIES = [
    '01100',
    '04100',
    '11100',
    '12100',
    '14100',
    '14130',
    '14150',
    '15100',
    '22100',
    '22130',
    '23100',
    '26100',
    '27100',
    '27140',
    '28100',
    '33100',
    '34100',
    '40100',
    '40130',
    '43100'
  ];

  test('F-MUNI-01、D16：政令指定都市は区に分かれている', () => {
    for (const city of DESIGNATED_CITIES) {
      const data = load(city.slice(0, 2));
      const codes = data.objects.municipalities.geometries.map(geometry => (geometry.properties as MuniProperties).code);
      expect(codes, `${city} は区に分かれている`).not.toContain(city);
      expect(
        codes.some(code => code.startsWith(city.slice(0, 4))),
        `${city} の区がある`
      ).toBe(true);
    }
    expect(DESIGNATED_CITIES).toHaveLength(20);
  });
});
