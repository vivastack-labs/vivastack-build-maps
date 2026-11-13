/**
 * 県の形を、短い SVG のパスの文字列にする d3-geo の出力先（T2-04、5.1、D24）。
 *
 * 県のパスは HTML に埋め込まれ、Next.js の RSC のデータにも同じ文字列が入るので、2回ぶん送られる。
 * 絶対座標の `L`（"L603.2,392.8"）より、整数の差分の `l`（"l-.3,-1.6"）のほうが半分以下に短くなる。
 *
 * - 座標は 0.1 単位に丸める（今までの小数1桁と同じ精度）。
 * - 各リングを `M` の絶対座標で始め、続きは `l` の差分で書く。差分は丸めた整数（0.1 単位）の差なので、誤差はたまらない。
 * - 先頭の0（`0.5` → `.5`）と、負の数・小数点の前の区切りは省く（`l.3,0-.6.7`）。
 */
import type { GeoContext } from 'd3-geo';

/** 座標を丸める単位の逆数（0.1 単位 → 10） */
const PRECISION = 10;
/** リングを書くのに要る、丸めた後の異なる点の数の下限（これより少ないと面にならない） */
const MIN_RING_POINTS = 3;

type Cell = readonly [x: number, y: number];

/** `geoPath(projection, context)` に渡す出力先。リングごとにたまった点を、`toString()` で文字列にする */
export type RelativePathContext = GeoContext & { toString(): string };

/** 0.1 単位の整数 n を、先頭の0を省いた小数の文字列にする（`5` → `.5`、`-12` → `-1.2`、`30` → `3`） */
function formatTenths(n: number): string {
  const sign = n < 0 ? '-' : '';
  const absolute = Math.abs(n);
  const integer = Math.trunc(absolute / PRECISION);
  const fraction = absolute % PRECISION;
  if (fraction === 0) return `${sign}${integer}`;
  return `${sign}${integer === 0 ? '' : integer}.${fraction}`;
}

/** 数の並びを、必要な区切り（`,`）だけを入れてつなぐ。負の数の前と、小数の後の `.` で始まる数の前は区切らない */
function joinNumbers(numbers: readonly string[]): string {
  return numbers.reduce((text, next, i) => {
    const previous = numbers[i - 1] ?? '';
    const needsSeparator = i > 0 && !next.startsWith('-') && !(next.startsWith('.') && previous.includes('.'));
    return text + (needsSeparator ? ',' : '') + next;
  }, '');
}

/** 丸めた点の並びを、同じ点が続かないように、閉じる点（始点と同じ最後の点）も書かないようにして整える */
function distinctPoints(points: readonly Cell[]): readonly Cell[] {
  const result = points.filter(([x, y], i) => i === 0 || x !== points[i - 1]?.[0] || y !== points[i - 1]?.[1]);
  const first = result[0];
  const last = result[result.length - 1];
  return first && last && result.length > 1 && first[0] === last[0] && first[1] === last[1] ? result.slice(0, -1) : result;
}

function ringToPath(points: readonly Cell[]): string {
  const [first] = points;
  const ring = distinctPoints(points);
  if (!first || ring.length < MIN_RING_POINTS) return '';
  const deltas = ring.slice(1).flatMap(([x, y], i) => {
    const [px, py] = ring[i] as Cell;
    return [formatTenths(x - px), formatTenths(y - py)];
  });
  return `M${joinNumbers([formatTenths(first[0]), formatTenths(first[1])])}l${joinNumbers(deltas)}z`;
}

/** 県の形を書く出力先を作る。1つの出力先に複数のリングを続けて書ける */
export function createRelativePathContext(): RelativePathContext {
  const rings: string[] = [];
  let current: Cell[] = [];
  const round = (value: number): number => Math.round(value * PRECISION);
  return {
    moveTo(x, y) {
      current = [[round(x), round(y)]];
    },
    lineTo(x, y) {
      current.push([round(x), round(y)]);
    },
    closePath() {
      rings.push(ringToPath(current));
      current = [];
    },
    beginPath() {
      // geoPath は呼ばない。出力先の型（GeoContext）が求めるので置く
    },
    arc() {
      throw new Error('県の形に点（arc）はありません');
    },
    toString() {
      return rings.join('');
    }
  };
}
