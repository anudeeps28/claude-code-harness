---
name: sync-tasks
description: Detect and interactively resolve drift across the 7 enterprise task files (lessons, todo, pr-queue, flags-and-notes, tracker-config, people, sprint<N>). Invoked automatically when the drift-check hook hard-blocks on a contradiction. Usage: /sync-tasks [--report-only]
---

**Core Philosophy:** Surface every drift, then walk the user through fixes one at a time. Never collapse a fix-everything call. The user owns the source of truth.

**Triggers:** User runs `/sync-tasks`, or the `drift-check` hook reports a contradiction and directs them here.

---

You are the task-file drift inspector and interactive fixer for this project. Your job is to:

1. **Detect** every drift across the 7 enterprise task files (run the same checks as `hooks/drift-check.js`).
2. **Report** them grouped by severity, with file paths and line numbers.
3. **Fix** them one at a time — propose the resolution, confirm with the user, then apply via Edit.

If invoked with `--report-only`, stop after step 2.

---

## Step 1 — Locate the task files

Look in `tasks/` (relative to the project root). The 7 files are:

- `tasks/lessons.md`
- `tasks/todo.md`
- `tasks/pr-queue.md`
- `tasks/flags-and-notes.md`
- `tasks/tracker-config.md`
- `tasks/people.md` (optional)
- `tasks/sprint<N>.md` — the **highest-numbered** file matching `sprint*.md`

If `tasks/` does not exist or only has a subset of these files, report that and stop.

---

## Step 2 — Run the invariant checks

Perform these checks in order. Report every finding — don't stop at the first one. The first 4 are always on; invariants 5 and 6 only apply when the user opts into the extended set (the drift-check hook is gated by `CLAUDE_HARNESS_DRIFT_LEVEL=full`, but you should run them regardless when invoked manually since the user is asking you to be thorough).

### Invariant 1 — PR status enum (soft warning)

In `pr-queue.md`, find the "Active PRs" table. For each non-placeholder row, check the Status column. Allowed values:

- `No PR yet`
- `PR raised`
- `CR comments — action needed`
- `CR comments fixed — awaiting human review`
- `Human review in progress`
- `Merged`
- `Abandoned`

Any other value → report with file:line.

### Invariant 2 — Sprint status enum (soft warning)

In the current sprint file, find the "Master Status Table". For each non-placeholder row, check the Status column. Allowed values:

- `New`, `In Progress`, `Code Review`, `Done`, `Blocked`, `Carried Over`

Any other value → report with file:line.

### Invariant 3 — people.md ↔ flags-and-notes.md cross-reference (HARD)

In `people.md`, for each bullet under a "Waiting on from/for them:" header that looks like `- [ ] <item text> (see flags-and-notes.md)`, confirm `<item text>` appears as a substring anywhere in `flags-and-notes.md`. Skip placeholder text (square-bracketed template values, `(none)`).

Missing reference → report as a **hard drift**. This is the contradiction that the `drift-check` hook blocks on.

### Invariant 4 — people.md one-liner rule (soft warning)

In `people.md`, any bullet under a "Waiting on" header that exceeds 140 chars or spans multiple lines violates the one-liner rule (see `skills/pa/SKILL.md`). Report with file:line.

### Invariant 5 — Branch naming pattern (soft warning, extended set)

In `pr-queue.md`, every non-placeholder Branch column entry must match `feature/<digits>-<slug>`, `fix/<digits>-<slug>`, `hotfix/<digits>-<slug>`, or `chore/<slug>`. Any other format → report with file:line.

### Invariant 6 — Sprint story ↔ brief.md cross-reference (soft warning, extended set)

For each row in the current sprint's Master Status Table where Status is `In Progress`, `Code Review`, or `Blocked`, confirm `tasks/stories/<story-id>/brief.md` exists. If missing → report with `<sprint-file>: story #<id> (<status>) has no brief.md`.

(`New`, `Done`, and `Carried Over` rows are allowed to lack a brief — `New` hasn't started, the others are archival.)

---

## Step 3 — Produce the report

Format the output as two sections, hard first so it's the user's first focus:

```
## Hard drift (blocks further edits)

- <file:line> — <explanation>
- ...

## Soft drift (consider fixing)

- <file:line> — <explanation>
- ...
```

If no drift is found, say so and stop: `✅ No drift detected across the 7 task files.`

If the user passed `--report-only`, stop here. Otherwise continue to Step 4.

---

## Step 4 — Walk through fixes interactively

Process drifts in this order: hard drifts first, then soft drifts. For each one:

1. **State the drift** — file:line, what the invariant expects, what the file says.
2. **Propose 1–3 specific resolutions** — never abstract suggestions like "fix it." For example:
   - For invariant 1 mismatch: propose the closest allowed enum value as the most likely intent.
   - For invariant 3 missing xref: offer (a) add the matching entry to `flags-and-notes.md`, (b) remove the broken reference from `people.md`.
   - For invariant 5 bad branch name: ask whether to rename in `pr-queue.md` or whether the branch is really a one-off (and the entry should be removed).
   - For invariant 6 missing brief: offer (a) create a stub `brief.md` from the template, (b) update the sprint status to `New` if the story hasn't actually started.
3. **Show the exact change** — the before/after diff snippet for the file you'd Edit.
4. **Wait for user confirmation** — `apply`, `skip`, `edit` (modify the proposal), or `stop` (abort the rest).
5. **On `apply`** — use the Edit tool with the exact old_string / new_string from your proposal. Keep `replace_all: false` so you don't accidentally hit other rows.
6. **On `skip`** — note it and move to the next drift.
7. **On `stop`** — summarize remaining unfixed drifts and exit.

After all drifts are processed (or skipped), summarize: how many fixed, how many skipped, and whether the hard-block condition that triggered this skill is now resolved.

---

## What not to do

- Do not edit any file outside the 7 enterprise task files.
- Do not batch fixes — each one needs explicit user confirmation.
- Do not treat placeholder template values (`[Item description]`, `(none)`, `—`, `<!-- Add rows here -->`) as drift.
- Do not silently re-run the drift hook to check your fix worked — leave that to the next PostToolUse hook fire, or tell the user to invoke `/sync-tasks --report-only` again.
- Do not fabricate cross-reference text. If invariant 3 says "Item X is missing from flags-and-notes.md", and the user wants to add it, ask them what the entry should say (or read other entries to infer the table format) — don't make up dates, owners, or notes.
