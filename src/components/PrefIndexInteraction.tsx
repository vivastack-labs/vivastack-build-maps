'use client';

import type { MouseEvent, ReactNode } from 'react';
import { prefFromTarget } from '@/features/map/pointer';
import { ONE_COLUMN_QUERY } from '@/features/map/sheet';
import { hasModifier, usePrefInteraction } from './usePrefInteraction';

/** 1列の配置（1024px 未満）か。`matchMedia` がない環境では `false` */
function isOneColumn(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(ONE_COLUMN_QUERY).matches;
}

/**
 * 県名さくいん（`PrefIndex`）を包み、操作を `mapReducer` につなぐ（F-IDX-02・03、4.11.2、6.6 (2)）。
 * `MapInteraction` と同じ結線（`usePrefInteraction`）で、イベントはここでまとめて受け（委譲）、県は `data-pref` で引く。
 * 状態は項目の `aria-pressed`・`data-state` の属性で表す（要素は描き直さない）。
 * - 項目の外（項目と項目の間・見出し）のクリックは無視する。海・余白のクリックで固定を解除するのは地図の操作。
 * - JavaScript があるときは、項目のクリックでリンクの移動を止める（ハッシュの反映は T3-07）。
 * - キーボード：Enter・Space＝クリック、Shift + Enter＝ダブルクリック、Esc＝解除（`keyToMapEvent`）。キーボードのフォーカス（`:focus-visible`）＝ホバー。
 * - 1024px 未満（1列の配置）では、ホバー（マウス・キーボードのフォーカス）でカードを変えない（T3-06、4.11.2）。カードがさくいんの上にあり、
 *   カードの高さが変わるとさくいんがずれて、クリックが別の項目に当たるため。クリック・Enter・Space での固定は変わらない。
 * マウントしたら `data-index-ready` を付ける。E2E はハイドレーションが終わるのを、これで待つ。
 */
export function PrefIndexInteraction({ children }: { readonly children: ReactNode }) {
  const { ref, handlers, sendClick } = usePrefInteraction({ readyAttribute: 'data-index-ready', isHoverSuppressed: isOneColumn });

  const onClick = (event: MouseEvent) => {
    // 修飾キーつきのクリック（新しいタブ・ウィンドウで開くなど）は、ブラウザの既定の動きに任せる（Shift もウィンドウで開く）
    if (hasModifier(event) || event.shiftKey) return;
    // 項目の外のクリックは、地図の「海のクリック」（固定の解除）にしない
    if (prefFromTarget(event.target) === null) return;
    // リンクの移動を止める（ページが飛ばない。ダブルクリックで2回移動もしない）
    event.preventDefault();
    sendClick(event.target);
  };

  return (
    <div ref={ref} {...handlers} onClick={onClick}>
      {children}
    </div>
  );
}
