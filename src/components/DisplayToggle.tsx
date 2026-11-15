'use client';

import { useSyncExternalStore } from 'react';

import { applySetting, DEFAULT_DISPLAY, type Mode, MODE_STORAGE_KEY, parseMode, parseRuby, type Ruby, RUBY_STORAGE_KEY } from '@/features/mode/settings';
import type { Lang } from '@/i18n/lang';
import type { Messages } from '@/i18n/messages';

type Props = {
  readonly lang: Lang;
  /** ボタンの文言（辞書の `display`）。モードによらず同じ文言（切り替えで名前が変わると、どれを押したか分からなくなる） */
  readonly labels: Messages['display'];
};

const ATTRIBUTES = ['data-mode', 'data-ruby'];

/** 購読の一覧。ボタンを押したとき、`MutationObserver`（非同期）を待たずに、同じ処理の中で状態を合わせるために使う */
const listeners = new Set<() => void>();

/** `<html>` の `data-mode`・`data-ruby` の変化を購読する（ボタンのほか、外からの変更も `MutationObserver` で受ける） */
function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ATTRIBUTES });
  return () => {
    listeners.delete(onChange);
    observer.disconnect();
  };
}

/** 購読している状態に、`<html>` の属性が変わったことを伝える */
function notify(): void {
  listeners.forEach(listener => listener());
}

/**
 * `<html>` の属性を読む（唯一の状態）。値が正しくなければ、言語の既定値にする。
 * サーバー・ハイドレーションでは既定値を返す（サーバーの出力と同じ）。
 */
function useHtmlSetting<T extends Mode | Ruby>(attr: 'mode' | 'ruby', parse: (value: unknown) => T | null, fallback: T): T {
  return useSyncExternalStore(
    subscribe,
    () => parse(document.documentElement.dataset[attr]) ?? fallback,
    () => fallback
  );
}

const BUTTON = 'min-h-11 min-w-11 cursor-pointer border border-slate-400 px-3 py-1 text-sm';
/**
 * 押している状態の見た目。`aria-pressed` ではなく `<html>` の属性のバリアントで付ける（初期化スクリプトの後、ハイドレーションの前から正しい見た目になる）。
 * Tailwind がクラス名を拾えるよう、組み立てずに全体を書く。
 */
const KIDS_BUTTON = `${BUTTON} rounded-l kids:bg-map-selected kids:text-slate-950`;
const ADULT_BUTTON = `${BUTTON} -ml-px rounded-r adult:bg-map-selected adult:text-slate-950`;
const RUBY_BUTTON = `${BUTTON} rounded bg-map-selected text-slate-950 ruby-off:bg-transparent ruby-off:text-inherit`;

function saveMode(mode: Mode): void {
  applySetting(document.documentElement, () => window.localStorage, MODE_STORAGE_KEY, 'mode', mode);
  notify();
}

function saveRuby(ruby: Ruby): void {
  applySetting(document.documentElement, () => window.localStorage, RUBY_STORAGE_KEY, 'ruby', ruby);
  notify();
}

/**
 * モード（こども／おとな。F-MODE-01）とふりがな（ON/OFF。F-MODE-02。日本語のページだけ）の切替ボタン（4.11.7、6.6 (3)）。
 * 状態は `<html data-mode data-ruby>` だけが持ち、押すと属性を書いて localStorage に保存する。文の出し分けは CSS（`app/globals.css`）。
 * JavaScript がないときは動かないので、`noscript:hidden` で隠す（レイアウトがずれない）。
 */
export function DisplayToggle({ lang, labels }: Props) {
  const defaults = DEFAULT_DISPLAY[lang];
  const mode = useHtmlSetting('mode', parseMode, defaults.mode);
  const ruby = useHtmlSetting('ruby', parseRuby, defaults.ruby);

  return (
    <div data-display-toggle className="flex flex-wrap items-center gap-2 noscript:hidden">
      <div role="group" aria-label={labels.label} className="inline-flex">
        <button type="button" data-mode-button="kids" aria-pressed={mode === 'kids'} onClick={() => saveMode('kids')} className={KIDS_BUTTON}>
          {labels.kids}
        </button>
        <button type="button" data-mode-button="adult" aria-pressed={mode === 'adult'} onClick={() => saveMode('adult')} className={ADULT_BUTTON}>
          {labels.adult}
        </button>
      </div>
      {lang === 'ja' ? (
        <button type="button" data-ruby-button aria-pressed={ruby === 'on'} onClick={() => saveRuby(ruby === 'on' ? 'off' : 'on')} className={RUBY_BUTTON}>
          {labels.ruby}
        </button>
      ) : null}
    </div>
  );
}
