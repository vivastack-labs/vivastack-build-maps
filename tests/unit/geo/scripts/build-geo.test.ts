import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { formatSizeReport, writeGeoOutputs } from '../../../../geo/scripts/build-geo';

// 7.4・8.2：変換の結果を public/geo/muni/NN.topo.json と geo/data/prefs.topo.json に書く
describe('writeGeoOutputs', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'build-geo-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('7.4：県ごとの市区町村を NN.topo.json に、都道府県を prefs.topo.json に書く（末尾に改行）', () => {
    // Arrange
    const dirs = { muniDir: join(root, 'public/geo/muni'), prefsFile: join(root, 'geo/data/prefs.topo.json') };
    const result = { prefs: '{"p":1}', municipalities: new Map([['01', '{"m":1}'], ['13', '{"m":13}']]) };

    // Act
    writeGeoOutputs(result, dirs);

    // Assert
    expect(readdirSync(dirs.muniDir).sort()).toEqual(['01.topo.json', '13.topo.json']);
    expect(readFileSync(join(dirs.muniDir, '13.topo.json'), 'utf8')).toBe('{"m":13}\n');
    expect(readFileSync(dirs.prefsFile, 'utf8')).toBe('{"p":1}\n');
  });

  test('8.4：前に作ったファイルのうち、今回の結果にない県のファイルは消す', () => {
    // Arrange
    const dirs = { muniDir: join(root, 'muni'), prefsFile: join(root, 'prefs.topo.json') };
    mkdirSync(dirs.muniDir, { recursive: true });
    writeFileSync(join(dirs.muniDir, '99.topo.json'), 'old');

    // Act
    writeGeoOutputs({ prefs: '{}', municipalities: new Map([['01', '{}']]) }, dirs);

    // Assert
    expect(existsSync(join(dirs.muniDir, '99.topo.json'))).toBe(false);
    expect(readdirSync(dirs.muniDir)).toEqual(['01.topo.json']);
  });
});

describe('formatSizeReport', () => {
  test('5.1：県ごとの圧縮後の大きさと、最大の県を表示する', () => {
    // Act
    const report = formatSizeReport(new Map([['01', 'a'.repeat(5000)], ['13', 'xyz']]));

    // Assert
    expect(report).toMatch(/^01 \d+ B$/m);
    expect(report).toMatch(/^13 \d+ B$/m);
    expect(report).toMatch(/最大：01/);
  });
});
