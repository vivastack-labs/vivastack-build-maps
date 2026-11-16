import type { ReactNode } from 'react';
import { RubyText } from './RubyText';

type SectionProps = {
  /** 節の見出し（辞書の文。ふりがなの記法つき） */
  readonly heading: string;
  /** 節を見分ける属性の名前と値（`data-about-section="site"` など。E2E・テストが使う） */
  readonly marker: readonly [attribute: `data-${string}`, value: string];
  readonly children: ReactNode;
};

/** 説明のページ（「このサイトについて」・プライバシーポリシー）の見出し h1 */
export function PageTitle({ text }: { readonly text: string }) {
  return (
    <h1 className="text-2xl font-bold">
      <RubyText text={text} />
    </h1>
  );
}

/** 説明のページの節（h2 の見出しと中身）。`<section>` に名前を付けない（ランドマークを増やさない。AGENTS.md） */
export function ContentSection({ heading, marker, children }: SectionProps) {
  return (
    <section {...{ [marker[0]]: marker[1] }} className="space-y-2">
      <h2 className="text-lg font-bold">
        <RubyText text={heading} />
      </h2>
      {children}
    </section>
  );
}

/** 辞書の文を1段落で出す */
export function Paragraph({ text }: { readonly text: string }) {
  return (
    <p>
      <RubyText text={text} />
    </p>
  );
}

/** 辞書の文を箇条書きで出す（文そのものを key にする。同じ文は並べない） */
export function BulletList({ items }: { readonly items: readonly string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-6">
      {items.map(item => (
        <li key={item}>
          <RubyText text={item} />
        </li>
      ))}
    </ul>
  );
}
