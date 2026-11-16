import { RubyText } from './RubyText';

type Props = {
  /** URL の前後の文（辞書の `before`・`after`） */
  readonly text: { readonly before: string; readonly after: string };
  /** リンク先。文字にも同じ URL を出す。定数（`src/lib/sources.ts`）から渡す */
  readonly url: string;
};

/**
 * 「前の文 + URL のリンク + 後の文」の形の文（出典の表記：8.3、Cloudflare の説明へのリンク：5.6）を描く。
 * リンクは別のサイトなので `rel="noopener noreferrer"`。同じタブで開く（読み終えた後に押すため）。
 * 親の要素（`<p>`）の中に出す。フックを使わないので、サーバーでもクライアントでも使える。
 */
export function LinkedSentence({ text, url }: Props) {
  return (
    <>
      <RubyText text={text.before} />
      <a href={url} rel="noopener noreferrer" className="underline">
        {url}
      </a>
      <RubyText text={text.after} />
    </>
  );
}
