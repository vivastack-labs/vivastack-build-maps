import { describe, expect, test } from 'vitest';
import { distancesFromTokyo, EARTH_RADIUS_KM, haversineKm, roundTo10Km } from '@/lib/distance';
import type { Prefecture } from '@/lib/content';

// 県庁の緯度経度は content/prefectures/ の値（コンテンツを直したら、ここも直す）
const TOKYO = { lat: 35.689629, lon: 139.691772 };
const OSAKA = { lat: 34.686352, lon: 135.519769 };
const OKINAWA = { lat: 26.212223, lon: 127.68059 };

// 参照値は、国土地理院の「距離と方位角の計算」と同じ方法（GRS80 楕円体の上の測地線長。Vincenty 法）で
// 手元で計算した値。ハバーサイン（球。半径 6,371km）との差は、大阪で約 0.2%、沖縄で約 0.03%
const GSI_TOKYO_OSAKA_KM = 395.91;
const GSI_TOKYO_OKINAWA_KM = 1553.636;

/** 距離テスト用の最小の県（distancesFromTokyo が読む項目だけ。形は Prefecture に合わせる） */
const pref = (code: string, point: { lat: number; lon: number }): Prefecture => ({ code, capital: { lat: point.lat, lon: point.lon } }) as unknown as Prefecture;

describe('haversineKm', () => {
  test('F-CARD-03: 同じ点どうしは 0km', () => {
    expect(haversineKm(TOKYO, TOKYO)).toBe(0);
  });

  test('7.5: 東京都庁 → 大阪府庁が、国土地理院の距離計算の結果と1%以内で一致する', () => {
    expect(Math.abs(haversineKm(TOKYO, OSAKA) - GSI_TOKYO_OSAKA_KM) / GSI_TOKYO_OSAKA_KM).toBeLessThan(0.01);
  });

  test('7.5: 東京都庁 → 沖縄県庁が、国土地理院の距離計算の結果と1%以内で一致する', () => {
    expect(Math.abs(haversineKm(TOKYO, OKINAWA) - GSI_TOKYO_OKINAWA_KM) / GSI_TOKYO_OKINAWA_KM).toBeLessThan(0.01);
  });

  test('地球の半径は 6,371km', () => {
    expect(EARTH_RADIUS_KM).toBe(6371);
  });
});

describe('roundTo10Km', () => {
  test('7.5: 10km 単位に丸める（394 → 390、395 → 400）', () => {
    expect(roundTo10Km(394)).toBe(390);
    expect(roundTo10Km(395)).toBe(400);
    expect(roundTo10Km(0)).toBe(0);
  });
});

describe('distancesFromTokyo', () => {
  test('県コードごとに丸めた距離を返し、東京都は 0', () => {
    // Arrange
    const prefectures = [pref('13', TOKYO), pref('27', OSAKA), pref('47', OKINAWA)];

    // Act
    const distances = distancesFromTokyo(prefectures);

    // Assert
    expect(distances.get('13')).toBe(0);
    expect(distances.get('27')).toBe(400);
    expect(distances.get('47')).toBe(1550);
    expect(distances.size).toBe(3);
  });

  test('東京都がなければ例外', () => {
    expect(() => distancesFromTokyo([pref('27', OSAKA)])).toThrow('東京都');
  });
});
