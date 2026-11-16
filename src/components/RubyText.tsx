import { parseRuby } from '@/lib/ruby';

type Props = { readonly text: string };

/**
 * ふりがなの記法 {漢字|よみ} を <ruby>漢字<rt>よみ</rt></ruby> として描く（7.2、6.6 (2)）。
 * `<rt>` は `aria-hidden` にする。付けないと、読みがアクセシビリティツリーの名前に入り、「北海道 ほっかいどう」と二重に読まれる。
 * 名前を見える文字と合わせるので、WCAG 2.5.3（label in name）の違反にもならない（5.2、T4-03）。見た目は変わらない。
 * 文字列は React が文字として出すので、dangerouslySetInnerHTML は使わない。
 * 包む要素は呼ぶ側で決めるので、フラグメントで返す。フックを使わないので、サーバーでもクライアントでも使える。
 * 記法に誤りがあれば parseRuby のエラーになる（ビルドで止める）。
 */
export function RubyText({ text }: Props) {
  return (
    <>
      {parseRuby(text).map((segment, i) =>
        segment.kind === 'text' ? (
          segment.text
        ) : (
          <ruby key={i}>
            {segment.base}
            <rt aria-hidden="true">{segment.reading}</rt>
          </ruby>
        )
      )}
    </>
  );
}
