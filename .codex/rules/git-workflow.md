# Git と PR

- `main` へ直接 push しない。1機能＝1ブランチ＝1PR。ユーザーの既存変更を失わせない。
- コミットは `<type>: <日本語の説明>`。PRタイトルは `<type>: <英語の説明>`、本文は日本語。
  タスクのPRはブランチに `<種別>/<タスクID>-<slug>`、タイトル末尾に `(<タスクID>)` を付ける。
- コミット・push・PR操作は依頼された作業の範囲で行う。委譲先は明示された場合以外は行わない。
  Claude の署名や `Co-Authored-By: Claude ...` を Codex のコミットに転記しない。
- PR前は `git diff <base>...HEAD` と作業ツリーの差分で全変更を確認し、直近のコミットだけを見ない。
  新規ブランチの push は `-u` を付ける。複数行の本文はファイルを用意して `--body-file` で渡す。
- `--no-verify`、force pushなどの回避操作は禁止。失敗した検査を直してから進める。
- 画面変更には `pnpm screenshots` の after の表を載せる。画像の `screenshots` ブランチは消さない。
- 進捗は `docs/development-plan.md`。CHANGELOGはマイルストーン最後のPRと公開時にまとめる。
