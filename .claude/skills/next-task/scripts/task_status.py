#!/usr/bin/env python3
"""開発計画のタスクの状態を、GitHub の PR と突き合わせて表示する。

- 計画の状態：docs/development-plan.md 第3章の表の「状態」
- 依存関係：docs/tasks/*.md の「**依存関係**：」の行
- PR：ブランチ名に `/<ID>-` を含むか、タイトルに `<ID>` を含む PR
  （本文は他のタスクに触れることが多いので見ない）

実際の状態は、マージ済みの PR があれば「完了」、オープン中の PR があれば「作業中」、
なければ計画の状態とする。

使い方：python3 -I task_status.py [--repo <リポジトリのルート>] [--json]
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import asdict, dataclass
from pathlib import Path

TASK_ID = r"T\d-\d{2}"
ROW_RE = re.compile(rf"^\|\s*({TASK_ID})\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*$")
HEADER_RE = re.compile(rf"^##\s+({TASK_ID})\b")
DEPS_RE = re.compile(r"^-\s*\*\*依存関係\*\*[：:]\s*(.*)$")
DONE = "完了"
MANUAL = "手作業"


@dataclass(frozen=True)
class Task:
    id: str
    kind: str
    title: str
    plan_state: str
    deps: tuple[str, ...] = ()
    deps_note: str = ""
    prs: tuple[str, ...] = ()
    state: str = ""
    blocked_by: tuple[str, ...] = ()
    ready: bool = False
    needs_plan_update: bool = False


def parse_plan(text: str) -> list[dict]:
    rows = []
    for line in text.splitlines():
        m = ROW_RE.match(line)
        if m:
            rows.append({"id": m[1], "kind": m[2], "title": m[3], "plan_state": m[4]})
    return rows


def parse_deps(task_files: list[Path]) -> dict[str, tuple[tuple[str, ...], str]]:
    """タスクID → (依存するタスクID, 依存関係の行の原文)。「なし」で始まる行は依存なしとする。"""
    deps: dict[str, tuple[tuple[str, ...], str]] = {}
    for path in task_files:
        current = None
        for line in path.read_text(encoding="utf-8").splitlines():
            h = HEADER_RE.match(line)
            if h:
                current = h[1]
                continue
            d = DEPS_RE.match(line)
            if d and current:
                raw = d[1].strip()
                ids = () if raw.startswith("なし") else tuple(re.findall(TASK_ID, raw))
                deps[current] = (ids, raw)
    return deps


def fetch_prs() -> list[dict]:
    out = subprocess.run(
        ["gh", "pr", "list", "--state", "all", "--limit", "500",
         "--json", "number,state,title,headRefName"],
        check=True, capture_output=True, text=True,
    ).stdout
    return json.loads(out)


def prs_for(task_id: str, prs: list[dict]) -> list[dict]:
    branch_re = re.compile(rf"(^|/){re.escape(task_id)}-")
    return [p for p in prs if branch_re.search(p["headRefName"]) or task_id in p["title"]]


def resolve(rows: list[dict], deps: dict, prs: list[dict]) -> list[Task]:
    with_state = []
    for r in rows:
        related = prs_for(r["id"], prs)
        states = {p["state"] for p in related}
        if "MERGED" in states:
            state = DONE
        elif "OPEN" in states:
            state = "作業中"
        else:
            state = r["plan_state"]
        dep_ids, raw = deps.get(r["id"], ((), ""))
        with_state.append({
            **r,
            "deps": dep_ids,
            "deps_note": raw,
            "prs": tuple(f"#{p['number']} {p['state']}" for p in sorted(related, key=lambda p: p["number"])),
            "state": state,
        })

    state_of = {t["id"]: t["state"] for t in with_state}
    tasks = []
    for t in with_state:
        blocked = tuple(d for d in t["deps"] if state_of.get(d) != DONE)
        tasks.append(Task(
            **t,
            blocked_by=blocked,
            ready=t["state"] == "未着手" and not blocked,
            needs_plan_update=t["state"] == DONE and t["plan_state"] != DONE,
        ))
    return tasks


def render(tasks: list[Task]) -> str:
    lines = ["ID\t種別\t計画の状態\t実際の状態\tPR\t未完了の依存"]
    for t in tasks:
        lines.append("\t".join([
            t.id, t.kind, t.plan_state, t.state,
            ", ".join(t.prs) or "-", ", ".join(t.blocked_by) or "-",
        ]))
    updates = [t for t in tasks if t.needs_plan_update]
    in_progress = [t for t in tasks if t.state == "作業中"]
    ready = [t for t in tasks if t.ready and t.kind != MANUAL]
    manual = [t for t in tasks if t.ready and t.kind == MANUAL]
    lines.append("")
    lines.append("計画を「完了」に直す：" + (", ".join(f"{t.id}（{'、'.join(t.prs)}）" for t in updates) or "なし"))
    lines.append("作業中：" + (", ".join(f"{t.id}（{'、'.join(t.prs) or 'PRなし'}）" for t in in_progress) or "なし"))
    lines.append("着手できる：" + (", ".join(f"{t.id} {t.title}" for t in ready) or "なし"))
    lines.append("着手できる手作業（PRなし）：" + (", ".join(f"{t.id} {t.title}" for t in manual) or "なし"))
    notes = [t for t in tasks if t.deps_note and t.deps_note.startswith("なし（")]
    for t in notes:
        lines.append(f"依存関係の補足 {t.id}：{t.deps_note}")
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", default=".")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    root = Path(args.repo)
    plan = root / "docs" / "development-plan.md"
    if not plan.exists():
        print(f"見つからない：{plan}", file=sys.stderr)
        return 1
    rows = parse_plan(plan.read_text(encoding="utf-8"))
    deps = parse_deps(sorted((root / "docs" / "tasks").glob("*.md")))
    tasks = resolve(rows, deps, fetch_prs())

    if args.json:
        print(json.dumps([asdict(t) for t in tasks], ensure_ascii=False, indent=2))
    else:
        print(render(tasks))
    return 0


if __name__ == "__main__":
    sys.exit(main())
