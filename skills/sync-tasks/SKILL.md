---
name: sync-tasks
description: Detect and interactively resolve drift across the 7 enterprise task files and project artifacts (PRD, ARCHITECTURE.md, ADRs, work items). Invoked automatically when the drift-check hook hard-blocks on a contradiction. Usage: /sync-tasks [--report-only]
---

**Core Philosophy:** Surface every drift, then walk the user through fixes one at a time. Never collapse a fix-everything call. The user owns the source of truth.

**Triggers:** User runs `/sync-tasks`, or the `drift-check` hook reports a contradiction and directs them here.

---

You are the drift inspector and interactive fixer for this project. Your job is to:

1. **Detect** every drift across the 7 enterprise task files AND project artifacts (run the same checks as `hooks/drift-check.js`).
2. **Report** them grouped by severity, with file paths and line numbers.
3. **Fix** them one at a time — propose the resolution, confirm with the user, then apply via Edit.

If invoked with `--report-only`, stop after step 2.

---

## Step 1 — Locate the files

### Task files

Look in `tasks/` (relative to the project root). The 7 files are:

- `tasks/lessons.md`
- `tasks/todo.md`
- `tasks/pr-queue.md`
- `tasks/flags-and-notes.md`
- `tasks/tracker-config.md`
- `tasks/people.md` (optional)
- `tasks/sprint<N>.md` — the **highest-numbered** file matching `sprint*.md`

### Artifact files

Also look for (all optional — skip checks for files that don't exist):

- `PRD.md` (repo root)
- `docs/ARCHITECTURE.md` or `ARCHITECTURE.md`
- `docs/adr/*.md` — only files starting with `0000`-style numbers

If `tasks/` does not exist or only has a subset of these files, report that and continue to artifact checks (if artifact files exist).

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

### Invariant 7 — NFR-not-in-architecture (soft warning, artifact set)

Extract NFR keywords from the PRD's "Non-functional Requirements" section. Check that each keyword appears somewhere in `ARCHITECTURE.md`. If a keyword is in the PRD NFR section but absent from the architecture doc → soft warning.

Keywords checked: latency, availability, throughput, scalability, performance, rto, rpo, uptime, response time, concurrent users, requests per second, encryption, authentication, authorization.

Skip if either `PRD.md` or `ARCHITECTURE.md` does not exist.

### Invariant 8 — Architecture component not in work items (soft warning, artifact set)

Extract component/service names from Mermaid diagrams in `ARCHITECTURE.md`. Check that each name appears somewhere in `tasks/todo.md`. If a component is in the architecture diagram but not referenced in any work item → soft warning.

Skip names shorter than 3 characters (too generic). Skip if either file does not exist.

### Invariant 9 — Work item references non-existent PRD section (soft warning, artifact set)

Scan `tasks/todo.md` for PRD section references (patterns like "PRD Section 3.2", "Section 4.1", "§5.3"). For each reference, verify the numbered section exists as a heading in `PRD.md`. If the section doesn't exist → soft warning.

Skip if either file does not exist.

### Invariant 10 — Acceptance criteria without tests (soft warning, artifact set)

If `tasks/todo.md` contains `<acceptance>` blocks but no test directory exists (`tests/`, `test/`, `__tests__/`, `spec/`), warn that acceptance criteria exist but no test files were found.

### Invariant 11 — ADR contradicts architecture (HARD, artifact set)

For each accepted ADR in `docs/adr/`, extract the technology chosen and the technology rejected from the "Decision" section. Check the architecture doc's platform/selection/rationale section. If the **rejected** technology appears in the architecture doc's rationale section but the **chosen** technology does not → hard drift (contradiction). This indicates the architecture was written or updated without honoring a prior decision record.

Skip ADRs with status other than "accepted". Skip if `ARCHITECTURE.md` or `docs/adr/` does not exist.

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

If no drift is found, say so and stop: `No drift detected across task files and artifacts.`

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
   - For invariant 7 (NFR gap): offer (a) add a section to ARCHITECTURE.md addressing the NFR, (b) note it as intentionally out of scope with a comment in the architecture doc.
   - For invariant 8 (component gap): offer (a) add a work item to todo.md for the component, (b) remove the component from the architecture diagram if it's no longer needed.
   - For invariant 9 (section mismatch): offer (a) update the section reference in todo.md to the correct section, (b) add the missing section to PRD.md.
   - For invariant 11 (ADR contradiction): offer (a) update ARCHITECTURE.md to use the ADR's chosen technology, (b) supersede the ADR with a new decision record if the architecture change was intentional.
3. **Show the exact change** — the before/after diff snippet for the file you'd Edit.
4. **Wait for user confirmation** — `apply`, `skip`, `edit` (modify the proposal), or `stop` (abort the rest).
5. **On `apply`** — use the Edit tool with the exact old_string / new_string from your proposal. Keep `replace_all: false` so you don't accidentally hit other rows.
6. **On `skip`** — note it and move to the next drift.
7. **On `stop`** — summarize remaining unfixed drifts and exit.

After all drifts are processed (or skipped), summarize: how many fixed, how many skipped, and whether the hard-block condition that triggered this skill is now resolved.

---

## What not to do

- Do not edit any file outside the 7 enterprise task files and the artifact files (PRD.md, ARCHITECTURE.md, docs/adr/*.md).
- Do not batch fixes — each one needs explicit user confirmation.
- Do not treat placeholder template values (`[Item description]`, `(none)`, `—`, `<!-- Add rows here -->`) as drift.
- Do not silently re-run the drift hook to check your fix worked — leave that to the next PostToolUse hook fire, or tell the user to invoke `/sync-tasks --report-only` again.
- Do not fabricate cross-reference text. If invariant 3 says "Item X is missing from flags-and-notes.md", and the user wants to add it, ask them what the entry should say (or read other entries to infer the table format) — don't make up dates, owners, or notes.
