'use client';

import { useEffect, useLayoutEffect, useRef, useState, type Dispatch, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import type { MapEvent } from '@/features/map/state';
import { sheetState, SHEET_QUERY, type SheetState } from '@/features/map/sheet';
import type { Messages } from '@/i18n/messages';
import { useMapState } from './MapStateProvider';
import { RubyText } from './RubyText';
import { hasModifier } from './usePrefInteraction';

type Props = {
  /** バーのボタンの文言（辞書の `sheet`） */
  readonly labels: Messages['sheet'];
  /** カードの中身（`CardSwitch`・`MuniList`。サーバーで出力したものを受け取る。内容を props で渡さない。6.6 (2)） */
  readonly children: ReactNode;
};

/**
 * 1024px 以上は地図とさくいんの2行ぶんの高さの右の列で、スクロールしても見える位置に固定し、カードが画面より高いときは中でスクロールする（4.11.7）。
 * 768px 未満の下から出るパネルの見た目（`sheet:`。JavaScript が有効〔`scripting: enabled`〕で幅が 768px 未満のときだけ効く）：
 * 閉じている（`invisible` ＋画面の下へ。読み上げ・Tab からも外れる）／一部だけ見える（画面の下に固定）／全部見える（高さ 85dvh）。
 * 動き（開閉）は `app/globals.css` の `[data-sheet-motion]` の規則（`prefers-reduced-motion: no-preference` のときだけ）。
 */
const SECTION_CLASS = [
  'min-w-0 rounded border border-slate-300 p-4',
  'lg:sticky lg:top-4 lg:col-start-3 lg:row-span-2 lg:row-start-1 lg:max-h-[calc(100dvh-2rem)] lg:self-start lg:overflow-y-auto',
  'sheet:fixed sheet:inset-x-0 sheet:bottom-0 sheet:z-30 sheet:max-h-[85dvh] sheet:overflow-y-auto sheet:rounded-b-none sheet:border-b-0 sheet:bg-page-bg sheet:shadow-[0_-4px_12px_rgb(0_0_0/0.2)]',
  'sheet:data-[sheet=closed]:invisible sheet:data-[sheet=closed]:translate-y-full sheet:data-[sheet=full]:h-[85dvh]'
].join(' ');

const BAR_CLASS = 'sticky top-0 z-10 -mt-2 mb-2 flex items-center justify-between gap-2 bg-page-bg pb-2 md:hidden';
const BAR_BUTTON_CLASS = 'min-h-11 rounded border border-slate-400 px-4';

/** 今、パネルになる幅（768px 未満）か。`matchMedia` がない環境では `false`（フォーカスを動かさない） */
function isSheetLayout(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(SHEET_QUERY).matches;
}

/** 要素が県の要素（地図の県のパス・さくいんの項目。`data-pref`）なら、その要素 */
function prefElementOf(element: Element | null): HTMLElement | SVGElement | null {
  const isPref = element !== null && element.hasAttribute('data-pref') && (element instanceof HTMLElement || element instanceof SVGElement);
  return isPref ? element : null;
}

/** 閉じたとき、フォーカスを戻す先。開く前にフォーカスのあった県の要素（まだ DOM にあれば）、なければ最後に固定していた県の、地図のパス */
function returnTarget(remembered: HTMLElement | SVGElement | null, lastPinned: string | null): HTMLElement | SVGElement | null {
  if (remembered?.isConnected) return remembered;
  if (lastPinned === null) return null;
  const path = [...document.querySelectorAll('path[data-pref]')].find(element => element.getAttribute('data-pref') === lastPinned);
  return path instanceof SVGElement ? path : null;
}

/** 利用者の操作とみなすイベント（`document` の捕捉の段階で受ける。キーボード・ポインター・支援技術の click） */
const USER_EVENTS = ['pointerdown', 'keydown', 'click'] as const;

/**
 * 利用者が、このページを開いてから何か操作したか（T3-07）。ハッシュからの復元（`HashSync`。利用者の操作の前）で開いたパネルに、フォーカスを移さないための見分け。
 * 読み込み直後にフォーカスが動くのは、読み上げ・キーボードの利用者には予想外のため（WCAG 3.2.1）。
 */
function useHasInteracted(): RefObject<boolean> {
  const hasInteracted = useRef(false);
  useEffect(() => {
    const mark = () => {
      hasInteracted.current = true;
    };
    USER_EVENTS.forEach(type => document.addEventListener(type, mark, { capture: true }));
    return () => USER_EVENTS.forEach(type => document.removeEventListener(type, mark, { capture: true }));
  }, []);
  return hasInteracted;
}

/** ページの下側に、パネルの高さぶんの余白を足す CSS 変数（`app/globals.css`。パネルが開いている間、末尾がパネルに隠れないようにする） */
const SHEET_HEIGHT_VAR = '--sheet-h';

/**
 * パネルの DOM への結線。マウントしたらバーの `hidden` を外し、2フレーム後に `data-sheet-motion` を付ける。
 * パネルの高さを、`<html>` の `--sheet-h` に書く（`ResizeObserver`。ない環境では書かない）。
 * `sheet` が変わるたびにフォーカスを動かす（768px 未満のときだけ）：
 * 閉じている状態から開いたら県名の見出しへ（ハッシュからの復元で、利用者の操作の前に開いたときは動かさない。T3-07）、閉じたら（パネルの中にフォーカスがあったときだけ）開く前の県の要素へ戻す（4.11.6）。
 * 開いたまま別の県に固定を移したときは、パネルの外の県の要素にフォーカスがあれば、戻り先をそれに更新する（直前の県に戻る）。
 * `data-sheet` は React が描く（サーバーの HTML にも出る。ハイドレーションで食い違わない）。
 */
function useSheetDom(ref: RefObject<HTMLElement | null>, barRef: RefObject<HTMLElement | null>, sheet: SheetState, pinned: string | null): void {
  const previousSheet = useRef<SheetState>('closed');
  const remembered = useRef<HTMLElement | SVGElement | null>(null);
  const lastPinned = useRef<string | null>(null);
  const hasInteracted = useHasInteracted();

  useEffect(() => {
    const bar = barRef.current;
    if (bar) bar.hidden = false;
    // 最初の配置の切り替え（流れの中 → 画面の下に固定）では動かさない。2フレーム後（最初の描画が終わってから）に動きを有効にする
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => ref.current?.setAttribute('data-sheet-motion', ''));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [ref, barRef]);

  useEffect(() => {
    const root = ref.current;
    if (!root || typeof ResizeObserver !== 'function') return;
    const write = () => document.documentElement.style.setProperty(SHEET_HEIGHT_VAR, `${root.offsetHeight}px`);
    write();
    const observer = new ResizeObserver(write);
    observer.observe(root);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(SHEET_HEIGHT_VAR);
    };
  }, [ref]);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const before = previousSheet.current;
    previousSheet.current = sheet;
    if (pinned !== null) lastPinned.current = pinned;
    if (!isSheetLayout()) return;
    if (before === 'closed' && sheet !== 'closed') {
      // 開く：直前にフォーカスのあった県の要素を覚え、表示中のカードの県名へフォーカスを移す（パネルが見えてから）。
      // 利用者の操作の前（ハッシュからの復元）で開いたときは、フォーカスを移さない（T3-07）
      if (!hasInteracted.current) return;
      remembered.current = prefElementOf(document.activeElement);
      root.querySelector<HTMLElement>('[data-card-pref]:not([hidden]) [data-card-name]')?.focus({ preventScroll: true });
    } else if (before !== 'closed' && sheet === 'closed' && root.contains(document.activeElement)) {
      // 閉じる：フォーカスがパネルの中にあったときだけ戻す（海のタップなどで閉じたときに、フォーカスを奪わない）
      returnTarget(remembered.current, lastPinned.current)?.focus();
      remembered.current = null;
    } else if (before !== 'closed' && sheet !== 'closed') {
      const active = prefElementOf(document.activeElement);
      if (active && !root.contains(active)) remembered.current = active;
    }
  }, [ref, sheet, pinned, hasInteracted]);
}

/** パネルの中の Esc（修飾キーなし・繰り返しでない）は、地図・さくいんと同じ `escape`（固定を解除。最大化中は最大化だけを解く。4.11.2）を送る。パネルのときだけ */
function closeOnEscape(event: KeyboardEvent, sheet: SheetState, dispatch: Dispatch<MapEvent>): void {
  if (event.key !== 'Escape' || hasModifier(event) || event.repeat) return;
  if (sheet === 'closed' || !isSheetLayout()) return;
  event.preventDefault();
  dispatch({ type: 'escape' });
}

/**
 * カードの領域（`<section data-area="card">`）。768px 未満では、下から出るパネルにする（F-MAP-05、4.11.3・4.11.6・4.11.7）。
 * 開閉は `mapReducer` の `pinned` で決める（固定したら開き、固定を外したら閉じる）。パネル自身が持つ状態は、「くわしく」で広げたか（一部だけ／全部）だけ。
 * 根の `data-sheet`（`closed`・`peek`・`full`）は React が描く。サーバーの HTML に `data-sheet="closed"` が出るので、ハイドレーションの前から最初のパネルの配置になり、レイアウトがずれない（CLS）。
 * 中身（`CardSwitch` など）は描き直さない（6.6 (2)）。
 * 動き（`data-sheet-motion`）は、マウントの2フレーム後に有効にする（読み込みの直後に、パネルが下へ滑るのを見せない）。
 * JavaScript が無効のとき（`scripting: none`）は、768px 未満でもパネルにならず、1列の配置のまま `:target` でカードが読める。
 * JavaScript が有効なのに読み込めなかったとき（ハイドレーションしていない）は、`:target` の県があればパネルを全部見える状態にして、カードが読める（`app/globals.css`）。
 * パネルの中の Esc は `escape` を送る。
 * バー（`[data-sheet-bar]`。「くわしく／たたむ」と「とじる」）は JavaScript がないと動かないので `hidden` で出力し、マウントしたら外す。768px 以上では出さない（`md:hidden`）。
 * 「とじる」は `closeCard`（固定も最大化も解除する）を送る。
 * フォーカス（768px 未満のときだけ）：閉じている状態から開いたら県名の見出しへ移し（ハッシュからの復元で、利用者の操作の前に開いたときは移さない。T3-07）、閉じたら（パネルの中にフォーカスがあったときだけ）開く前の県の要素へ戻す。
 * モーダルにはしない（`role="dialog"` やフォーカスの閉じ込めはない）。一部だけ見える状態でも地図を操作し続けるため。
 * `MapStateProvider` の中に置く。
 */
export function CardSheet({ labels, children }: Props) {
  const { state, dispatch } = useMapState();
  const [expanded, setExpanded] = useState(false);
  // 閉じたら「くわしく」を戻す（次に開いたときは一部だけ見える）。描画の中で状態を直す（effect を使わない）
  if (state.pinned === null && expanded) setExpanded(false);
  const sheet = sheetState({ pinned: state.pinned, expanded });

  const ref = useRef<HTMLElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  useSheetDom(ref, barRef, sheet, state.pinned);

  return (
    <section ref={ref} data-area="card" data-sheet={sheet} className={SECTION_CLASS} onKeyDown={event => closeOnEscape(event, sheet, dispatch)}>
      <div ref={barRef} data-sheet-bar hidden className={BAR_CLASS}>
        <button type="button" data-sheet-toggle aria-expanded={expanded} className={BAR_BUTTON_CLASS} onClick={() => setExpanded(!expanded)}>
          <RubyText text={expanded ? labels.collapse : labels.expand} />
        </button>
        <button type="button" data-sheet-close className={BAR_BUTTON_CLASS} onClick={() => dispatch({ type: 'closeCard' })}>
          <RubyText text={labels.close} />
        </button>
      </div>
      {children}
    </section>
  );
}
