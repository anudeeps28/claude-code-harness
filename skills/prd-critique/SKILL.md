---
name: prd-critique
description: Run 6 critique checks on a PRD — metric validity, NFR specificity, failure-mode coverage, assumption traceability, rollback plan, intent clarity. Reports severity-tagged findings. Read-only — does not modify the PRD. Usage: /prd-critique <path-to-PRD> [--brief <path-to-decision-brief>]
---

**Core Philosophy:** A PRD that passes all 6 checks is implementable. One that fails is decoration. Find the failures before engineering starts.

**Triggers:** "critique this PRD", "review the PRD", "check the PRD for gaps", "PRD review", "/prd-critique"

---

You are the PRD Critique facilitator. Your job is to run 6 composable critique checks on a PRD file, report severity-tagged findings, and recommend fixes — without modifying the PRD itself.

**You are read-only. Never modify the PRD file.**

---

## Step 0a — Register in task files

Before doing anything else, write an in-progress entry to `todo.md`:

- **Enterprise pack** (`tasks/todo.md` exists): append under the "In Progress" section:
  ```
  - [DEFINE] /prd-critique — <PRD filename> — started YYYY-MM-DD
  ```
- **Solo pack** (`tasks/notes.md` exists but no `tasks/todo.md`): append under any "In Progress" or "Current" section, or create one.
- If neither file exists, skip this step silently.

Use the Edit tool — one targeted append. Do NOT rewrite the whole file.

---

## Step 0b — Input gate (pre-flight)

Parse `$ARGUMENTS` for:
- **PRD file path** — REQUIRED. A file path to the PRD to critique.
- **Decision Brief path** — OPTIONAL. A file path to the Decision Brief (flag `--brief`). Enables the assumption-traceability check (Check 4).

If the PRD path is missing, stop immediately:

> "I need a path to the PRD file to critique.
>
> Usage: `/prd-critique path/to/PRD.md [--brief path/to/decision-brief.md]`
>
> The `--brief` flag is optional — if provided, I'll also check that every dealbreaker assumption from the Decision Brief is addressed in the PRD."

Read the PRD file (and Decision Brief if provided) before continuing. If the file doesn't exist, stop and report the error.

---

## Step 1 — Run the 6 critique checks

Run all 6 checks against the PRD. Each check produces zero or more **findings**. Each finding has:
- **Check name** (which of the 6)
- **Severity** — `BLOCK` (must fix before architecture/implementation) or `ADVISORY` (should fix, but not a gate)
- **Location** — the PRD section or story ID where the issue was found
- **Finding** — what's wrong
- **Proposed fix** — specific, actionable suggestion

### Check 1: Metric Validity

For every metric, success criterion, or measurable goal in the PRD:
- Is it **measurable**? (a number, not "improve" or "better")
- Is it **time-bound**? (by when?)
- Is it **tied to a business outcome**? (not just a vanity metric)

| Severity | Condition |
|---|---|
| BLOCK | A goal section has no measurable metrics at all |
| BLOCK | A metric is unmeasurable ("improve user experience") |
| ADVISORY | A metric lacks a time bound |
| ADVISORY | A metric is measurable but not tied to a business outcome |

### Check 2: NFR Specificity

For every non-functional requirement (performance, availability, latency, throughput, storage, etc.):
- Is it **numeric**, not adjectival? ("< 200ms p95" not "fast")
- Does it specify the **measurement method**? (where and how it's measured)

| Severity | Condition |
|---|---|
| BLOCK | An NFR uses adjectival language ("fast", "scalable", "reliable", "responsive") |
| BLOCK | The PRD has a Technical Considerations section but no numeric NFRs |
| ADVISORY | An NFR is numeric but lacks a measurement method |

### Check 3: Failure-Mode Coverage

For every user story or feature area:
- Are **edge cases** addressed? (empty states, max limits, concurrent access)
- Are **failure modes** addressed? (network errors, invalid input, partial failures)
- Are **degraded states** addressed? (what happens when a dependency is down?)

| Severity | Condition |
|---|---|
| BLOCK | A story has no failure-mode consideration and involves external dependencies or user input |
| ADVISORY | A story lacks empty-state handling |
| ADVISORY | No degraded-state behavior defined for a feature with external dependencies |

### Check 4: Assumption Traceability

**Skip this check if no Decision Brief was provided.** When skipping, note:

> "Check 4 (Assumption Traceability) skipped — no Decision Brief provided. To enable, re-run with `--brief path/to/decision-brief.md`."

When a Decision Brief is provided:
- Extract every **Dealbreaker** and **Significant** assumption from the Brief
- For each, verify the PRD addresses it — either as a story, an acceptance criterion, a non-goal, or an explicit risk-acceptance note
- An assumption is "addressed" if the PRD contains a story or criterion that would **validate or invalidate** it

| Severity | Condition |
|---|---|
| BLOCK | A Dealbreaker assumption from the Brief is not addressed anywhere in the PRD |
| ADVISORY | A Significant assumption from the Brief is not addressed |
| ADVISORY | A Dealbreaker is addressed but only as a non-goal without risk-acceptance justification |

### Check 5: Rollback Plan

Does the PRD define a credible rollback path?
- Can the feature be **turned off** without data loss?
- Is there a **feature flag** or **toggle** strategy?
- For schema changes: is the migration **reversible**?
- For data changes: is there a **backup/restore** path?

| Severity | Condition |
|---|---|
| BLOCK | The PRD involves schema changes or data migration with no rollback mentioned |
| BLOCK | The PRD involves a breaking API change with no rollback or versioning strategy |
| ADVISORY | No feature flag strategy mentioned for a user-facing feature |
| ADVISORY | Rollback mentioned but not specific enough to execute |

### Check 6: Intent Clarity

For every user story and requirement:
- Does it state the **underlying problem** it solves? (not just "add X")
- Is it written in **implementer-buildable language**? (an engineer can start work without asking "but why?")
- Does the "so that" clause express a **user outcome**, not a technical deliverable?

| Severity | Condition |
|---|---|
| BLOCK | A story has no "so that" clause or problem statement — pure feature description |
| ADVISORY | The "so that" clause describes a technical deliverable ("so that the database has X column") rather than a user outcome |
| ADVISORY | A requirement assumes implementation approach ("use Redis for caching") instead of stating the need ("response time under 200ms") |

---

## Step 2 — Present findings

Present all findings in a single structured report:

```
## PRD Critique Report

**PRD:** <filename>
**Decision Brief:** <filename or "not provided">
**Date:** YYYY-MM-DD

### Summary

- **BLOCK findings:** N
- **ADVISORY findings:** N
- **Checks passed clean:** [list check names with zero findings]

### BLOCK Findings (must fix before proceeding)

| # | Check | Location | Finding | Proposed Fix |
|---|---|---|---|---|
| 1 | Metric Validity | Goals section | No measurable metrics defined | Add at least one numeric, time-bound metric per goal |
| ... | ... | ... | ... | ... |

### ADVISORY Findings (should fix)

| # | Check | Location | Finding | Proposed Fix |
|---|---|---|---|---|
| 1 | NFR Specificity | US-003 | Latency requirement says "fast" | Replace with "< 200ms p95 at the API boundary" |
| ... | ... | ... | ... | ... |

### Verdict

[One of:]
- "**PASS** — no BLOCK findings. The PRD is ready for architecture/implementation. [N] advisory finding(s) to consider."
- "**BLOCK** — [N] BLOCK finding(s) must be resolved before proceeding. See table above."
```

---

## Step 3 — Update task files

After presenting findings:

1. **`todo.md`** — find the in-progress entry from Step 0a and mark it done:
   ```
   - ✅ [DEFINE] /prd-critique — <PRD filename> — <PASS or N BLOCK(s)>, M advisory — output: no file (conversational)
   ```

2. **`flags-and-notes.md`** (enterprise) or **`notes.md`** (solo) — if there are BLOCK findings, append each to the "Active Blockers" section:
   ```
   - [PRD-CRITIQUE] BLOCK: <finding summary> in <PRD filename> — needs fix before architecture
   ```
   If no BLOCK findings, skip this.

3. **`flags-and-notes.md`** — append to "Important Notes":
   ```
   - [PRD-CRITIQUE] Critiqued <PRD filename> — <date> — <PASS or N BLOCK(s)> — output: conversational
   ```

Use the Edit tool for each — targeted appends, not rewrites.

---

## Rules

- **Read-only.** Never modify the PRD. Only report findings and proposed fixes.
- Never skip checks 1-3, 5, or 6 — they always run.
- Only skip check 4 when no Decision Brief is provided — and always note the skip.
- Every finding must have a proposed fix — don't just flag problems.
- Severity must be either BLOCK or ADVISORY — no in-between, no "info" tier.
- If the PRD is well-written and passes all checks, say so clearly — don't manufacture findings.
