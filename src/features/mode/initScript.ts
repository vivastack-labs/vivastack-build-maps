import { MODE_STORAGE_KEY, RUBY_STORAGE_KEY } from './settings.ts';

/**
 * `<head>` に置く初期化スクリプト（D23。500バイト未満）。
 * localStorage に保存した値を、最初の描画の前に `<html data-mode data-ruby>` に反映する（ちらつかない）。
 * 正しくない値は無視して、ビルド時の既定値のままにする。localStorage を読めなくても例外を出さない（4.11.5）。
 * 中身は固定の文字列（利用者の入力が入らない）。T4-01：`scripts/postbuild.ts` がこの文字列との完全一致で許可し、SHA-256 を CSP に書く（`scripts/` から Node.js で読むので、相対の import に `.ts` を付ける）。
 */
export const MODE_INIT_SCRIPT = `try{var s=localStorage,d=document.documentElement,m=s.getItem(${JSON.stringify(MODE_STORAGE_KEY)}),r=s.getItem(${JSON.stringify(RUBY_STORAGE_KEY)});if(m=="kids"||m=="adult")d.dataset.mode=m;if(r=="on"||r=="off")d.dataset.ruby=r}catch(e){}`;
