---
name: best-practice-sync
description: >-
  Check what's changed in the claude-code-best-practice reference repo since
  the last tracked revision and create simple incorporation proposals.
  TRIGGER when: user asks about syncing best practices, checking for updates
  to claude-code-best-practice, reviewing latest patterns, or "what's new
  in best practices". Do NOT trigger for general code review or unrelated tasks.
---

# Best Practice Sync

Check what's new in the `claude-code-best-practice` reference repo and propose relevant updates for this project.

## Steps

### 1. Read the pinned revision from CLAUDE.md

Look for this pattern in `CLAUDE.md`:

```
- claude-code-best-practices: `../references/claude-code-best-practice` @ `<hash>` (<date>)
```

Extract `<hash>` as `LAST_REV`. If no `@` annotation exists, treat `LAST_REV` as empty (first sync).

### 2. Update the reference repo and get the latest revision

```bash
cd ../references/claude-code-best-practice
git pull --ff-only
NEW_REV=$(git rev-parse HEAD)
```

If `LAST_REV` equals `NEW_REV`, report "Already up to date" and stop.

### 3. Analyze the changelog

Get the commits between the two revisions:

```bash
# If LAST_REV is empty (first sync), show all commits; otherwise show range
if [ -z "${LAST_REV}" ]; then
  git log --oneline ${NEW_REV}
else
  git log --oneline ${LAST_REV}..${NEW_REV}
fi
```

If `LAST_REV` is empty (first sync), read **all** category changelogs in full.

Then read the category changelogs that were updated. Most categories keep a flat `changelog/<category>/changelog.md`, but `best-practice` is nested one level deeper by topic:

- `changelog/agent-collections/changelog.md`
- `changelog/best-practice/<topic>/changelog.md` — topics: `claude-commands`, `claude-settings`, `claude-skills`, `claude-subagents`, `concepts`
- `changelog/development-workflows/changelog.md`
- `changelog/skill-collections/changelog.md`
- `changelog/cross-model-workflows/changelog.md`

For each category, look at entries dated after `LAST_REV`'s commit date. Focus on `COMPLETE` status items — `INVALID` and `ON HOLD` items need no action.
Check `changelog/` if category was added or removed.

### 4. Create incorporation proposals

Based on the changelog analysis, write a short proposal list. Keep it simple — one line per item. Format:

```
## Incorporation Proposals (claude-code-best-practice → this repo)

Reference updated: <LAST_REV> → <NEW_REV> (<date range>)

### Candidates
- [ ] <category>: <what to adopt> — <why it's relevant to this project>
- [ ] ...

### Skip
- <item>: <one-line reason why it doesn't apply>
```

Relevance filter for this project (`viva-cc-practice`):
- **Adopt** if: relates to hooks, skills, commands, agents, settings, or session workflows
- **Skip** if: relates to presentation slides, weather demo, or project-specific one-offs

### 5. Update CLAUDE.md

After creating the proposals, update the reference line in `CLAUDE.md`:

```
- claude-code-best-practices: `../references/claude-code-best-practice` @ `<NEW_REV>` (<date>)
```

Present the proposals to the user and ask which ones to implement.
