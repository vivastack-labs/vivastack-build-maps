// content/schema/prefecture.schema.json から pnpm content:types で作ったファイル。手で直さない（T1-07、開発概要書 7.1）。
// スキーマを変えたら pnpm content:types で作り直す。

export type Slug = string;
/**
 * 空や空白だけの文は書けない
 */
export type Text = string;
/**
 * 実際に開いて確かめた出典だけ。なければ空（9.3）
 */
export type Sources = Source[];
/**
 * draft（AIが下書き）→ verified（検証エージェントが確認済み）→ reviewed（人がレビュー済み）
 */
export type Status = 'draft' | 'verified' | 'reviewed';

/**
 * 1県分のコンテンツ（開発概要書 7.1）。型は pnpm content:types で src/lib/content-schema.generated.ts に作る
 */
export interface Prefecture {
  id: Slug;
  /**
   * 全国地方公共団体コードの都道府県コード（01〜47）
   */
  code: string;
  region: 'hokkaido' | 'tohoku' | 'kanto' | 'chubu' | 'kinki' | 'chugoku' | 'shikoku' | 'kyushu';
  name: Localized;
  capital: {
    name: Localized;
    /**
     * 都道府県庁の緯度（8.1）
     */
    lat: number;
    /**
     * 都道府県庁の経度（8.1）
     */
    lon: number;
  };
  /**
   * 東京からの行き方。未作成の県では書かない
   */
  access?: {
    emoji: Text;
    mode: Localized;
    route: Localized;
    /**
     * 所要時間の目安（分）
     */
    durationMin: number;
    sources: Sources;
    status: Status;
  };
  /**
   * 名物。ちょうど3件か、空（未作成）
   *
   * @maxItems 3
   */
  specialties: Specialty[];
  /**
   * 名所。ちょうど3件か、空（未作成）
   *
   * @maxItems 3
   */
  spots: Spot[];
}
/**
 * 3言語の文。日本語はふりがなの記法 {漢字|よみ} を使う（7.2）
 */
export interface Localized {
  ja: Text;
  en: Text;
  zh: Text;
}
export interface Source {
  title: Text;
  url: string;
  /**
   * 確認した日（YYYY-MM-DD）
   */
  accessed: string;
}
export interface Specialty {
  id: Slug;
  emoji: Text;
  name: Localized;
  description: Description;
  sources: Sources;
  status: Status;
}
export interface Description {
  ja: Modes;
  en: Modes;
  zh: Modes;
}
/**
 * こども向けとおとな向けの文（7.3）
 */
export interface Modes {
  kids: Text;
  adult: Text;
}
/**
 * 名所。項目は名物と同じで、emoji は省略できる
 */
export interface Spot {
  id: Slug;
  emoji?: Text;
  name: Localized;
  description: Description;
  sources: Sources;
  status: Status;
}
