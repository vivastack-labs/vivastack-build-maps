# Changelog

このファイルに、このプロジェクトの主な変更を書く。
書き方は [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) に、版の付け方は [Semantic Versioning](https://semver.org/spec/v2.0.0.html) に従う。
PR ごとには書かず、マイルストーンが終わったとき（そのマイルストーンの最後のタスクの PR）と、公開のときに、`[Unreleased]` にまとめて書き足す。

## [Unreleased]

正式な公開（T6-02）の前なので、版の番号はまだ付けない。ここには、`main` に merge した内容を機能のまとまりで書く。

### Added

- 地図：国土数値情報 N03 2026年版から作った TopoJSON で、47都道府県の日本地図を SVG で描く（沖縄は別枠。小笠原村など地図の枠の外に出る島と、1km² より小さな島は県の形から除く。小さな島は、県を最大化したときに市区町村の形で描く）。ホバー・固定・最大化、拡大・縮小・移動、最大化した県の市区町村の表示、ツールチップ、県名さくいん、キーボード操作。
- 県のカード：名物・名所、東京からの距離、出典の表示。768px 未満の狭い画面では、下から出るパネルに表示する。カードの内容は県ごとの JSON を読み込む。
- 多言語：日本語・英語・中国語（ja / en / zh）の3つの URL。言語を切り替えても、固定している県を引き継ぐ。
- モードとふりがな：こども／おとなのモードと、ふりがなの ON/OFF。
- コンテンツの基盤：47県の基本情報の YAML、スキーマと検証（`pnpm content:validate`）、ふりがなの記法（`{漢字|よみ}`）。本番には `reviewed` の項目だけを出し、プレビューにはすべての項目を「下書き」の印つきで出す。
- コンテンツの制作の道具：執筆ルールとレビュー基準（`content/guidelines/`）、ふりがなの自動付与（`pnpm content:furigana`）、1県分の下書きから検証までのスキルとエージェント、出典のリンク切れチェック（`pnpm content:links`）。
- PWA：manifest と Service Worker。一度開けば、電波がなくても地図と県名が使える。
- 説明のページ：「このサイトについて」とプライバシーポリシー（3言語）。
- 品質の検査：アクセシビリティ（axe とコントラストの単体テスト）、最初の読み込みのサイズの上限（`pnpm size`）、Lighthouse CI（`pnpm lhci`）、PC・スマホ・タブレットの E2E（Playwright の9プロジェクト）。
- 開発の基盤：Next.js（静的出力）・TypeScript・Vitest・Testing Library・Playwright の実行環境、GitHub Actions の CI（PR ごとの検査）、GitHub の設定を反映するスクリプト（`pnpm github:setup`）。
- デプロイ：PR ごとのプレビュー（オーナーが承認すると、`https://pr-<番号>-maps.vivastack-dev.workers.dev/` に出る）と、`main` への merge による本番（`https://maps.vivastack-dev.workers.dev/`）へのデプロイ。配信は Cloudflare Workers（Static Assets）で、workers.dev の専用のドメインに `/maps` のようなプレフィックスなしで置く。
- 文書：開発概要書、開発計画とタスクの定義、機能ごとの実装メモ（`docs/architecture/`）、`README.md`。

### Security

- CSP：インラインのスクリプトはハッシュで許し、`style-src` は `'self'` だけにする。`frame-ancestors` はヘッダーで指定する。
- GitHub：`main` をルールセットで守り（CI の通過・承認1件）、Secret scanning・push protection を有効にした。シークレットは gitleaks で検査する。
- デプロイ：Cloudflare の API Token は最小の権限にして、Environment の Secret に置き、デプロイの job だけに渡す。PR のコードが動く job には渡さない。
