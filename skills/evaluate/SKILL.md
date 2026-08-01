---
name: evaluate
description: Adversarial evaluation of code changes — runs build, tests, plan compliance, and security review. Use after implementing changes or before creating a PR. Usage: /evaluate [story-id] [--quick]
argument-hint: Story ID or branch name, optional --quick flag
context: fork
model: opus
---

**Triggers:** "evaluate this", "check my changes", "review before PR", "run evaluator", "quality check"

---

You are the evaluation orchestrator. You launch the evaluator agent and present its findings.

Parse arguments from: **$ARGUMENTS**
- First argument: story ID or branch name (if omitted, use current branch)
- `--quick` flag: if present, only run hard gates (build + tests), skip plan compliance and adversarial review

---

## Phase marker

Before spawning the evaluator agent (Step 2), write `tasks/stories/<story-id>/phase.md` per
`rules/phase-markers.md` — overwrite it in full with the six plain `key: value` lines
(`schemaVersion: 1`, `phase: reviewing` (the reviewing phase, displayed as Warden), `role: reviewer`,
`updated: <ISO-8601 UTC now>`, `skill: evaluate`, `detail: Step 2 — evaluator-agent`). `role` is always
`reviewer` for `/evaluate`. `/evaluate` writes this marker only when it has a story id / story
workspace to write into — if there is no story ID and no `tasks/stories/<id>/` workspace (e.g. running
against a bare branch name with no plan file), skip the marker entirely.

---

## Step 1 — Determine context

Run:
```bash
cd YOUR_PROJECT_ROOT && git branch --show-current && git diff --stat HEAD~1..HEAD
```

Determine:
- **Branch name** — from git output
- **Story ID** — from arguments, or extract from branch name (e.g., `sprint3/4567-add-login-page` → `4567`)
- **Scope** — "quick" if `--quick` flag present, "full" otherwise

Check if a plan file exists:
```bash
ls YOUR_PROJECT_ROOT/tasks/stories/[story-id]/plan.md 2>/dev/null || echo "no plan"
```

If no plan file exists and no story ID was provided, set scope to "quick" automatically (no plan to check against).

---

## Step 2 — Launch evaluator

**Write the phase marker** (per `rules/phase-markers.md` — the full six-key marker, see "Phase marker"
above) before spawning, if a story workspace exists.

Spawn an **`evaluator-agent`** (foreground) with:

> Story ID: [story-id or branch name]
> Plan path: [path to plan.md, or "none"]
> Scope: [full or quick]

Wait for it to return the full evaluation report.

---

## Step 3 — Present findings

Output the evaluator's full report.

Then based on the verdict:

**If ❌ NO (hard gates failed):**

---
**EVALUATION BLOCKED — build or tests are failing.**

Fix the failures above, then run `/evaluate` again.

---

**If ⚠️ WITH CAVEATS (high-confidence findings):**

---
**EVALUATION PASSED WITH CAVEATS — [N] findings need review.**

Review the findings above. For each one, say "fix" (I'll help fix it) or "skip" (acceptable risk). Or say "proceed" to continue to PR with all findings as-is.

Before presenting a finding as skippable, apply the **ship test** (`rules/deferrals.md`) to it: with
this left undone, does the change behave incorrectly for the project's **real configured inputs** —
not for the values its tests use? Mark any finding that fails the test as **BLOCKER (not deferrable)**
in the list, whatever severity the evaluator assigned it, and say why. A finding the human then skips
must be registered as a tracker item, not left as prose.

---

**If ✅ YES (all clear):**

---
**EVALUATION PASSED — no blockers, no high-confidence findings.**

Ready to proceed to PR.

---

## Hard rules

- Never skip the evaluator agent — always spawn it, even if changes look trivial
- Never override a hard gate failure — if build/tests fail, the verdict is always ❌ NO
- Present the full report — don't summarize or filter findings
- Apply the ship test (`rules/deferrals.md`) to every finding before presenting it as skippable — the evaluator's severity label is an input, not a verdict; it doesn't know what the project has configured
- If the user says "fix" for a finding, help implement the fix, then re-run `/evaluate`
