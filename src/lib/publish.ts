// 本番・プレビューごとのコンテンツの絞り込み（T3-02、開発概要書 7.1・4.11.4、R1）。
// 型だけを読み込む純粋な関数（node:fs・React を使わない）。ビルド時にサーバーで1回だけ呼ぶ。
// scripts/ から Node.js で直接読み込むことがあるので、相対の import には .ts を付ける。
import type { Prefecture, Specialty, Spot } from './content-schema.generated.ts';

/** 東京からの行き方（`Prefecture['access']` の中身） */
export type Access = NonNullable<Prefecture['access']>;

/** ビルドの種類。本番は `reviewed` の項目だけを出し、プレビューは「下書き」の印を付けてすべてを出す（7.1） */
export type BuildTarget = 'production' | 'preview';

/** 項目に、人のレビューが済んでいない（`reviewed` でない）印 `draft` を付けた型 */
export type Drafted<T> = T & { readonly draft: boolean };

/** 絞り込みの後の県。地図・カード・さくいん・ツールチップは、この型を受け取る（`loadContent()` の結果を直接渡せない） */
export type PublishedPrefecture = Omit<Prefecture, 'access' | 'specialties' | 'spots'> & {
  readonly access?: Drafted<Access>;
  readonly specialties: readonly Drafted<Specialty>[];
  readonly spots: readonly Drafted<Spot>[];
  /** 本番で内容を出さない県（「準備中」。4.11.4）。プレビューでは常に false */
  readonly pending: boolean;
};

/**
 * 環境変数 `BUILD_TARGET` からビルドの種類を求める。未設定・空は `production`。
 * それ以外の値は例外にして、ビルドを止める（間違えたときに下書きが外に出る側へ倒さない。R1）。
 */
export function buildTarget(env: Readonly<Record<string, string | undefined>> = process.env): BuildTarget {
  const value = env.BUILD_TARGET;
  if (value === undefined || value === '') return 'production';
  if (value === 'production' || value === 'preview') return value;
  throw new Error(`BUILD_TARGET は production か preview にしてください（今の値：${JSON.stringify(value)}）`);
}

/** 行き方があり、名物・名所が1件以上あり、すべての項目が `reviewed` の県。本番ではこの県だけが内容を出す（7.1） */
export function isComplete({ access, specialties, spots }: Prefecture): boolean {
  if (access === undefined || specialties.length === 0 || spots.length === 0) return false;
  return [access, ...specialties, ...spots].every(({ status }) => status === 'reviewed');
}

/** 項目に `draft`（`reviewed` でなければ true）を付けた新しいオブジェクトを返す */
function withDraft<T extends { readonly status: string }>(item: T): Drafted<T> {
  return { ...item, draft: item.status !== 'reviewed' };
}

/** 基本情報（県名・県庁など）だけを残し、行き方・名物・名所を持たない「準備中」の県にする */
function toPending({ id, code, region, name, capital }: Prefecture): PublishedPrefecture {
  // 項目を1つずつ書く（スキーマに必須の項目が増えれば型で落ちて気付く。省ける項目が増えても、ここに書かないので除かれる＝準備中の県に未確認の内容が漏れない側。R1）
  return { id, code, region, name, capital, specialties: [], spots: [], pending: true };
}

/** 全項目を出し、`reviewed` でない項目に `draft` を付ける。`pending` は false（本番の揃った県は、すべて `reviewed` なので `draft` もすべて false になる） */
function toShown({ access, specialties, spots, ...basics }: Prefecture): PublishedPrefecture {
  return {
    ...basics,
    ...(access === undefined ? {} : { access: withDraft(access) }),
    specialties: specialties.map(withDraft),
    spots: spots.map(withDraft),
    pending: false
  };
}

/**
 * ビルドの種類に合わせて県を絞り込む（7.1・4.11.4）。入力は変えず、県の順番も保つ。
 * - 本番：`isComplete` の県だけ内容を出す。そうでない県（未作成を含む）は「準備中」にし、名物・名所・行き方を1つも持たせない。
 * - プレビュー：すべての県・項目を出し、`reviewed` でない項目に `draft` を付ける。
 */
export function publish(prefectures: readonly Prefecture[], target: BuildTarget): readonly PublishedPrefecture[] {
  if (target === 'preview') return prefectures.map(toShown);
  return prefectures.map(prefecture => (isComplete(prefecture) ? toShown(prefecture) : toPending(prefecture)));
}
