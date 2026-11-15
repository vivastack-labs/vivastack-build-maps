'use client';

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { browserCardLoader, type CardLoader } from '@/features/card/cardLoader';
import { cardPref, type PrefCode } from '@/features/map/state';
import type { CardDetailLabels } from '@/i18n/cardText';
import type { Lang } from '@/i18n/lang';
import { CardBody } from './CardBody';
import { CardSources } from './CardSources';
import { useMapState } from './MapStateProvider';
import { ModeText } from './ModeText';
import { RubyText } from './RubyText';
import { useHasInteracted } from './useHasInteracted';
import { useResourceData } from './useResourceData';

type Props = {
  /** ページの言語（読み込むカードの JSON の言語） */
  readonly lang: Lang;
  /** 項目名・読み込みの状態の文言。サーバーで必要な分だけ選んで、1回だけ渡す（6.6 (2)） */
  readonly labels: CardDetailLabels;
  /** 読み込み部品。ふだんは省く（その言語のブラウザ用。テストで置き換える） */
  readonly loader?: CardLoader;
};

/** 表示中の県のカードにある、差し込み先（空の要素）。出典の差し込み先は、なければ `null` */
type Slots = { readonly pref: PrefCode; readonly body: HTMLElement; readonly sources: HTMLElement | null };

const RETRY_BUTTON_CLASS = 'mt-1 inline-flex h-8 items-center rounded border border-slate-400 px-2 hover:opacity-80';

/** 差し込み先の変化を待つ必要はない（サーバーが出した空の要素は、ハイドレーションのあとは変わらない） */
const subscribeNothing = (): (() => void) => () => undefined;

/** サーバーの描画・ハイドレーションの途中は、差し込み先を探さない */
const noSlot = (): null => null;

/** 県のカード（`article#pref-NN`）の内容の差し込み先（`[data-card-body]`）を探す。カードがない・差し込み先がない（準備中の県）なら `null` */
function findBody(pref: PrefCode | null): HTMLElement | null {
  if (pref === null) return null;
  return document.getElementById(`pref-${pref}`)?.querySelector<HTMLElement>('[data-card-body]') ?? null;
}

/**
 * 表示する県のカードの差し込み先を、DOM から探して返す。描き終えたカードを置き換えるのではなく、
 * サーバーが出した空の要素に `createPortal` で描くので、DOM を直接書き換えない。
 * 要素は同じものを返す（`useSyncExternalStore` のスナップショットが変わらないように、`Slots` は組み立て直さず、要素から導く）。
 */
function useCardSlots(pref: PrefCode | null): Slots | null {
  const body = useSyncExternalStore(subscribeNothing, () => findBody(pref), noSlot);
  if (pref === null || body === null) return null;
  return { pref, body, sources: body.closest('article')?.querySelector<HTMLElement>('[data-card-sources-slot]') ?? null };
}

/** 差し込み先に付ける印。1列の配置（768px 以上 1024px 未満）で、画面の高さぶんの高さを取っておく（`app/globals.css`） */
const RESERVE_ATTRIBUTE = 'data-card-reserve';

/**
 * ハッシュから復元して、利用者がまだ操作していない間（T3-07）は、表示中の県の差し込み先に `data-card-reserve` を付ける（T3-09、CLS）。
 * 1列の配置では、内容（JSON）が入ると下のさくいんが押し出される。入力の直後ではないので CLS に数えられる。
 * 予約はハイドレーションの前の `:target` の規則（`globals.css`）から続け、内容が入った後も外さない（内容が画面より短いと、外したときにさくいんが上がってくる）。
 * 利用者が操作したら外す（その後の変化は、入力から 500ms 以内なら CLS に数えられない）。別の県に移ったときも外す。
 */
function useReserveWhileRestoring(body: HTMLElement | null, isRestoring: boolean): void {
  // マウント（ハイドレーションの最初のコミット）で、`:target` のカードの差し込み先に先に付ける。差し込み先は、ハイドレーションが終わった次の描画で見つかる
  // （その間に `CardSwitch` が `data-card-ready` を付けて `:target` の規則が止まると、予約が一瞬外れ、画面の高さぶんのずれになる）。
  // 付けたものは、次の effect が同じ差し込み先を扱い、外すとき（操作・別の県）に一緒に外す
  useLayoutEffect(() => {
    document.querySelector(`[data-card-pref]:target [data-card-body]`)?.setAttribute(RESERVE_ATTRIBUTE, '');
  }, []);
  useLayoutEffect(() => {
    if (body === null || !isRestoring) return;
    body.setAttribute(RESERVE_ATTRIBUTE, '');
    return () => body.removeAttribute(RESERVE_ATTRIBUTE);
  }, [body, isRestoring]);
}

/**
 * 「再試行」を押したときにフォーカスがボタンにあれば、読み込めてボタンが消えたあとに、県名の見出し（`h2[data-card-name]`）へフォーカスを戻す
 * （フォーカスが `body` に落ちないように。4.11.5・T2-11）。ほかへ移っていたときは動かさない。別の県に切り替えたら、覚えたものを捨てる。
 */
function useRestoreFocusAfterRetry(body: HTMLElement | null, kind: string | undefined) {
  const shouldRestore = useRef(false);
  // 別の県に切り替えたら（差し込み先の要素が変わったら）、覚えたものを捨てる
  useEffect(() => {
    shouldRestore.current = false;
  }, [body]);
  useEffect(() => {
    if (kind === 'failed' || kind === 'offline') shouldRestore.current = false;
    if (kind !== 'loaded' || !shouldRestore.current) return;
    shouldRestore.current = false;
    const isLost = document.activeElement === null || document.activeElement === document.body;
    if (isLost) body?.closest('article')?.querySelector<HTMLElement>('[data-card-name]')?.focus();
  }, [kind, body]);
  return (event: MouseEvent<HTMLButtonElement>) => {
    shouldRestore.current = document.activeElement === event.currentTarget;
  };
}

/**
 * 読み込みの状態の表示（4.11.5）。300ms を超えたら「読み込み中」、失敗・オフラインなら文言と「再試行」。
 * 「再試行」の読み込み中は、ボタンを残して `aria-disabled` にする（消すと、フォーカスが `body` に落ちる。`disabled` もフォーカスが外れる）。
 */
function LoadStatus({
  kind,
  isRetrying,
  labels,
  onRetry
}: {
  readonly kind: 'loading' | 'slow' | 'failed' | 'offline';
  readonly isRetrying: boolean;
  readonly labels: CardDetailLabels;
  readonly onRetry: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const hasProblem = kind === 'failed' || kind === 'offline';
  return (
    <>
      {/* aria-live の領域は、読み込み中から常に1つ置き、中身だけを切り替える（あとから足した領域は、読み上げられないことがある。`MuniStatus` と同じ） */}
      <p role="status" aria-live="polite" className="mt-3 empty:mt-0">
        {kind === 'slow' && <RubyText text={labels.loading} />}
        {hasProblem && <ModeText text={kind === 'failed' ? labels.loadFailed : labels.offline} />}
      </p>
      {(hasProblem || isRetrying) && (
        <button type="button" data-card-retry aria-disabled={isRetrying ? 'true' : undefined} className={RETRY_BUTTON_CLASS} onClick={isRetrying ? undefined : onRetry}>
          <ModeText text={labels.retry} />
        </button>
      )}
    </>
  );
}

/**
 * 表示中の県（固定中、なければ最後にホバーした県。`cardPref`）のカードの内容を、県ごとの JSON（`/cards/{lang}/NN.json`）から読み込み、
 * サーバーが出した空の差し込み先に描く（T3-09、D38、F-CARD-04〜06・F-SRC-01〜03、4.11.5、6.6 (2)）。`CardSwitch` の中に1つだけ置く
 * （47枚に1つずつ置くと、props が RSC のデータに47回入る）。DOM は `createPortal` で差し込み先に描き、この部品自体は何も出さない。
 * 行き方・名物・名所（`CardBody`）は `[data-card-body]` に、出典欄（`CardSources`）は最大化ボタンの後の `[data-card-sources-slot]` に描く（4.11.7）。
 * 差し込み先がない県（「準備中」）は読み込まない。表示する県が変わったら、前の県の通知は使わない（`useResourceData`）。
 * 差し込み先の中の `[data-card-details]`（`loading`・`slow`・`loaded`・`failed`・`offline`）を E2E が読む。
 */
export function CardDetails({ lang, labels, loader }: Props) {
  const { state } = useMapState();
  const pref = cardPref(state);
  const slots = useCardSlots(pref);
  const hasInteracted = useHasInteracted();
  useReserveWhileRestoring(slots?.body ?? null, state.pinned !== null && !hasInteracted);
  const { status, isRetrying, retry } = useResourceData(slots === null ? null : pref, loader ?? browserCardLoader(lang));
  const rememberFocus = useRestoreFocusAfterRetry(slots?.body ?? null, status?.kind);
  if (slots === null || status === null) return null;

  const onRetry = (event: MouseEvent<HTMLButtonElement>) => {
    rememberFocus(event);
    retry();
  };
  return (
    <>
      {createPortal(
        <div data-card-details={status.kind}>
          {status.kind === 'loaded' ? <CardBody data={status.data} labels={labels} /> : <LoadStatus kind={status.kind} isRetrying={isRetrying} labels={labels} onRetry={onRetry} />}
        </div>,
        slots.body
      )}
      {status.kind === 'loaded' && slots.sources !== null && createPortal(<CardSources data={status.data} labels={labels} />, slots.sources)}
    </>
  );
}
