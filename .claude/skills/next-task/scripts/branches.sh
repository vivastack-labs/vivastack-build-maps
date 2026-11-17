#!/usr/bin/env bash
# main・develop 以外のローカルブランチを、紐づく PR の状態で分類する。
# 出力（タブ区切り）：branch  pr  state  local_only  action  reason
#   state      : MERGED / CLOSED / OPEN / NONE（PR なし）
#   local_only : どのリモートにもないコミットの数
#   action     : delete（確認なしで削除してよい） / ask（ユーザーに確認する）
# ブランチは削除しない。削除は呼び出し側が action を見て行う。
set -euo pipefail

MAIN_BRANCH="${MAIN_BRANCH:-main}"
DEVELOP_BRANCH="${DEVELOP_BRANCH:-develop}"

git fetch --prune --quiet

printf 'branch\tpr\tstate\tlocal_only\taction\treason\n'

git for-each-ref --format='%(refname:short)' refs/heads/ | while read -r branch; do
  [ "$branch" = "$MAIN_BRANCH" ] && continue
  [ "$branch" = "$DEVELOP_BRANCH" ] && continue

  head_oid=$(git rev-parse "$branch")
  local_only=$(git rev-list --count "$branch" --not --remotes)

  # 同じブランチ名の PR が複数あるときは、いちばん新しいものを使う
  pr_json=$(gh pr list --head "$branch" --state all --limit 20 \
    --json number,state,headRefOid --jq 'sort_by(.number) | last // empty')

  if [ -z "$pr_json" ]; then
    printf '%s\t-\tNONE\t%s\task\tPRがない\n' "$branch" "$local_only"
    continue
  fi

  number=$(jq -r '.number' <<<"$pr_json")
  state=$(jq -r '.state' <<<"$pr_json")
  pr_oid=$(jq -r '.headRefOid' <<<"$pr_json")

  case "$state" in
    MERGED | CLOSED)
      # PR の後にローカルだけで積んだコミットがあれば、消すと戻せないので確認する
      if [ "$head_oid" = "$pr_oid" ] || git merge-base --is-ancestor "$branch" "$pr_oid" 2>/dev/null; then
        printf '%s\t#%s\t%s\t%s\tdelete\tPRは%s\n' "$branch" "$number" "$state" "$local_only" "$state"
      else
        printf '%s\t#%s\t%s\t%s\task\tPRの後にコミットがある\n' "$branch" "$number" "$state" "$local_only"
      fi
      ;;
    OPEN)
      printf '%s\t#%s\tOPEN\t%s\task\tPRがオープン中\n' "$branch" "$number" "$local_only"
      ;;
    *)
      printf '%s\t#%s\t%s\t%s\task\tPRの状態が不明\n' "$branch" "$number" "$state" "$local_only"
      ;;
  esac
done
