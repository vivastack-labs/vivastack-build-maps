'use client';

import type { MuniLoader } from '@/features/map/muniLoader';
import type { Messages } from '@/i18n/messages';
import { useMapState } from './MapStateProvider';
import { ModeText } from './ModeText';
import { RubyText } from './RubyText';
import { useMuniData } from './useMuniData';

type Props = {
  /** 文言（辞書の `muni`） */
  readonly labels: Messages['muni'];
  /** 読み込み部品。ふだんは省く（テストで置き換える） */
  readonly loader?: MuniLoader;
};

const RETRY_BUTTON_CLASS = 'ml-2 inline-flex h-8 items-center rounded border border-map-border px-2 hover:opacity-80';

/**
 * 最大化した県の市区町村データの読み込みの状態の表示（T2-07、F-MUNI-05、4.11.5）。地図の箱の左上に重ねる。
 * 最大化は読み込みを待たない。ここは文言とボタンだけを出す。読み込み中は 300ms を超えたときだけ「読み込み中」、
 * 失敗・オフラインのときは文言と「再試行」。成功したら何も出さない。
 * `aria-live` の領域は最初から DOM に置く（あとから足すと読み上げられないことがあるため）。
 * 外側の `data-muni-status`（`loading`・`slow`・`loaded`・`failed`・`offline`。最大化していなければ属性なし）を E2E と T2-08 が読む。
 */
export function MuniStatus({ labels, loader }: Props) {
  const { state } = useMapState();
  const { status, retry } = useMuniData(state.maximized, loader);
  const hasProblem = status?.kind === 'failed' || status?.kind === 'offline';
  const isShown = status?.kind === 'slow' || hasProblem;

  return (
    <div data-muni-root data-muni-status={status?.kind} className={`absolute top-2 left-2 ${isShown ? 'rounded border border-map-border bg-page-bg px-2 py-1 text-sm text-page-text' : ''}`}>
      <p role="status" aria-live="polite" className="inline">
        {status?.kind === 'slow' && <RubyText text={labels.loading} />}
        {status?.kind === 'failed' && <ModeText text={labels.loadFailed} />}
        {status?.kind === 'offline' && <ModeText text={labels.offline} />}
      </p>
      {hasProblem && (
        <button type="button" data-muni-retry className={RETRY_BUTTON_CLASS} onClick={retry}>
          <ModeText text={labels.retry} />
        </button>
      )}
    </div>
  );
}
