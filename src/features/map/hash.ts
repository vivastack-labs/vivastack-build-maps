import { PREF_CODE_PATTERN } from './projection';
import type { PrefCode } from './state';

const HASH_PREFIX = '#pref-';

/**
 * URL のハッシュ（`location.hash`）から県コードを取り出す（4.11.2）。`#pref-13` は `'13'`。
 * 形が違うもの・県コードの範囲外（`#pref-99`・`#pref-1`・`#foo`・空）は `null`（ハッシュは外から来る値なので、使う前に確かめる）。
 */
export function prefFromHash(hash: string): PrefCode | null {
  if (!hash.startsWith(HASH_PREFIX)) return null;
  const code = hash.slice(HASH_PREFIX.length);
  return PREF_CODE_PATTERN.test(code) ? code : null;
}

/** 固定している県を URL のハッシュにする（4.11.2）。`'13'` は `#pref-13`、`null` は空（ハッシュなし） */
export function hashForPref(pref: PrefCode | null): string {
  return pref === null ? '' : `${HASH_PREFIX}${pref}`;
}
