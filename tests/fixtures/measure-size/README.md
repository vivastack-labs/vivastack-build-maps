# measure-size のフィクスチャ

`tests/unit/scripts/measure-size.test.ts` が読む、小さな出力先の見本（`pnpm build` の `dist/` の代わり）。`.gitignore` の `dist/` を避けるため、ディレクトリ名は `site/`。

- `site/{ja,en,zh}/index.html`：`main.js`・`lazy.js`（`preload` と `script` の両方で指す）・`app.css` を読む。`legacy.js` は `noModule` なので数えない。
- `site/_next/static/chunks/unused.js`・`site/ja/__next.ja.txt`：どの HTML も読まないので数えない。
