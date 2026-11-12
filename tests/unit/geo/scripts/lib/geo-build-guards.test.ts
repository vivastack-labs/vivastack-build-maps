import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { NamingSources } from '../../../../../geo/scripts/lib/municipality';

// 8.2：mapshaper の出力が想定（オブジェクト1つ、形のなくなった地域なし、都道府県は1ファイル）と違えば、黙って書き出さずに止める
const applyCommands = vi.fn<(commands: string) => Promise<Record<string, string>>>();
vi.mock('mapshaper', () => ({ default: { applyCommands } }));

const { buildGeo } = await import('../../../../../geo/scripts/lib/geo-build');

const NAMING: NamingSources = {
  soumu: new Map([['13101', { code: '13101', name: '千代田区', kana: 'ﾁﾖﾀﾞｸ' }]]),
  kanaFixes: new Map(),
  romajiFixes: new Map()
};

const MUNI = { N03_004: '千代田区', N03_005: null, N03_007: '13101', pref: '13' };
const topology = (objects: Record<string, unknown>): string => JSON.stringify({ type: 'Topology', arcs: [], objects });
const collection = (...geometries: unknown[]) => ({ type: 'GeometryCollection', geometries });
const polygon = (properties: unknown) => ({ type: 'Polygon', arcs: [], properties });

function mockOutputs(muni: Record<string, string>, prefs: Record<string, string>): void {
  applyCommands.mockImplementation(async commands => (commands.includes('-split') ? muni : prefs));
}

const GOOD_PREFS = { 'prefs.json': topology({ prefs: collection(polygon({ pref: '13', lon: 139.7, lat: 35.6 })) }) };
const GOOD_MUNI = { '13.json': topology({ '13': collection(polygon(MUNI)) }) };

describe('buildGeo（mapshaper の出力の検査）', () => {
  beforeEach(() => {
    applyCommands.mockReset();
  });

  test('8.2：想定どおりの出力なら、そのまま変換する', async () => {
    // Arrange
    mockOutputs(GOOD_MUNI, GOOD_PREFS);

    // Act
    const result = await buildGeo('n03.shp', NAMING);

    // Assert
    expect([...result.municipalities.keys()]).toEqual(['13']);
    expect(applyCommands.mock.calls[0]?.[0]).toContain('-i "n03.shp" encoding=utf8');
  });

  test('8.2：都道府県の出力が1つでなければエラーにする', async () => {
    // Arrange
    mockOutputs(GOOD_MUNI, { ...GOOD_PREFS, 'other.json': GOOD_PREFS['prefs.json'] });

    // Act / Assert
    await expect(buildGeo('n03.shp', NAMING)).rejects.toThrow('都道府県の出力が1つではありません');
  });

  test('8.2：TopoJSON のオブジェクトが1つでなければエラーにする', async () => {
    // Arrange
    mockOutputs({ '13.json': topology({ a: collection(polygon(MUNI)), b: collection() }) }, GOOD_PREFS);

    // Act / Assert
    await expect(buildGeo('n03.shp', NAMING)).rejects.toThrow('オブジェクトが1つではありません');
  });

  test('8.2：簡略化で形のなくなった地域があればエラーにする', async () => {
    // Arrange
    mockOutputs({ '13.json': topology({ '13': collection({ type: null, properties: MUNI }) }) }, GOOD_PREFS);

    // Act / Assert
    await expect(buildGeo('n03.shp', NAMING)).rejects.toThrow('形のなくなった地域');
  });

  test('8.2：同じ県の市区町村が2つの出力に分かれていればエラーにする', async () => {
    // Arrange
    mockOutputs({ ...GOOD_MUNI, '13-2.json': GOOD_MUNI['13.json'] }, GOOD_PREFS);

    // Act / Assert
    await expect(buildGeo('n03.shp', NAMING)).rejects.toThrow('13');
  });

  test('8.2：出力がバイト列でも読める', async () => {
    // Arrange
    const encoded = new TextEncoder().encode(GOOD_PREFS['prefs.json']);
    applyCommands.mockImplementation(async commands => (commands.includes('-split') ? GOOD_MUNI : ({ 'prefs.json': encoded } as unknown as Record<string, string>)));

    // Act
    const result = await buildGeo('n03.shp', NAMING);

    // Assert
    expect(JSON.parse(result.prefs).objects.prefectures.geometries[0].properties).toEqual({ code: '13', label: [139.7, 35.6] });
  });
});
