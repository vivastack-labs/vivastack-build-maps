'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { hashForPref, prefFromHash } from '@/features/map/hash';
import { useMapState } from './MapStateProvider';

/** 言語切替のリンク（`LangSwitch`）。`href` の書き換えだけを行う（6.6 (2)：サーバーの出力は描き直さない） */
const LANG_LINK_SELECTOR = 'a[data-lang-link]';

/**
 * 固定している県と URL のハッシュ（`#pref-NN`）を合わせる（4.11.2、F-I18N-03）。DOM の要素は出さない。`MapStateProvider` の中に置く。
 * - 開いたとき：ハッシュの県を固定する（`restore`。最大化はしない）。正しくないハッシュは無視する（固定もハッシュの消去もしない）。
 *   `useLayoutEffect` で送るので、再描画は最初の描画の前に終わる（ハイドレーションの前に `:target` で見えていたカードが、後で一瞬消えない。T3-03）。
 * - 固定が変わったとき：`history.replaceState` でハッシュを書く（解除で消す。履歴を増やさない）。復元の反映が終わる（固定が復元した県になる）までは書かない（復元の前の「固定なし」でハッシュを消さない）。
 * - 言語切替のリンクの `href` に、同じハッシュを付ける（固定を保ったまま言語を移れる）。
 */
export function HashSync() {
  const { state, dispatch } = useMapState();
  /** 復元を送ったが、まだ固定に反映されていない県（反映されたら `null`）。この間は、ハッシュとリンクを書かない */
  const pendingRestore = useRef<string | null>(null);

  useLayoutEffect(() => {
    const pref = prefFromHash(window.location.hash);
    if (pref === null) return;
    pendingRestore.current = pref;
    dispatch({ type: 'restore', pref });
  }, [dispatch]);

  const { pinned } = state;
  useEffect(() => {
    if (pendingRestore.current !== null) {
      if (pinned !== pendingRestore.current) return;
      pendingRestore.current = null;
    }
    const hash = hashForPref(pinned);
    // ハッシュが固定と合っているときは書かない（正しくないハッシュが残っていても、固定がなければそのままにする）
    if (prefFromHash(window.location.hash) !== pinned) {
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + hash);
    }
    document.querySelectorAll<HTMLAnchorElement>(LANG_LINK_SELECTOR).forEach(link => {
      const code = link.getAttribute('data-lang-link');
      link.setAttribute('href', `/${code}/${hash}`);
    });
  }, [pinned]);

  return null;
}
