'use client';

import { useEffect, useState } from 'react';

/** 利用者の操作とみなすイベント（`document` の捕捉の段階で受ける。キーボード・ポインター・支援技術の click） */
const USER_EVENTS = ['pointerdown', 'keydown', 'click'] as const;

/**
 * 利用者が、このページを開いてから何か操作したか（T3-07）。ハッシュからの復元（`HashSync`。利用者の操作の前）で開いたパネルを、
 * 全部見える状態にし、フォーカスを移さないための見分け。読み込み直後にフォーカスが動くのは、読み上げ・キーボードの利用者には予想外のため（WCAG 3.2.1）。
 * 状態で持つ（描画の中で読む）。`CardSheet`（T3-07）と `CardDetails`（T3-09。差し込み先の高さの予約）が使う。操作を受けたときの更新は、同じイベントの `dispatch` と一緒に1回の描画にまとまる。
 */
export function useHasInteracted(): boolean {
  const [hasInteracted, setHasInteracted] = useState(false);
  useEffect(() => {
    const mark = () => setHasInteracted(true);
    USER_EVENTS.forEach(type => document.addEventListener(type, mark, { capture: true }));
    return () => USER_EVENTS.forEach(type => document.removeEventListener(type, mark, { capture: true }));
  }, []);
  return hasInteracted;
}
