'use client';

import { useEffect, useRef, type MouseEvent } from 'react';
import type { MuniLoader } from '@/features/map/muniLoader';
import type { PrefCode } from '@/features/map/state';
import type { Messages } from '@/i18n/messages';
import { useMapState } from './MapStateProvider';
import { ModeText } from './ModeText';
import { RubyText } from './RubyText';
import { useMuniShapes } from './useMuniShapes';

type Props = {
  /** 文言（辞書の `muni`） */
  readonly labels: Messages['muni'];
  /** 読み込み部品。ふだんは省く（テストで置き換える） */
  readonly loader?: MuniLoader;
};

const RETRY_BUTTON_CLASS = 'ml-2 inline-flex h-8 items-center rounded border border-map-border px-2 hover:opacity-80';

/** 最大化した県の県名のパス（`[data-pref]`）を、地図の箱の中から探す。値は文字列の比較で探す（セレクターに入れない） */
function findPrefPath(root: Element | null, pref: PrefCode): SVGElement | null {
  const paths = root?.closest('[data-map-box]')?.querySelectorAll<SVGElement>('[data-pref]') ?? [];
  return [...paths].find(path => path.getAttribute('data-pref') === pref) ?? null;
}

/**
 * 「再試行」を押したときにフォーカスがボタンにあれば、再試行が成功してボタンが消えたあとに、最大化した県のパスへフォーカスを戻す
 * （フォーカスが `body` に落ちないように。T2-11）。マウスで押してボタンにフォーカスがなかったとき（Safari はクリックでボタンにフォーカスしない）、
 * 読み込みの間にフォーカスがほかへ移ったとき、別の県に切り替えたときは動かさない。
 * `onRetryClick` をボタンの `onClick` に、`rootRef` をボタンを含む要素に付ける。
 */
function useRestoreFocusAfterRetry(maximized: PrefCode | null, kind: string | undefined) {
  const rootRef = useRef<HTMLDivElement>(null);
  /** 再試行を押したときにフォーカスがボタンにあれば、そのときの最大化の県 */
  const pendingPref = useRef<PrefCode | null>(null);
  const hasFailed = kind === 'failed' || kind === 'offline';

  // 別の県への切り替え・解除、再試行がまた失敗したときは、覚えたものを捨てる（後で読み込めたときに、利用者の操作と関係なくフォーカスが飛ばないように）
  useEffect(() => {
    pendingPref.current = null;
  }, [maximized]);
  useEffect(() => {
    if (hasFailed) pendingPref.current = null;
  }, [hasFailed]);

  useEffect(() => {
    const pref = pendingPref.current;
    if (kind !== 'loaded' || pref === null) return;
    pendingPref.current = null;
    // ボタンが消えるとフォーカスは body に落ちる。ほかの要素にあるなら、利用者が移したので動かさない
    const isLost = document.activeElement === null || document.activeElement === document.body;
    if (pref === maximized && isLost) findPrefPath(rootRef.current, pref)?.focus();
  }, [kind, maximized]);

  const onRetryClick = (event: MouseEvent<HTMLButtonElement>) => {
    pendingPref.current = document.activeElement === event.currentTarget ? maximized : null;
  };
  return { rootRef, onRetryClick };
}

/**
 * 最大化した県の市区町村データの読み込みの状態の表示（T2-07、F-MUNI-05、4.11.5）。地図の箱の左上に重ねる。
 * 最大化は読み込みを待たない。ここは文言とボタンだけを出す。読み込み中は 300ms を超えたときだけ「読み込み中」、
 * 失敗・オフラインのときは文言と「再試行」。成功したら何も出さない。「再試行」の読み込み中は、ボタンを残して `aria-disabled` にする（フォーカスを保つ）。
 * `aria-live` の領域は最初から DOM に置く（あとから足すと読み上げられないことがあるため）。
 * 外側の `data-muni-status`（`loading`・`slow`・`loaded`・`failed`・`offline`。最大化していなければ属性なし）を E2E が読む。
 * `loaded` は市区町村の形に変換できたとき（T2-08）。変換できなければ `failed`。
 * 「再試行」が成功してボタンが消えたら、フォーカスを最大化した県に戻す（T2-11）。
 */
export function MuniStatus({ labels, loader }: Props) {
  const { state } = useMapState();
  const { status, isRetrying, retry } = useMuniShapes(state.maximized, loader);
  const hasProblem = status?.kind === 'failed' || status?.kind === 'offline';
  const isShown = status?.kind === 'slow' || hasProblem || isRetrying;
  const { rootRef, onRetryClick } = useRestoreFocusAfterRetry(state.maximized, status?.kind);

  return (
    <div
      ref={rootRef}
      data-muni-root
      data-muni-status={status?.kind}
      className={`absolute top-2 left-2 ${isShown ? 'rounded border border-map-border bg-page-bg px-2 py-1 text-sm text-page-text' : ''}`}
    >
      <p role="status" aria-live="polite" className="inline">
        {status?.kind === 'slow' && <RubyText text={labels.loading} />}
        {status?.kind === 'failed' && <ModeText text={labels.loadFailed} />}
        {status?.kind === 'offline' && <ModeText text={labels.offline} />}
      </p>
      {(hasProblem || isRetrying) && (
        // 再試行の読み込み中は、ボタンを残して aria-disabled にする（消すと、フォーカスが body に落ちる。disabled もフォーカスが外れる）
        <button
          type="button"
          data-muni-retry
          aria-disabled={isRetrying ? 'true' : undefined}
          className={RETRY_BUTTON_CLASS}
          onClick={
            isRetrying
              ? undefined
              : event => {
                  onRetryClick(event);
                  retry();
                }
          }
        >
          <ModeText text={labels.retry} />
        </button>
      )}
    </div>
  );
}
