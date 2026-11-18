# Hooks と実行権限

- Codex の登録は `.codex/hooks.json`、変換・状態は `.codex/hooks/`。
  実際の対応イベントと制約は [hooks の説明](../hooks/README.md) を読む。
- Claude の `.claude/settings.json`・`allowedTools`・hooks のイベント・TodoWrite を
  Codex でそのまま有効にできると仮定しない。Claude 側の設定・状態へ書き込まない。
- hooks は Codex の `/hooks` で内容を確認して信頼する。信頼を無効にするオプションは使わない。
  承認ポリシー・sandbox・MCP の権限は実行環境と親セッションの設定に従う。
- 手順と進捗は利用可能な計画ツールと日本語の進捗報告で伝える。
  ユーザーへの判断依頼には推奨案と理由を付ける。
- hooks の診断を読んで原因を直す。hooks の成功だけで lint・テスト・ビルドの確認を代用しない。
