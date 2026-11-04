---
name: coverage-audit
description: The closing check for work planned from a document. When the last story or Feature traced to a PRD, design doc or grill/wayfinder summary closes, a fresh read-only agent compares every requirement line of the document with the code (never the plans) and marks each Built, Partly or Missing with file evidence. No item closes while a line mapped to it is Partly or Missing; gaps become new stories or owner-approved out-of-scope lines. Usage: /coverage-audit <coverage file or source doc> [--ref <folder>] [--building <id,id>] [--now]
argument-hint: "tasks/coverage/weekly-review-design.md, or docs/weekly-review-design.md --now"
---

**Core Philosophy:** A document is done when its lines are in the code, not when its tickets are
closed. Every story can pass its own checks while the document as a whole loses requirements
between them; this is the one check that reads the document against the code at the end.

**Triggers:** "audit coverage", "is the design doc fully built", "check the doc against the code",
"closing check"

**Called by:** `/implement` (a run that completes a coverage table, before its PR), `/sync-tracker`
(when the last item a coverage table maps to closes), or a person at any time.

---

Parse **$ARGUMENTS**:

- `<coverage file or source doc>` — a coverage table (`tasks/coverage/<slug>.md`, written by
  `/plan-features`), or the source document itself, which resolves to the table whose `Source:` line
  names it.
- `--ref <folder>` — where the code to read is: a worktree, or `.`. Default: the home folder, which
  must be on the default branch with nothing uncommitted (the audit reads merged code); if it is not,
  stop and say so.
- `--building <id,id>` — the caller's own items: open, but their code is in `--ref`. `/implement`
  passes these.
- `--now` — audit even though other mapped items are still open; the result is marked **interim**
  and closes nothing.

The checker used below lives in the build skill: `<implement-skill-dir>` is
`.claude/skills/implement/` or `~/.claude/skills/implement/`.

## Step 1 — The coverage table

Read it and check it:

```bash
node "<implement-skill-dir>/bin/source-lines.js" coverage <coverage file>
```

Any output is a stop: an unmapped line has no owner, so nothing can be audited against it. No table
for the document → stop: "No coverage table for <doc>. Plan it with `/plan-features <doc>` first."

## Step 2 — Is it time?

For every item id (`#<id>`) in the **Mapped to** column, read its state with
`bash .claude/trackers/active/get-issue.sh <id>`. Items in `--building` count as done. Any other open
item → stop and name it, unless `--now`: "The audit runs when the last item closes; still open: #206
(story), #207 (story)."

## Step 3 — Read the code against the document

Spawn a **`coverage-auditor-agent`** (foreground, model: `opus`) with:

- **Source document:** the `Source:` path
- **Requirement lines:** every row whose Mapped to is not "Out of scope", as `[<id>] <requirement>`
- **Work folder:** `--ref`, or the home folder

Give it nothing else: not the coverage table's mapping, not plans, tickets, test strategies,
decisions logs or PRs. It must read the document and the code fresh; an agent handed the plans checks
the plans.

## Step 4 — Write it down

- Save its report as `tasks/coverage/<slug>.audit.md` (newest at the top, the date and the commit it
  read; an interim audit is labelled so).
- Fill each row's **Audit** cell in the coverage table with `Built`, `Partly` or `Missing`.
- Then:

  ```bash
  node "<implement-skill-dir>/bin/source-lines.js" audit <coverage file>
  ```

## Step 5 — Close, or turn the gaps into work

**`complete`** (and not `--now`): set the table's `Status:` line to `complete` and say so: "Every
line of <doc> is built." The document is finished; any item still held open for its coverage lines
may now be closed.

**Open lines** (`open [<id>]: Partly | Missing`, `unaudited`): show each one — the line, its mark, the
evidence and what is missing, and what it was mapped to. The table stays open, and so does every
item whose own rows are open (a Feature is not closed while a line mapped to it is Partly or Missing).
For each, the person chooses; this is never self-answered, in any mode, because it
decides what the document delivers:

- **(A) New work** (recommended): `/plan-features <coverage file> --gaps` proposes stories for the open
  lines, maps each line to its new story, and creates nothing until the person approves.
- **(B) Out of scope**: the owner gives the reason; the row becomes
  `Out of scope — <reason> (owner-approved <date>)`.

A line mapped to a caller's own `--building` item is the caller's to fix: report it back as a failed
criterion (`/implement` reopens and fixes it before its PR). When called from inside a run, list the
other open lines for its PR body instead of asking mid-run; they are asked the next time a person
runs this skill or `/sync-tracker`.

---

## Hard rules

- The auditor gets the document and the code, never the plans, tickets or PRs that built it
- Every in-scope line gets a mark with file evidence; Partly is never rounded up to Built
- No item is closed while a line mapped to it is Partly or Missing, and the table is `Status: complete` only from a full audit with every line Built or owner-approved out of scope — never from an interim one
- An open line becomes new stories (through `/plan-features`) or an owner-approved out-of-scope row — never a silent drop, never the run's own decision
- Read-only on code: this skill changes nothing but `tasks/coverage/`
