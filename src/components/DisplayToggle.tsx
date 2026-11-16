'use client';

import { useSyncExternalStore } from 'react';

import { applySetting, DEFAULT_DISPLAY, type Mode, parseMode, parseRuby, type Ruby } from '@/features/mode/settings';
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

/** 購読するものがない購読（マウントの印用） */
const subscribeNothing = (): (() => void) => () => {};

/** ハイドレーションが終わったら true（サーバーの出力・ハイドレーション中は false。ボタンの `onClick` がつながった後） */
function useIsMounted(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false
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
  applySetting(document.documentElement, () => window.localStorage, 'mode', mode);
  notify();
}

/**
 * ふりがなを入れ替える。次の値は、描いた時点の値ではなく、押した時点の `<html>` の属性から決める
 * （ハイドレーション直後に、初期化スクリプトが書いた値と描いた値がずれていても取りこぼさない）
 */
function toggleRuby(fallback: Ruby): void {
  const current = parseRuby(document.documentElement.dataset.ruby) ?? fallback;
  applySetting(document.documentElement, () => window.localStorage, 'ruby', current === 'on' ? 'off' : 'on');
  notify();
}

/**
 * モード（こども／おとな。F-MODE-01）とふりがな（ON/OFF。F-MODE-02。日本語のページだけ）の切替ボタン（4.11.7、6.6 (3)）。
 * 状態は `<html data-mode data-ruby>` だけが持ち、押すと属性を書いて localStorage に保存する。文の出し分けは CSS（`app/globals.css`）。
 * JavaScript がないときは動かないので、`noscript:hidden` で隠す（レイアウトがずれない）。
 * マウントしたら根に `data-display-ready` を付ける（E2E は、ハイドレーションの前に押して操作が失われないよう、これを待つ）。
 */
export function DisplayToggle({ lang, labels }: Props) {
  const defaults = DEFAULT_DISPLAY[lang];
  const mode = useHtmlSetting('mode', parseMode, defaults.mode);
  const ruby = useHtmlSetting('ruby', parseRuby, defaults.ruby);
  const isMounted = useIsMounted();

  return (
    <div data-display-toggle data-display-ready={isMounted ? '' : undefined} className="flex flex-wrap items-center gap-2 noscript:hidden">
      <div role="group" aria-label={labels.label} className="inline-flex">
        <button type="button" data-mode-button="kids" aria-pressed={mode === 'kids'} onClick={() => saveMode('kids')} className={KIDS_BUTTON}>
          {labels.kids}
        </button>
        <button type="button" data-mode-button="adult" aria-pressed={mode === 'adult'} onClick={() => saveMode('adult')} className={ADULT_BUTTON}>
          {labels.adult}
        </button>
      </div>
      {lang === 'ja' ? (
        <button type="button" data-ruby-button aria-pressed={ruby === 'on'} onClick={() => toggleRuby(defaults.ruby)} className={RUBY_BUTTON}>
          {labels.ruby}
        </button>
      ) : null}
    </div>
  );
}
