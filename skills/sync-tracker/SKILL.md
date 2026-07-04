---
name: sync-tracker
description: Reconcile merged PRs and completed work against open tracker items. Closes issues/tasks in GitHub, Todoist, or ADO that have been delivered. Usage: /sync-tracker [--dry-run]
argument-hint: --dry-run
---

**Core Philosophy:** Tracker items that have been delivered (PR merged) should be closed automatically. This skill bridges the gap between local completion state and external tracker state.

**Triggers:** "sync tracker", "close completed issues", "update tracker", "reconcile PRs", "clean up tracker"

---

You are the tracker synchronization agent. Your job is to find tracker items that have been delivered but are still open, and close them.

Parse `$ARGUMENTS`:
- `--dry-run` → report what would be closed, but don't actually close anything.

---

## Step 1 — Detect active tracker

Read `tasks/tracker-config.md` to determine the active tracker type (GitHub, Todoist, or ADO). If the file doesn't exist, check which adapter scripts are installed in `.claude/trackers/active/`.

Note the tracker type for Step 3.

---

## Step 2 — Find delivered items

Gather evidence of completed work from multiple sources. Run these in parallel:

**Source A — Merged PRs:**
```bash
gh pr list --state merged --limit 50 --json number,title,body,mergedAt
```
Extract issue/task references from PR titles and bodies. Look for patterns like `#123`, `Fixes #123`, `Closes #123`, or Todoist task IDs.

**Source B — Local todo.md:**
Read `tasks/todo.md`. Find all items marked ✅ that reference a tracker ID (issue number, task ID, or work item ID).

**Source C — Sprint files:**
Glob `tasks/sprint*.md` and read the latest. Find rows in the Master Status Table where the PR column shows a merged PR URL or "Merged" status.

Collect all unique tracker IDs that appear to be delivered.

---

## Step 3 — Check tracker state

For each candidate ID, call the active tracker adapter to check current state:

```bash
bash .claude/trackers/active/get-issue.sh <ID>
```

Parse the output to determine if the item is already closed/completed. Filter down to only items that are **still open**.

---

## Step 4 — Report

Show a summary table:

| ID | Title | Evidence | Current State | Action |
|---|---|---|---|---|
| #123 | Fix login bug | PR #45 merged | Open | Close |
| #456 | Add dark mode | todo.md ✅ | Already closed | Skip |

If `--dry-run` was passed, stop here with:

---
**Dry run complete.** [N] tracker items would be closed. Run `/sync-tracker` (without --dry-run) to close them.

---

---

## Step 5 — Close delivered items

For each item that is still open and has delivery evidence:

```bash
bash .claude/trackers/active/close-issue.sh <ID>
```

Report each closure result.

---

## Step 6 — Summary

Output:

---
**Sync complete.** Closed [N] delivered items in [tracker type]. [M] items were already closed. [K] open items have no delivery evidence (still in progress).

---

## Error handling

- If `close-issue.sh` fails for an item, log the error and continue with the remaining items. Report failures at the end.
- If the tracker adapter is not installed, stop with a clear message: "No tracker adapter found. Run the installer to configure a tracker."
- If no delivered items are found, say so and exit cleanly.
