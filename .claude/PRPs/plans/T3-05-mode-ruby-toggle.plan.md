# T3-05 モード・ふりがなの切替：実装計画

- タスクの定義：`docs/tasks/m3-card-i18n-mode.md` の T3-05
- ブランチ：`feat/T3-05-mode-ruby-toggle`
- 参照仕様：開発概要書 F-MODE-01〜04、6.6 (3)、D23・D26、U1、4.11.5

## 目的

こども向け・おとな向けの文と、ふりがなの ON/OFF を、CSS だけで切り替える。
選んだ値は localStorage に残し、`<head>` の小さなスクリプトで最初の描画の前に `<html>` に反映する（ちらつかない）。
JavaScript がなくても、ビルド時に `<html>` に書いた既定のモードで読める。

## 方針

### 既定値（U1 → D37。判断 1）

| 言語 | `data-mode` | `data-ruby` |
|---|---|---|
| ja | `kids` | `on` |
| en | `adult` | `on`（ふりがながないので効かない） |
| zh | `adult` | `on`（同上） |

開発計画 5章の推奨案のまま。開発概要書の第16章 U1 を「決定（D37）」にし、付録Aに D37 を足す。6.6 (3) にも既定値の表を書く。

### 設定のモジュール：`src/features/mode/settings.ts`（純粋関数・定数）

```ts
export type Mode = 'kids' | 'adult';
export type Ruby = 'on' | 'off';
export const MODE_STORAGE_KEY = 'maps.mode';   // 判断 2
export const RUBY_STORAGE_KEY = 'maps.ruby';
export const DEFAULT_DISPLAY: Readonly<Record<Lang, { mode: Mode; ruby: Ruby }>>;
export function parseMode(value: unknown): Mode | null;   // 'kids' | 'adult' 以外は null
export function parseRuby(value: unknown): Ruby | null;
/** <html> の属性を書き、localStorage に保存する。保存の例外は飲み込む（4.11.5：エラーは表示しない。切替はページの中では効く） */
export function applySetting(root: HTMLElement, storage: () => Storage, key, attr, value): void;
```

- localStorage は関数で受け取る（`() => window.localStorage`。プロパティを読むだけで例外になる環境があるので、読むのも try の中）。

### 初期化スクリプト：`src/features/mode/initScript.ts`

```ts
/** `<head>` の初期化スクリプト（D23。500バイト未満）。T4-01 でこの文字列の SHA-256 を CSP に書く */
export const MODE_INIT_SCRIPT = `try{var s=localStorage,d=document.documentElement,m=s.getItem("maps.mode"),r=s.getItem("maps.ruby");if(m=="kids"||m=="adult")d.dataset.mode=m;if(r=="on"||r=="off")d.dataset.ruby=r}catch(e){}`;
```

- 文字列はキーの定数から組み立てる（定数は1か所。結果の文字列は固定）。
- 正しくない値（手で書き換えた値など）は無視して、ビルド時の既定値のままにする。
- `app/[lang]/layout.tsx` の `<head>` に `<script dangerouslySetInnerHTML={{ __html: MODE_INIT_SCRIPT }} />` で置く。`<html data-mode data-ruby suppressHydrationWarning>`。
  これは Next.js 16 同梱のドキュメント（`02-guides/preventing-flash-before-hydration.md` の「Themes」）の形そのまま。`dangerouslySetInnerHTML` を使うのはここだけで、中身は固定の定数（利用者の入力が入らない）。
  レイアウトはサーバーコンポーネントなので、React の「script を描いた」警告は出ない（クライアントでは描かない）。

### CSS：`app/globals.css`（素の CSS。レイヤーなし）

```css
/* F-MODE-01・04、6.6 (3)：片方を display: none で隠す（読み上げ・aria-live・ボタンの名前からも除く） */
:root[data-mode='kids'] .adult,
:root[data-mode='adult'] .kids { display: none; }
/* F-MODE-02 */
:root[data-ruby='off'] rt { display: none; }
@custom-variant kids (&:where([data-mode='kids'], [data-mode='kids'] *));
@custom-variant adult (&:where([data-mode='adult'], [data-mode='adult'] *));
@custom-variant ruby-off (&:where([data-ruby='off'], [data-ruby='off'] *));
```

- レイヤーの外に書くので、Tailwind のユーティリティ（`@layer utilities`）より常に強い（`.kids` の要素に `inline-flex` などが付いても隠れる）。

### 切替のボタン：`DisplayToggle`（`src/components/`。クライアント。判断 3）

`Header` の h1 の横（狭い画面では下）に置く。`Header` はサーバーのまま、文言だけを props で渡す（数語なので D24 の大きさには影響しない）。

```html
<div data-display-toggle class="noscript:hidden">
  <div role="group" aria-label="モード">
    <button data-mode-button="kids"  aria-pressed="…">こども</button>
    <button data-mode-button="adult" aria-pressed="…">おとな</button>
  </div>
  <button data-ruby-button aria-pressed="…">ふりがな</button>   <!-- ja のページだけ -->
</div>
```

- 押した見た目は `aria-pressed:` ではなく、`<html>` の属性の `kids:`・`adult:`・`ruby-off:` のバリアントで付ける。初期化スクリプトが描画の前に属性を書くので、ハイドレーションの前から正しい見た目になる。
- `aria-pressed` は `useSyncExternalStore` で `<html>` の `data-mode`・`data-ruby` を読む（`MutationObserver` で購読。サーバーの値はビルド時の既定値）。DOM の属性を唯一の状態にするので、React の状態と食い違わない。
- クリックで `applySetting`（`<html>` の属性を書く → localStorage に保存。保存の失敗は無視）。
- JavaScript がないときは `noscript:`（Tailwind v4.3 の `@media (scripting: none)`）で隠す。押しても動かないボタンを見せないため。ハイドレーションで `hidden` を外す方式と違い、レイアウトがずれない（CLS）。
- 文言は辞書の `display`（新設）：ja `{ label: 'モード', kids: 'こども', adult: 'おとな', ruby: 'ふりがな' }`、en `Mode / Kids / Adults / Furigana`、zh `模式 / 儿童 / 成人 / 注音假名`（ruby は en・zh では使わないが、辞書の形は揃える）。

### `CardArea` の案内文

`card.guide.adult` だけを出していたのを `ModeText` に戻す（JSDoc の「T3-05 まで」の説明も消す）。

### `MuniStatus`

コードは変えない。CSS で片方が隠れるので、「再試行」のボタンの名前は今のモードの文だけになる（E2E で確かめる）。

## 先に書くテスト

### 単体（Vitest）

| ファイル | テスト名 |
|---|---|
| `tests/unit/features/mode/initScript.test.ts` | `D23：初期化スクリプトは500バイト未満` |
| 同 | `D23：保存した mode・ruby を <html> の data-mode・data-ruby に書く`（`node:vm` で、偽の `document`・`localStorage` を渡して実行） |
| 同 | `D23：保存した値が正しくなければ、既定値のままにする` |
| 同 | `4.11.5：localStorage が例外を投げても、例外が外に出ず既定値のまま`（`getItem` が投げる／`localStorage` を読むだけで投げる の2通り） |
| `tests/unit/features/mode/settings.test.ts` | `U1：言語ごとの既定値は ja＝kids・on、en・zh＝adult` |
| 同 | `parseMode・parseRuby は決まった値だけを受け付ける` |
| 同 | `F-MODE-03：applySetting は <html> の属性を書き、localStorage に保存する` |
| 同 | `4.11.5：保存で例外が出ても、<html> の属性は変わり、例外は外に出ない` |
| `tests/unit/components/DisplayToggle.test.tsx` | `F-MODE-01：モードのボタンを押すと <html> の data-mode と aria-pressed が変わる` |
| 同 | `F-MODE-02：ふりがなのボタンを押すと data-ruby が on/off で入れ替わる` |
| 同 | `F-MODE-02：en・zh にはふりがなのボタンがない` |
| 同 | `<html> の属性が外から変わっても aria-pressed が追従する` |
| `tests/unit/components/Header.test.tsx`（追加） | `4.11.7：Header に切替のボタンがある（ja はふりがなも）` |
| `tests/unit/components/CardArea.test.tsx`（変更） | 案内文がこども向け・おとな向けの両方を `kids`・`adult` のクラスで出す |

### E2E（`tests/e2e/mode.spec.ts`。新規）

| テスト名 | 確かめ方 |
|---|---|
| `F-MODE-01：モードを切り替えると、こども向けとおとな向けの文が入れ替わる` | ja で北海道のカードを出し、名物の解説文と案内文の `.kids` が見え `.adult` が隠れる → 「おとな」を押すと逆になる |
| `F-MODE-01：カードの解説文は片方だけが見える`（T3-03 の確認） | 解説文の `li` ごとに、見えている `.kids`・`.adult` が1つだけ |
| `F-MODE-02：ふりがなを OFF にすると rt が見えなくなる（こども・おとなの両方）` | 両モードで `rt` が `toBeHidden()` ↔ `toBeVisible()` |
| `F-MODE-03・D23：再読み込みしても設定が残り、最初の描画から保存した値になっている` | おとな・ふりがな OFF にして再読み込み。`addInitScript` の `MutationObserver` で、`<body>` が DOM に入った時点の `data-mode`・`data-ruby` を記録し、保存した値であることを確かめる |
| `F-MODE-04：JavaScript を無効にすると、既定のモードの文だけが見える` | `javaScriptEnabled: false`。ja はこども向け、en はおとな向けだけが見える。切替のボタンは見えない（`:target` で北海道のカードを開いて確かめる） |
| `英語・中国語のページには、ふりがなの切替がない` | `[data-ruby-button]` が 0 件 |
| `4.11.5：localStorage が使えなくても、エラーなく表示され、切替はそのページの中で効く` | `addInitScript` で `window.localStorage` の getter が `SecurityError` を投げるようにする。`pageerror` が0件、既定値で表示、切替で文が入れ替わる |
| `4.11.5：「再試行」のボタンの名前は今のモードの文だけ` | 市区町村を 404 にして最大化し、`toHaveAccessibleName`（こども「もう一度」→ おとなに切り替えて「再試行」） |

E2E の内容の文字は、フィクスチャ（`tests/fixtures/content`）の北海道で比べる。

### スクリーンショット（`tests/screenshots/pages.spec.ts`）

`ja-card-adult-ruby-off`（北海道のカードを出し、おとな・ふりがな OFF にした状態）を足す。既存の `ja-card` などは、解説文が1つずつになる。

## 作る・変えるファイル（順番）

1. `src/features/mode/settings.ts`・`initScript.ts` と単体テスト（Red → Green）
2. 辞書 `src/i18n/ja.ts`・`en.ts`・`zh.ts` に `display`
3. `app/globals.css`（切替の規則・`@custom-variant`）
4. `src/components/DisplayToggle.tsx` と単体テスト、`Header.tsx`（`DisplayToggle` を置く）と単体テスト
5. `app/[lang]/layout.tsx`（`<head>` のスクリプト、`<html data-mode data-ruby suppressHydrationWarning>`）
6. `CardArea.tsx`（案内文を `ModeText` に）と単体テスト
7. `tests/e2e/mode.spec.ts`、スクリーンショットの SCENES
8. ドキュメント：開発概要書（U1 → D37、付録A、6.6 (3)）、タスクの定義（分かったこと）、`AGENTS.md`（アーキテクチャに「モード・ふりがな」の項）

## 完了条件の確かめ方

| 完了条件 | 確かめ方 |
|---|---|
| 開発概要書の U1 が決定になっている | 第16章 U1 が「決定（D37）」、付録Aに D37 |
| テスト条件（単体・E2E） | 上の表のテストが通る |
| 共通（開発計画 1.1） | `pnpm lint`・`typecheck`・`test`（カバレッジ）・`build`・`test:e2e` が通り、レビューで CRITICAL・HIGH がない |

## 判断が必要な点

| # | 点 | 推奨 | 理由 |
|---|---|---|---|
| 1 | 既定値（U1） | ja＝こども＋ふりがな ON、en・zh＝おとな | 開発計画 5章の推奨案。日本語の主な利用者は小学生、英語・中国語は訪日客などの大人 |
| 2 | 保存の単位 | 言語で分けず1つ（`maps.mode`・`maps.ruby`）。保存するのはボタンを押したときだけ | 「こども向けで読みたい」は読む人の好みで、言語を変えても同じはず。押していなければ言語ごとの既定値になる。接頭辞は `wrangler dev` の localhost など、同じオリジンのほかのアプリとぶつからないため |
| 3 | ボタンの形 | モードは「こども」「おとな」の2つのボタン（`role="group"`、押している方が `aria-pressed="true"`）、ふりがなは1つのトグル | モードは2つから選ぶものなので、今どちらかが見て分かる。1つのトグル（「おとな」を押す）だと、押していない状態の意味が分かりにくい。ふりがなは ON/OFF なので1つのトグルが自然 |
| 4 | 押した見た目 | `<html>` の属性のバリアント（`kids:` など）で付け、`aria-pressed` は `useSyncExternalStore` で後から合わせる | 見た目は最初の描画から正しい（ハイドレーションを待たない）。`aria-pressed:` で付けると、保存した値が既定値と違うとき、ハイドレーションまで逆の見た目になる |
| 5 | JavaScript がないときのボタン | `noscript:hidden`（`@media (scripting: none)`）で隠す | 押しても動かないボタンを見せない。ハイドレーションで出す方式はヘッダーの高さが変わる（CLS）。対応ブラウザ（5.3）はすべて `scripting` に対応している（Safari 17・Chrome 120・Firefox 113） |
| 6 | ボタンの文言 | モードに関係なく同じ文言（`ModeText` にしない） | 切り替えるボタンの名前が切り替えで変わると、どれを押したか分からなくなる |

## 分かったこと（後のタスクへ）

- T3-07（言語の切替）：`<html>` の属性は `suppressHydrationWarning` で初回だけ DOM を優先する。言語を `<Link>` のソフトナビゲーションで切り替えると、React が `<html>` の属性を新しい言語の既定値に書き戻し、保存した値が消える。言語の切替は全体の読み込み（`<a>`）にするか、移った後に保存した値を当て直す。→ T3-07 の定義に書き足す。
- T4-01（CSP）：`MODE_INIT_SCRIPT` のハッシュを集める。→ T4-01 の定義に、定数の場所を書き足す。

## 承認後に変えたこと

- `applySetting`：`root.dataset[attr] = value` → `root.setAttribute('data-' + attr, value)`（ESLint の `no-param-reassign`。結果は同じ）。
- `DisplayToggle`：`MutationObserver` だけで購読する → ボタンを押した直後に購読者へ直接知らせる `notify()` も足す（`MutationObserver` は非同期で、押した直後の `aria-pressed` が1拍遅れるため。外からの変更は `MutationObserver` で受ける）。
- E2E「再試行」のボタンの名前：`もう一度` → `/^もう\s*一度/`（ふりがなが ON のとき、読み `いちど` も名前に入る。「もう片方の文が入らない」ことは変わらず確かめる）。
- 追加の E2E：言語をまたいで設定が使われること、正しくない値は無視すること（計画の表に加えた）。
- ドキュメント：開発計画 5章 U1 も取り消し線にして D37 を書いた（開発概要書と同じ扱い）。
