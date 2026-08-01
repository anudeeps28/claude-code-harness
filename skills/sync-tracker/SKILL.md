---
name: sync-tracker
description: "Reconcile merged PRs and completed work against open tracker items. Mode-aware: works in local, tracker, and both modes. Supports --dry-run and --import-backup [file]. Usage: /sync-tracker [--dry-run] [--import-backup [file]]"
argument-hint: "--dry-run | --import-backup [file]"
---

**Core Philosophy:** Tracker items that have been delivered (PR merged) should be closed, and work that was deferred should be *open* — reconciliation runs in both directions. This skill is the interactive judgment layer the sweep hook (`hooks/tracker-sync.js`) points at — the sweep handles explicit evidence mechanically; this skill handles ambiguous evidence with user confirmation, and harvests deferrals that were only ever written as prose (Step 6.5, per `rules/deferrals.md`).

**Triggers:** "sync tracker", "close completed issues", "update tracker", "reconcile PRs", "clean up tracker", "import backup", "what did we defer", "find deferred work"

---

You are the tracker synchronization agent. Your job is to find tracker items that have been delivered but are still open, and close them. You are mode-aware: behavior adapts to local, tracker, or both mode.

Parse `$ARGUMENTS`:
- `--dry-run` → report what would be closed, but don't actually close anything.
- `--import-backup [file]` → import mode (D23): convert unchecked items from a backup file into tracker tasks. Default source: `tasks/todo-manual-backup.md`. Also accepts `tasks/plan.md` as a source (D29).

---

## Step 1 — Detect mode

Read `.claude/.harness-manifest.json`:
- `tracker` field → the active tracker type (`github`, `todoist`, `ado`, `local`).
- `trackerMirror` field → whether mirror mode is active.
- Derive the mode:
  - `tracker === 'local'` → **local mode**
  - External tracker + `trackerMirror === true` → **both mode**
  - External tracker + no mirror → **tracker mode**

If no manifest or no tracker configured, fall back to `tasks/tracker-config.md` `**Type:**` field or adapter script detection in `.claude/trackers/active/`.

Note the mode for subsequent steps.

---

## Step 2 — Route by argument

If `--import-backup` was passed, jump to **Step 7 (Import backup)**.

Otherwise, continue to Step 3.

---

## Step 3 — Find delivered items

Gather evidence of completed work. **`todo.md` is NEVER an evidence source** — it is a generated dashboard (D9). Evidence comes from PRs and sprint tables only.

**Source A — Merged PRs:**
```bash
gh pr list --state merged --limit 50 --json number,title,body,mergedAt
```
Extract references based on mode:
- **Local mode:** look for anchored `Task: <N>` trailer lines in PR bodies (one per line, `^Task: \d+$`). Never match prose like "builds on task 42".
- **Tracker/both mode:** look for GitHub closing keywords (`Closes #123`, `Fixes #123`, `Resolves #123`) and ADO references (`Fixes AB#204`). Also check PR titles.

Skip gracefully if `gh` is not available or not authenticated.

**Source B — Sprint files (ambiguous — flag only):**
Glob `tasks/sprint*.md` and read the latest. Find rows in the Master Status Table where the Status column shows "Done" but no merged PR is referenced. These are **ambiguous** — flag them for manual review but do NOT auto-close (D20).

Collect all unique tracker IDs that appear to be delivered.

---

## Step 4 — Check tracker state

For each candidate ID, call the active tracker adapter to check current state:

```bash
bash .claude/trackers/active/get-issue.sh <ID>
```

Parse the output to determine if the item is already closed/completed. Filter down to only items that are **still open**.

---

## Step 5 — Report

Show a summary table:

| ID | Title | Evidence | Current State | Action |
|---|---|---|---|---|
| #123 | Fix login bug | PR #45 merged (Closes #123) | Open | Close |
| #456 | Add dark mode | Sprint table "Done" (no PR) | Open | ⚠ Ambiguous — needs confirmation |
| #789 | Refactor auth | PR #67 merged | Already closed | Skip |

If `--dry-run` was passed, report:

---
**Dry run complete.** [N] items have explicit delivery evidence and would be closed. [M] items have ambiguous evidence and need manual confirmation. Run `/sync-tracker` (without --dry-run) to close them.

---

…then skip Step 6 and continue to **Step 6.5** (which is also read-only under `--dry-run`).

---

## Step 6 — Close delivered items

**Explicit evidence items:** close without asking:
```bash
bash .claude/trackers/active/close-issue.sh <ID> "Delivered in PR #<N>"
```

**Ambiguous evidence items:** ask the user for confirmation on each one before closing.

Report each closure result.

**Both mode — regenerate mirror:** after closing items, regenerate `tasks/todo.md`:
```bash
bash .claude/trackers/lib/render-todo.sh tasks/issues
```

Output:

---
**Sync complete.** Closed [N] delivered items in [tracker type]. [M] items were already closed. [K] open items have no delivery evidence (still in progress).

---

Then continue to **Step 6.5** — closing delivered work is only half of reconciliation; the other half
is work that was deferred and never registered.

---

## Step 6.5 — Harvest orphaned deferrals

Per `rules/deferrals.md`, a deferral is only real if it is a tracker item — prose in a PR body or a
notes file never resurfaces on its own. This step finds deferrals recorded before that rule, or by a
run that skipped it.

**Scan these sinks** for deferral language (`Deferred`, `Follow-up`, `follow-ups`, `TODO later`,
`known gap`, `not required by`, `tracked as a follow-up`):

```bash
grep -rin "deferred\|follow-up\|known gap" tasks/notes.md tasks/lessons.md tasks/stories/*/decisions-log.md tasks/stories/*/evaluation.md 2>/dev/null
gh pr list --state merged --limit 50 --json number,body --jq '.[] | select(.body | test("(?i)deferred|follow-up")) | "PR #\(.number)"'
```

**Drop any line that already carries a tracker id** (`#123`, an ADO `AB#204`, or a Todoist task id) —
that one is registered and will surface on its own.

**Report the survivors** as a table — source, the line, and what it appears to cost:

| Source | Deferred item | Cost while undone | Ship test |
|---|---|---|---|
| notes.md ledger (PR #22) | Model→window map hardcoded | Recycles context early on the configured model | ⚠ needs answer |

**Apply the ship test to each survivor before offering it as a task** (`rules/deferrals.md`): with this
left undone, does the shipped change behave incorrectly for the project's **real configured inputs**?
A survivor that fails the test is not backlog — it is an **unshipped bug in already-merged code**.
Flag it as such, loudly and separately from the backlog list. A sweep is exactly where a mislabeled
blocker would otherwise get laundered into a low-priority task.

**Never register silently.** Ask the user which survivors to create, then for each approved one:

```bash
bash .claude/trackers/active/create-issue.sh "<title>" "<what's undone / cost / ship-test answer / source PR>" "deferred"
```

If `--dry-run` was passed, report the table and stop — create nothing.

---

## Step 7 — Import backup (`--import-backup`)

This flow serves the mode migration (D23) and mode switches (D25).

**7a.** Determine source file:
- If a file path was given after `--import-backup`, use that.
- Default: `tasks/todo-manual-backup.md`.
- Also accept `tasks/plan.md` (D29: retired solo plan).

Read the source file. If it doesn't exist, stop with a clear message.

**7b.** Parse the file for unchecked items. Look for markdown list items that are NOT checked:
- `- [ ] ...` or `- ...` (plain bullets) → candidate items
- `- [x] ...` or `- [X] ...` → skip (already done)

Extract a title for each candidate item.

**7c.** Cross-check each candidate against open items in the active backend:
```bash
bash .claude/trackers/active/list-issues.sh
```

Flag items that look like duplicates of existing open items.

**7d.** Present the full list to the user. For each candidate, show:
- The original text from the backup
- Whether it looks like a duplicate
- Ask: **Create this as a new task? (yes/skip)**

**7e.** For each approved item, create it:
```bash
bash .claude/trackers/active/create-issue.sh "<title>" "<body>" ""
```

**7f.** Summary:
---
**Import complete.** Created [N] tasks from [source file]. [M] items skipped. The source file has NOT been deleted — review it and delete manually when satisfied.

---

Never delete the source file — tell the user to do it when done.

---

## Error handling

- If `close-issue.sh` or `create-issue.sh` fails for an item, log the error and continue with the remaining items. Report failures at the end.
- If the tracker adapter is not installed, stop with a clear message: "No tracker adapter found. Run the installer to configure a tracker."
- If no delivered items are found, say so and exit cleanly.
- If `gh` is not available, skip PR evidence gathering and note it in the report.
