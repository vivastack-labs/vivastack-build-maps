# T3-07 言語の切替：実装計画

- タスクの定義：`docs/tasks/m3-card-i18n-mode.md` の T3-07
- ブランチ：`feat/T3-07-lang-switch`
- 参照仕様：開発概要書 F-I18N-01〜03、4.11.2、D8・D35

## 目的

3言語のページを、固定している県を保ったまま行き来できるようにする（ハッシュ `#pref-NN` で引き継ぐ）。
ページを開いたときのハッシュから県を固定し、`<head>` に `hreflang` と `canonical` を出して、検索エンジンに言語の対応を伝える。

## 方針

### ハッシュの解析：`src/features/map/hash.ts`（純粋関数）

```ts
/** `#pref-13` → '13'。形が違う・県コードの範囲外（`#pref-99`・`#pref-1`・`#foo`・空）は null */
export function prefFromHash(hash: string): PrefCode | null;
/** '13' → '#pref-13'、null → ''（ハッシュなし） */
export function hashForPref(pref: PrefCode | null): string;
```

- 県コードの検査は `PREF_CODE_PATTERN`（`projection.ts`）を使う。

### ハッシュと固定の同期：`HashSync`（`src/components/`、クライアント。DOM を出さない）

`app/[lang]/page.tsx` の `MapStateProvider` の中に置く。

1. **開いたとき**：`useLayoutEffect` で `location.hash` を `prefFromHash` で読み、県があれば `dispatch({ type: 'restore', pref })`（固定する。最大化はしない）。
   正しくないハッシュは無視する（固定しない。ハッシュも消さない）。
   - `useLayoutEffect` で送るので、再描画も描画の前に終わる。そのため、ハイドレーションの前に `:target` で見えていたカードが、ハイドレーションの後に一瞬消えて案内文になることがない（T3-03 で分かったこと）。
2. **固定が変わったとき**：`history.replaceState(history.state, '', pathname + search + hashForPref(pinned))`。履歴は増やさない（戻るボタンで県の固定をたどらない）。
   - 開いた直後の、復元の前の `pinned === null` でハッシュを消さないよう、復元が終わってから同期を始める。
   - `history.state` はそのまま渡す（Next.js のルーターが使っている）。
3. **言語切替のリンク**：固定が変わるたびに、ヘッダーの `a[data-lang-link]` の `href` を `/{lang}/` ＋ハッシュに書き換える（属性だけ。6.6 (2) の方式）。

### 言語切替のリンク：`LangSwitch`（`src/components/`、サーバー）

`Header` の、モード・ふりがなの切替の横に置く。

```html
<ul data-lang-switch aria-label="言語">
  <li><a href="/ja/" data-lang-link="ja" hreflang="ja" lang="ja" aria-current="page">日本語</a></li>
  <li><a href="/en/" data-lang-link="en" hreflang="en" lang="en">English</a></li>
  <li><a href="/zh/" data-lang-link="zh" hreflang="zh-Hans" lang="zh-Hans">中文</a></li>
</ul>
```

- **ふつうの `<a>`**にする（`next/link` は使わない。判断 1）。全体の読み込みにするので、`<html data-mode data-ruby>` は、移った先のページの初期化スクリプトが localStorage の保存した値で書く（T3-05 で分かったこと）。
- 言語の名前は、その言語で書く（`日本語`・`English`・`中文`）。辞書には入れず、`src/i18n/lang.ts` に `LANG_NAMES` を置く（どのページでも同じ文字のため。判断 2）。リストの `aria-label` だけを辞書（`langSwitch.label`）に入れる。
- `<nav>` は使わない。ランドマークは `header`・`main`・`footer` の3つだけ、という決まり（AGENTS.md）を守る。
- JavaScript がないときは、ハッシュなしの `/{lang}/` に移る（固定の引き継ぎは JavaScript があるときだけ）。

### `hreflang`・`canonical`：`app/[lang]/layout.tsx` の `generateMetadata`

```ts
alternates: {
  canonical: `${SITE_URL}/${lang}/`,
  languages: { ja: `${SITE_URL}/ja/`, en: `${SITE_URL}/en/`, 'zh-Hans': `${SITE_URL}/zh/`, 'x-default': `${SITE_URL}/ja/` }
}
```

- `SITE_URL = 'https://maps.vivastack-dev.workers.dev'`（D8・D35）を `src/lib/site.ts` に置く。
- プレビュー用のビルドも同じ（本番の URL を指す。プレビューには `noindex` が付いているので、検索には出ない。判断 3）。
- 組み立ては純粋関数 `alternateUrls(lang)`（`src/lib/site.ts`）にして、単体テストで確かめる。

### 768px 未満で開いたときのハッシュ（T3-06 で分かったこと。判断 4）

- ハッシュから復元すると、パネルは全部見える状態で開く（レビュー後にオーナーが変更。当初は一部だけ見える状態）。
- **フォーカスは移さない**。`CardSheet` の `useSheetDom` が、復元による開きを見分けてフォーカスを移さないようにする。見分け方は、ハイドレーション直後の最初の「閉じている → 開いた」だけを対象にすること（`HashSync` から `restore` に印を付けず、`CardSheet` 側で、マウントしてから利用者の操作がまだないことで判断する）。実装の細部は単体テストで決める。

## 先に書くテスト

### 単体（Vitest）

| ファイル | テスト名 |
|---|---|
| `tests/unit/features/map/hash.test.ts` | `4.11.2：#pref-13 は 13` / `4.11.2：#pref-99・#pref-1・#pref-013・#foo・空は null` / `hashForPref：13 は #pref-13、null は空` |
| `tests/unit/lib/site.test.ts` | `F-I18N-03：alternateUrls は ja・en・zh-Hans・x-default の4つと canonical を返す` |
| `tests/unit/components/HashSync.test.tsx` | `4.11.2：開いたときのハッシュの県を固定する` / `正しくないハッシュでは固定しない` / `固定が変わると replaceState でハッシュを書く（解除で消す）` / `復元の前にハッシュを消さない` / `言語切替のリンクの href にハッシュを付ける` |
| `tests/unit/components/LangSwitch.test.tsx` | `F-I18N-03：3言語のリンクがあり、今の言語に aria-current="page"` / `リンクに hreflang と lang` |
| `tests/unit/components/Header.test.tsx`（追加） | `Header に言語切替がある` |
| `tests/unit/components/CardSheet.test.tsx`（追加） | `ハッシュの復元で開いたときは、フォーカスを移さない` |

### E2E（`tests/e2e/lang-switch.spec.ts`。新規）

| テスト名 | 確かめ方 |
|---|---|
| `F-I18N-03・4.11.2：県を固定して英語に切り替えると、英語のページで同じ県が固定されている` | ja で長野県を固定 → 「English」をクリック → `/en/#pref-20`、地図の県の `aria-pressed="true"`、カードが長野県 |
| `4.11.2：/en/#pref-13 を開くと、東京都が固定されている` | |
| `4.11.2：正しくないハッシュ（#pref-99・#foo）で開いても、エラーにならず、何も固定されない` | `pageerror` が0件、`aria-pressed="true"` が0件 |
| `4.11.2：固定を外すと、URL のハッシュが消える` | |
| `F-I18N-03：<head> に hreflang が4つあり、URL が正しい` / `canonical はそのページの URL` | |
| `F-I18N-03：今の言語のリンクに aria-current が付いている`（3言語） | |
| `3言語のどのページからでも、ほかの2言語に移れる`（完了条件） | 3×2 の組み合わせ |
| `T3-05：言語を切り替えても、保存したモード・ふりがなが残る` | ja で「おとな」・ふりがな OFF → English → `data-mode="adult"`。ja に戻って `data-ruby="off"` |
| `T3-03：ハッシュつきで開いたとき、ハイドレーションの前後でカードが消えない` | `addInitScript` の `MutationObserver` で、`[data-card-ready]` が付いた後の各時点で、東京都のカードが表示されていることを記録 |
| `T3-06：768px 未満でハッシュつきで開くと、パネルが一部だけ見える状態で開き、フォーカスは動かない`（iphone） | `document.activeElement` が `body` のまま |
| `JavaScript がないとき、言語切替のリンクで移れる`（ハッシュは引き継がない） | |

## 作る・変えるファイル（順番）

1. `src/features/map/hash.ts`、`src/lib/site.ts` と単体テスト
2. `src/i18n/lang.ts`（`LANG_NAMES`）、辞書（`langSwitch.label`）
3. `LangSwitch.tsx` と単体テスト、`Header.tsx`
4. `HashSync.tsx` と単体テスト、`app/[lang]/page.tsx`（`MapStateProvider` の中に置く）
5. `CardSheet`（復元ではフォーカスを移さない）と単体テスト
6. `app/[lang]/layout.tsx`（`alternates`）
7. E2E `tests/e2e/lang-switch.spec.ts`、スクリーンショットの SCENES（ヘッダーの言語切替は既存の画面に写る。足す画面は `en-from-ja-pinned`：ja で固定してから英語に切り替えた状態）
8. ドキュメント：開発概要書 4.11.2（ハッシュの同期は `replaceState`、正しくないハッシュは無視、復元ではフォーカスを動かさない）・F-I18N-03 の補足、`AGENTS.md`（アーキテクチャに「言語の切替とハッシュ」の項）

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| 3言語のどのページからでも、ほかの2言語に移れる | E2E（3×2 の組み合わせ） |
| テスト条件 | 上の表のテストが通る |
| 共通（開発計画 1.1） | `pnpm lint`・`typecheck`・`test`・`build`・`test:e2e` が通り、レビューで CRITICAL・HIGH がない |

## 判断が必要な点

| # | 点 | 推奨 | 理由 |
|---|---|---|---|
| 1 | 言語切替のリンクの種類 | ふつうの `<a>`（全体の読み込み） | `next/link` のソフトナビゲーションでは、React が `<html data-mode data-ruby>` を新しい言語の既定値に書き戻し、保存した値が消える（T3-05）。言語ごとに別の静的なページなので、全体の読み込みでも遅くない。JavaScript がなくても動く |
| 2 | 言語の名前の書き方 | その言語で書く（`日本語`・`English`・`中文`）。どのページでも同じ | 読めない言語のページに来た人が、自分の言語を見つけられるようにする（一般的な書き方）。`lang` 属性を付けて、読み上げも正しい言語で読む |
| 3 | `canonical`・`hreflang` の URL | 本番の URL（`https://maps.vivastack-dev.workers.dev`）の定数。プレビューも同じ | D8・D35。プレビューは `noindex` なので、本番を指していても検索には出ない。ビルドの環境変数を増やさない |
| 4 | 768px 未満でハッシュつきで開いたとき | パネルは全部見える状態で開き、フォーカスは移さない（レビュー後にオーナーが変更。当初は一部だけ見える状態） | 読み込み直後にフォーカスが動くと、読み上げ・キーボードの利用者には予想外（WCAG 3.2.1 の考え方）。カードはパネルで見えるので、内容は読める。全部見える状態にするのは、ハイドレーションの前の `:target` の見た目（全部見える）と同じにして、読み込みの途中でパネルが縮まないようにするため |
| 5 | ハッシュの同期の方法 | `history.replaceState`（履歴を増やさない） | タスクの定義のとおり。県を選ぶたびに履歴が増えると、戻るボタンでページを離れられなくなる |
| 6 | 固定を外したときのハッシュ | 消す（`/ja/` に戻す） | URL と画面の状態を合わせる。共有した URL を開いた人が、外した県を固定されない |
| 7 | 最大化の引き継ぎ | 引き継がない（固定だけ） | 4.11.2「固定している県をハッシュで引き継ぐ」。最大化は市区町村の読み込みを伴い、ハッシュの形も増える |
| 8 | ランドマーク | `<nav>` を使わず、ヘッダーの中の `<ul aria-label>` にする | ランドマークは `header`・`main`・`footer` の3つだけ、という今の決まり（AGENTS.md）を守る |

## 承認後に変えたこと

| 項目 | 承認したとき | 実際 | 理由 |
|---|---|---|---|
| 復元で開いたときの見分け方（判断 4 の細部） | 「マウントしてから利用者の操作がまだないこと」。実装の細部は単体テストで決める | `CardSheet` の `useHasInteracted`：`document` の捕捉の段階で `pointerdown`・`keydown`・`click` を受け、1回でもあれば「操作あり」。操作の前に「閉じている → 開いた」になったときだけ、フォーカスを移さない（`remembered` も覚えない） | `HashSync` は `useLayoutEffect` で `restore` を送るので、`CardSheet` の最初の passive effect（リスナーを付ける）より前でも後でも、利用者の操作は入らない。支援技術の仮想クリックは `click` だけが来るので、`click` も数える |
| 固定の変化でハッシュを書く条件 | 「復元が終わってから同期を始める」 | 復元が終わってから、かつ「今のハッシュの県（`prefFromHash`）が固定と違うとき」だけ書く | 正しくないハッシュ（`#foo`）で開いたとき、固定なしの同期でそのハッシュを消さない（計画の「ハッシュも消さない」を、書く条件で表した）。リンクの `href` は常に書く |
| 既存の E2E の期待 | （計画になし） | `tests/e2e/card.spec.ts`：「/en/#pref-13 を開いても、ハイドレーションの後は案内文だけが見える」→「ハッシュの県（東京都）が固定され、そのカードだけが見える」。`tests/e2e/index.spec.ts`：「Enter でハッシュが付かない」→「履歴が増えず、ハッシュは `#pref-20`（`replaceState`）」 | T3-07 で、ハッシュの県を固定する・固定をハッシュに書くようにしたため、T3-03・T2-10 のときの前提（ハッシュを開いても状態は空／固定してもハッシュは付かない）が変わった |
| T3-03 の「カードが消えない」E2E | 各時点の記録で、`useLayoutEffect` であることを確かめる | 描画の前に復元が終わることは、単体テスト（`HashSync.test.tsx`。`act` を使わず `createRoot`＋`flushSync` で、`flushSync` が戻った直後に固定が復元した県になっている。`useEffect` に戻すと失敗することを確認した）で確かめる。E2E（`requestAnimationFrame`＋`MutationObserver` の記録）は、復元しないとカードが消えることの見張りとして残す。E2E だけでは `useEffect` との違いを区別できなかった | React が同じタスクの中で再描画を終えるため、E2E からは区別できない |
| 復元で開いたときのパネルの状態（判断 4。レビュー後） | 一部だけ見える（`peek`）状態で開き、フォーカスは移さない | 全部見える（`full`）状態で開き、フォーカスは移さない。`CardSheet` で、利用者の操作の前に固定があり、768px 未満なら `expanded` を true にする。操作の有無は状態（`useHasInteracted`）。利用者が操作してから固定したときは `peek` | オーナーの決定（コードレビューの M2）。ハイドレーションの前の `:target` の見た目と同じにして、読み込みの途中でパネルが縮まないようにする（CLS）。E2E（iphone：`/en/#pref-01` で `data-sheet="full"`・フォーカスは動かない）と、`sheet.spec.ts` の layout-shift（`#pref-01` つきも 0.01 未満）で確かめる |
| 言語切替のリンクの書き換え（レビュー後） | 3言語すべての `href` にハッシュを付ける | 今の言語（`aria-current="page"`）のリンクは書き換えない。`data-lang-link` の値が言語でないリンクは飛ばす。属性名・パスは `LANG_LINK_ATTRIBUTE`・`langPath`（`src/i18n/lang.ts`）にまとめた | コードレビューの L2・L3・S1。今の言語のリンクを押しても同じ文書の `#pref-NN` へ移るだけになるため |
| ハッシュを書く URL の作り方（レビュー後） | 文字列の連結 | `new URL(location.href)` の `hash` に書いて `replaceState` に渡す。`history.state` はそのまま渡す理由をコメントに書いた | セキュリティレビューの S2、コードレビューの L1 |
