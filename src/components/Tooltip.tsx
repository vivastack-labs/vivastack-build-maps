'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ESCAPE_KEY } from '@/features/map/keyboard';
import { applyTipState } from '@/features/map/mapDom';
import type { MuniLoader, MuniProperties } from '@/features/map/muniLoader';
import { muniTooltipText, tooltipPosition, tooltipTarget, type TooltipTarget } from '@/features/map/tooltip';
import type { PrefCode } from '@/features/map/state';
import type { Lang } from '@/i18n/lang';
import { useMapState } from './MapStateProvider';
import { useMuniShapes } from './useMuniShapes';

type Props = {
  readonly lang: Lang;
  /** 県の中身（`[data-tip-pref]`。サーバーで出力する。`MapTooltip`） */
  readonly children: ReactNode;
  /** 読み込み部品。ふだんは省く（テストで置き換える） */
  readonly loader?: MuniLoader;
};

/** マウスの下にあるもの（`tooltipTarget` の入力のうち、イベントから決まるもの）。同じ値なら状態を変えない */
type Hit = {
  readonly pref: string | null;
  readonly muni: string | null;
  readonly pointerType: string;
  readonly buttons: number;
};

const MAP_BOX_SELECTOR = '[data-map-box]';
const POINTER_EVENTS = ['pointerover', 'pointermove', 'pointerdown', 'pointerup'] as const;

const attributeOf = (element: Element | null, selector: string, name: string): string | null => element?.closest(selector)?.getAttribute(name) ?? null;

function hitOf(event: PointerEvent): Hit {
  const target = event.target instanceof Element ? event.target : null;
  return { pref: attributeOf(target, '[data-pref]', 'data-pref'), muni: attributeOf(target, '[data-muni]', 'data-muni'), pointerType: event.pointerType, buttons: event.buttons };
}

const isSameHit = (a: Hit | null, b: Hit | null): boolean =>
  a === b || (a !== null && b !== null && a.pref === b.pref && a.muni === b.muni && a.pointerType === b.pointerType && a.buttons === b.buttons);

/** ツールチップを、マウスの位置（地図の箱の左上からの距離）の近くに置く。`transform` だけを書く（React を描き直さない） */
function place(tooltip: HTMLElement, box: Element, pointer: { readonly x: number; readonly y: number }): void {
  const rect = box.getBoundingClientRect();
  const { x, y } = tooltipPosition({ pointer, tooltip: { width: tooltip.offsetWidth, height: tooltip.offsetHeight }, box: { width: rect.width, height: rect.height } });
  tooltip.style.setProperty('transform', `translate(${Math.round(x)}px, ${Math.round(y)}px)`);
}

/** 最大化中の市区町村のツールチップの中身。市区町村の属性を引けなければ `undefined` */
function useMuniProperties(target: TooltipTarget, loader: MuniLoader | undefined): MuniProperties | undefined {
  const { state } = useMapState();
  const { status } = useMuniShapes(state.maximized, loader);
  if (target?.kind !== 'muni' || status?.kind !== 'loaded') return undefined;
  return status.shapes.shapes.find(shape => shape.code === target.code)?.properties;
}

type Point = { readonly x: number; readonly y: number };

/**
 * 地図の箱（`[data-map-box]`）でマウスの動きを受け、マウスの下にあるもの（`hit`。同じ値なら変えない）を返す。
 * 動きのたびに、ツールチップの位置（`transform`）だけを書く（React を描き直さない）。マウスの位置は `pointerRef` に残す。
 * マウスを動かさずに地図が動くと、`hit` は古くなる。ホイール（d3-zoom が伝播を止めるので capture で受ける）と、
 * 最大化の変化（`maximized`。解除でマウスの下が変わる）と、Esc（WCAG 1.4.13）でも `hit` を捨て、次にマウスが動くまで隠す。
 */
function usePointerHit(rootRef: RefObject<HTMLDivElement | null>, maximized: PrefCode | null): { readonly hit: Hit | null; readonly pointerRef: RefObject<Point | null> } {
  const pointerRef = useRef<Point | null>(null);
  const [hit, setHit] = useState<Hit | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    const box = root?.closest(MAP_BOX_SELECTOR);
    if (!root || !box) return;
    const onPointer = (event: Event) => {
      const pointerEvent = event as PointerEvent;
      const rect = box.getBoundingClientRect();
      const pointer = { x: pointerEvent.clientX - rect.left, y: pointerEvent.clientY - rect.top };
      pointerRef.current = pointer;
      place(root, box, pointer);
      const next = hitOf(pointerEvent);
      setHit(previous => (isSameHit(previous, next) ? previous : next));
    };
    const onLeave = () => setHit(null);
    // WCAG 1.4.13：Esc で隠す。フォーカスが地図の外にあっても、マウスが地図の上ならツールチップは出ているので、document で受ける
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === ESCAPE_KEY) setHit(null);
    };
    document.addEventListener('keydown', onKeyDown);
    for (const name of POINTER_EVENTS) box.addEventListener(name, onPointer);
    box.addEventListener('pointerleave', onLeave);
    box.addEventListener('wheel', onLeave, { capture: true, passive: true });
    return () => {
      for (const name of POINTER_EVENTS) box.removeEventListener(name, onPointer);
      box.removeEventListener('pointerleave', onLeave);
      box.removeEventListener('wheel', onLeave, { capture: true });
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [rootRef]);
  // 最大化が変わったら、古い hit を捨てる（次にマウスが動くまで隠れる）。描画中に状態を直す形（React の推奨。effect の setState は使わない）
  const [seenMaximized, setSeenMaximized] = useState(maximized);
  if (seenMaximized !== maximized) {
    setSeenMaximized(maximized);
    setHit(null);
  }
  return { hit, pointerRef };
}

/**
 * 地図のツールチップ（T2-09、F-TIP-01・02、4.11.2・4.11.3）。マウス・ペンの位置の近くに、県（県名と名物の名前）か、最大化中の市区町村（名前と読み）を出す。
 * `MapArea` の `[data-map-box]` の中、`MapInteraction` の外に置く。イベントは地図の箱で受け（`MapInteraction` は変えない）、
 * 何を出すかは `tooltipTarget`、位置は `tooltipPosition` で決める。出す対象が変わったときだけ状態を変える。
 * 県の中身はサーバーで全県ぶんを `hidden` で出力し（`MapTooltip`）、ここでは `hidden` だけを切り替える（6.6 (2)）。
 * 同じ情報はカードと「市区町村の一覧」で読めるので、`aria-hidden` にして二重に読ませない。`MapStateProvider` の中に置く。
 */
export function Tooltip({ lang, children, loader }: Props) {
  const { state } = useMapState();
  const rootRef = useRef<HTMLDivElement>(null);
  const { hit, pointerRef } = usePointerHit(rootRef, state.maximized);
  const target = hit === null ? null : tooltipTarget({ ...hit, maximized: state.maximized });
  const muni = useMuniProperties(target, loader);
  const prefCode = target?.kind === 'pref' ? target.code : null;
  const isShown = prefCode !== null || muni !== undefined;

  // 中身が変わると大きさが変わるので、描画の直後（画面に出る前）に、県の中身を切り替えて位置を置き直す
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    applyTipState(root, prefCode);
    const box = root.closest(MAP_BOX_SELECTOR);
    if (box && pointerRef.current && isShown) place(root, box, pointerRef.current);
  }, [prefCode, muni, isShown, pointerRef]);

  return (
    <div
      ref={rootRef}
      data-tooltip
      aria-hidden="true"
      hidden={!isShown}
      className="pointer-events-none absolute top-0 left-0 z-10 max-w-64 rounded border border-tooltip-border bg-tooltip-bg px-2 py-1 text-sm text-tooltip-text shadow"
    >
      {children}
      {muni && <MuniTipText properties={muni} lang={lang} />}
    </div>
  );
}

/** 市区町村のツールチップの中身（名前と、日本語のページだけ読み。F-TIP-02、F-I18N-05） */
function MuniTipText({ properties, lang }: { readonly properties: MuniProperties; readonly lang: Lang }) {
  const text = muniTooltipText(properties, lang);
  return (
    <div data-tip-muni lang={text.lang}>
      {text.name}
      {text.reading !== null && (
        <span data-tip-reading className="block text-xs">
          {text.reading}
        </span>
      )}
    </div>
  );
}
