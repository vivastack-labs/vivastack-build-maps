/**
 * `RelativePathContext` が書くパス（`M` の絶対座標の後に `l` の差分、`z`）を、絶対座標の点の並びに戻す。
 * 誤差がたまらないように、座標は 0.1 単位の整数で足す。
 */
export function absolutePoints(d: string): readonly (readonly [number, number])[] {
  const tokens = d.match(/[Mlz]|-?(?:\d+\.?\d*|\.\d+)/gu) ?? [];
  const points: [number, number][] = [];
  let command = '';
  let x = 0;
  let y = 0;
  let pending: number[] = [];
  for (const token of tokens) {
    if (/^[Mlz]$/u.test(token)) {
      command = token;
      pending = [];
      continue;
    }
    pending.push(Math.round(Number(token) * 10));
    if (pending.length < 2) continue;
    const [a, b] = pending as [number, number];
    pending = [];
    [x, y] = command === 'M' ? [a, b] : [x + a, y + b];
    points.push([x / 10, y / 10]);
  }
  return points;
}
