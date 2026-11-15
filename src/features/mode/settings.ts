import type { Lang } from '@/i18n/lang';

/** 読む人向けの表示（F-MODE-01）：こども向け・おとな向け */
export type Mode = 'kids' | 'adult';

/** ふりがなの ON/OFF（F-MODE-02） */
export type Ruby = 'on' | 'off';

/** モードを localStorage に保存するキー。同じオリジンのほかのアプリとぶつからないよう接頭辞を付ける（言語では分けない） */
export const MODE_STORAGE_KEY = 'maps.mode';

/** ふりがなを localStorage に保存するキー */
export const RUBY_STORAGE_KEY = 'maps.ruby';

/**
 * 言語ごとの既定値（U1 → D37）。ビルド時に `<html data-mode data-ruby>` に書く。
 * en・zh はふりがながないので `ruby` は効かない（辞書の形を揃えるために `on`）。
 */
export const DEFAULT_DISPLAY: Readonly<Record<Lang, { readonly mode: Mode; readonly ruby: Ruby }>> = {
  ja: { mode: 'kids', ruby: 'on' },
  en: { mode: 'adult', ruby: 'on' },
  zh: { mode: 'adult', ruby: 'on' }
};

/** 保存された値や `<html>` の属性（境界の値）が `Mode` か確かめる。違えば `null` */
export function parseMode(value: unknown): Mode | null {
  return value === 'kids' || value === 'adult' ? value : null;
}

/** 保存された値や `<html>` の属性（境界の値）が `Ruby` か確かめる。違えば `null` */
export function parseRuby(value: unknown): Ruby | null {
  return value === 'on' || value === 'off' ? value : null;
}

/**
 * 設定を `<html>` の `data-*` に書き、localStorage に保存する（F-MODE-03）。
 * 属性を先に書くので、保存に失敗しても（プライベートモード・保存の禁止など）切替はそのページの中では効く。
 * 保存の例外は飲み込む（4.11.5：エラーは表示しない）。`storage` を関数で受け取るのは、プロパティを読むだけで例外になる環境があるため。
 */
export function applySetting(root: HTMLElement, storage: () => Storage, key: string, attr: 'mode' | 'ruby', value: Mode | Ruby): void {
  root.setAttribute(`data-${attr}`, value);
  try {
    storage().setItem(key, value);
  } catch {
    // 4.11.5：保存できなくても表示は変えない
  }
}
