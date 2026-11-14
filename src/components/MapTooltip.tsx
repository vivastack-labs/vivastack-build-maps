import type { MuniLoader } from '@/features/map/muniLoader';
import type { Lang } from '@/i18n/lang';
import type { Prefecture } from '@/lib/content-schema.generated';
import { RubyText } from './RubyText';
import { Tooltip } from './Tooltip';

type Props = {
  readonly lang: Lang;
  /** 県の一覧（県コードの順） */
  readonly prefectures: readonly Prefecture[];
  /** 読み込み部品。ふだんは省く（テストで置き換える） */
  readonly loader?: MuniLoader;
};

/**
 * 地図のツールチップ（T2-09、F-TIP-01）。47県ぶんの県名と名物の名前をサーバーで `hidden` 付きで出力し、`Tooltip` に渡す。
 * 表示する県の切り替え（`hidden` を外す）と位置は `Tooltip` が属性だけで行う（カードと同じ。6.6 (2)）。
 * 名物は名前だけ（解説文・絵文字は出さない）。名物がない県は県名だけ（4.11.4）。県名・名物の名前は `RubyText` で描く（ふりがなの ON/OFF は CSS で効く）。
 * 本番の `reviewed` だけの絞り込みは T3-02（`publish.ts` の結果を渡せば、準備中の県は名物がなくなり、県名だけになる）。
 */
export function MapTooltip({ lang, prefectures, loader }: Props) {
  return (
    <Tooltip lang={lang} loader={loader}>
      {prefectures.map(({ code, name, specialties }) => (
        <div key={code} data-tip-pref={code} hidden>
          <p data-tip-name className="font-bold">
            <RubyText text={name[lang]} />
          </p>
          {specialties.length > 0 && (
            <ul className="mt-1 list-disc pl-4">
              {specialties.map(specialty => (
                <li key={specialty.id}>
                  <RubyText text={specialty.name[lang]} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </Tooltip>
  );
}
