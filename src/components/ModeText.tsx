import type { ModeTextValue } from '@/i18n/messages';
import { RubyText } from './RubyText';

type Props = { readonly text: ModeTextValue };

/**
 * こども向け・おとな向けの文を、`kids`・`adult` のクラスを付けて両方出力する（F-MODE-04）。
 * どちらを見せるかは CSS で切り替える（T3-05）ので、JavaScript の前から正しい方が表示できる。
 * 中身は `RubyText` で描く。フックを使わないので、サーバーでもクライアントでも使える。
 */
export function ModeText({ text }: Props) {
  return (
    <>
      <span className="kids">
        <RubyText text={text.kids} />
      </span>
      <span className="adult">
        <RubyText text={text.adult} />
      </span>
    </>
  );
}
