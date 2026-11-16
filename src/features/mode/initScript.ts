import { MODE_STORAGE_KEY, RUBY_STORAGE_KEY } from './settings.ts';

/**
 * `<head>` に置く初期化スクリプト（D23。500バイト未満）。最初の描画の前に、次の2つを `<html>` の属性に書く。
 * - localStorage に保存した値を `data-mode`・`data-ruby` に反映する（ちらつかない）。正しくない値は無視して、ビルド時の既定値のままにする。localStorage を読めなくても例外を出さない（4.11.5）。
 * - URL のハッシュが `#pref-01`〜`#pref-47`（`prefFromHash` と同じ形）なら `data-hash-pref` に県コードを書き、そうでなければ消す。`hashchange` でも同じことをする。
 *   ブラウザは最初のレイアウトの後で `:target` を決めるので、`hidden` のカードが後から表示されて下のさくいんが押される（CLS）。
 *   `app/globals.css` が `:target` の代わりにこの属性で、最初のレイアウトからカードを表示する（T4-04、6.6 (2)）。localStorage の例外とは別に書く。
 * グローバルの変数を増やさないよう、関数で包む。中身は固定の文字列（利用者の入力が入らない）。T4-01：`scripts/postbuild.ts` がこの文字列との完全一致で許可し、SHA-256 を CSP に書く（`scripts/` から Node.js で読むので、相対の import に `.ts` を付ける）。
 */
export const MODE_INIT_SCRIPT = `(function(){var d=document.documentElement;function h(){var m=/^#pref-(0[1-9]|[1-3]\\d|4[0-7])$/.exec(location.hash);if(m)d.dataset.hashPref=m[1];else delete d.dataset.hashPref}h();addEventListener("hashchange",h);try{var s=localStorage,m=s.getItem(${JSON.stringify(MODE_STORAGE_KEY)}),r=s.getItem(${JSON.stringify(RUBY_STORAGE_KEY)});if(m=="kids"||m=="adult")d.dataset.mode=m;if(r=="on"||r=="off")d.dataset.ruby=r}catch(e){}})()`;
