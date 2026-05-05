---
name: story
description: End-to-end story execution — understand → plan → execute → PR. Use when starting a sprint story, implementing a feature, or picking up a task. Usage: /story <story-id>
argument-hint: Story ID e.g. 9950
---

**Core Philosophy:** Every story runs through four gates — understand, plan, execute, PR — and nothing advances without your explicit confirmation at each one.

**Triggers:** "work on story 9950", "implement story #123", "start on story", "pick up this story", "execute story"

---

You are the story execution orchestrator for YOUR_PROJECT_NAME. The story to execute is: **#$ARGUMENTS**

Run these 4 phases in strict order. Each phase ends with a mandatory STOP checkpoint. **Do not advance to the next phase without YOUR_NAME's explicit confirmation.**

---

## Before you start

Read `YOUR_PROJECT_ROOT\tasks\lessons.md` now. It contains the git commit rules, Code Rabbit patterns, and the 3-attempt rule you must follow throughout.

Also run:
```bash
cd YOUR_PROJECT_ROOT && git status && git branch --show-current
mkdir -p YOUR_PROJECT_ROOT/tasks/stories/$ARGUMENTS
```
Confirm you are on the right branch for story #$ARGUMENTS. The `tasks/stories/$ARGUMENTS/` directory is where handoff contracts will be written throughout this story.

---

## Phase 1 — Understand

Glob `YOUR_PROJECT_ROOT\tasks\sprint*.md` and pick the latest sprint file.

Spawn a **`story-understand-agent`** (foreground) with this prompt:

> Story ID: $ARGUMENTS
> Sprint file path: [the path you just found]
> Produce the complete 8 pre-planning points for this story.

Wait for it to return. Output its full result under the heading:

### Pre-planning brief for #$ARGUMENTS

**Write the handoff contract:** Save the full brief to `YOUR_PROJECT_ROOT/tasks/stories/$ARGUMENTS/brief.md` using the structure from the brief template. Include all 8 points.

Then say **exactly**:

---
**STOP 1 — Does this brief match your understanding of #$ARGUMENTS? Any corrections before I build the plan?**

*(Confirm to proceed to Phase 2. Say "yes" or give corrections.)*

---

Do NOT proceed until YOUR_NAME responds.

---

## Phase 2 — Plan

Once YOUR_NAME confirms Phase 1 (with or without corrections):

If YOUR_NAME gave corrections, append them to `YOUR_PROJECT_ROOT/tasks/stories/$ARGUMENTS/brief.md` under the "Corrections from YOUR_NAME" section.

Spawn a **`story-plan-agent`** (foreground) with the full Phase 1 brief as input, plus any corrections YOUR_NAME gave.

Wait for it to return the XML task plan and test strategy. Output it under the heading:

### Execution plan for #$ARGUMENTS

**Write the handoff contracts:**
- Save the full plan (XML + wave summary + rationale) to `YOUR_PROJECT_ROOT/tasks/stories/$ARGUMENTS/plan.md` using the structure from the plan template.
- Verify the test strategy was saved to `YOUR_PROJECT_ROOT/tasks/stories/$ARGUMENTS/test-strategy.md`. If it wasn't, extract the test strategy section from the plan output and save it there.
- Verify the XML tasks were also written to `YOUR_PROJECT_ROOT/tasks/todo.md` by the plan agent. If missing, append the `<tasks story="$ARGUMENTS">` block to `todo.md`. This enables `/run-tasks` to resume execution if the session is interrupted.

Then say **exactly**:

---
**STOP 2 — Review each task above. The plan has [N] tasks including [M] test tasks. Review the test strategy — acceptance criteria, integration scenarios, and regression guardrails. Approve to begin execution, or request changes.**

*(Say "approve" or describe what to change.)*

---

Do NOT proceed until YOUR_NAME approves.

**Plan revision stall detection:** If YOUR_NAME requests changes to the plan, re-spawn the plan agent with corrections. Track the number of issues/changes requested across revision iterations. If the issue count does not decrease between consecutive iterations (the plan is not converging), stop and say:

> "Plan revision is stalling — the issue count isn't decreasing between iterations. Options:
> (A) Approve the plan as-is and accept the remaining issues
> (B) Adjust the story scope to reduce complexity
> (C) Take manual control — tell me exactly what to change"

Do not loop more than 3 plan revision iterations without escalating.

---

## Phase 3 — Execute (wave by wave)

Once YOUR_NAME approves the plan, parse the `parallel_group` attribute on each `<task>` and group tasks into waves. Show the wave summary table before starting:

| Wave | Task IDs | Task Names | Type |
|---|---|---|---|
| 1 | 1, 2 | "Task A", "Task B" | auto, auto |
| 2 | 3 | "Task C" | auto |

Say: **"[N] waves planned. Starting Wave 1."**

For **each wave**, in ascending group order:

**A0. Conflict detection (before launching):**

Before launching any wave with 2+ tasks, validate that no two tasks in that wave share a file. For every pair of tasks in the wave, compare their `<files>` lists. If ANY file appears in more than one task's `<files>`:

1. **Show the conflict:**

   > ⚠️ **File conflict detected in Wave [n]:** `[filename]` appears in both Task [x] ("[name]") and Task [y] ("[name]").

2. **Auto-split:** Move the conflicting task with the higher ID into a new wave immediately after the current one. Renumber subsequent waves. Show the updated wave table.

3. **Tell YOUR_NAME:** "Wave [n] was split due to file overlap. Revised wave plan: [show updated table]."

Do NOT skip this check. The plan agent is supposed to prevent file overlaps, but this is the runtime safety net. If there is no conflict, proceed silently (do not announce that the check passed).

**A. Announce the wave:**
Say: **"Wave [n]/[total] — launching [k] task(s) in parallel: [task names]"**

**B. Launch all tasks in the wave:**
- `type="auto"` tasks: spawn each as a **background** `story-executor-agent` with `isolation: "worktree"`, passing the single `<task>` XML block and story ID. Launch ALL in the same message simultaneously.
- `type="manual"` tasks: display the `<action>` as instructions for YOUR_NAME. Do not spawn an agent. Treat as BLOCKED pending human confirmation.

**C. Wait for all background agents to complete.**
Collect all results before proceeding.

**D. Show the consolidated wave result table:**

| Task | Name | Result | Summary |
|---|---|---|---|
| 1 | "Task A" | ✅ PASS | [one line what changed] |
| 2 | "Task B" | ❌ FAIL | [error summary] |
| 3 | "Task C" | ⚠️ BLOCKED | [who/what is needed] |

**E. Update todo.md for all PASSed tasks** — mark each done with `✅` in one Edit pass.

**E2. Update the executor state handoff:** Write/update `YOUR_PROJECT_ROOT/tasks/stories/$ARGUMENTS/executor-state.md` with the current progress table and wave log. Update after EVERY wave, not just at the end. This file is the source of truth for what's been done.

**F. STOP after every wave** — say exactly:

---
**STOP 3 — Wave [n] complete: [k passed] ✅  [j failed] ❌  [m blocked] ⚠️**

[If FAIL]: Task [id] failed — "[error]". Say "retry" to re-run, or "debug" to invoke /debug.
[If BLOCKED]: Task [id] blocked — "[what is needed from whom]". Resolve externally, then say "continue".
[If all passed]: All [k] tasks in Wave [n] passed.

*Continue to Wave [n+1]: "[wave n+1 task names]"? (Say "yes" to continue, or "stop" to pause.)*

---

Do NOT start the next wave until YOUR_NAME says "yes".

**G. On failure — 3-attempt rule (per task, tracked independently):**
- Attempt 1 failed: re-spawn that task only as a background worktree agent with the error included. Other passing tasks in the wave are not re-run.
- Attempt 2 failed: spawn again with both previous errors included.
- Attempt 3 failed: **STOP. Say "3-attempt rule triggered on task [id]. Invoking /debug."** Invoke `/debug`. Do NOT attempt a 4th time.

A wave is not complete until every task has PASSed or been escalated. Do not advance with an unresolved FAIL or BLOCKED.

---

## Phase 3.5 — Local Verification

After all waves in Phase 3 are complete and YOUR_NAME confirms, run `/local-test 2` to verify the full build, all tests, and end-to-end smoke test pass with the changes.

If `/local-test` fails:
- Show the failure to YOUR_NAME
- Do NOT proceed to Phase 3.6 — fix the issue first
- If Docker is not available, fall back to `/local-test 1` (build + unit tests only) and note that integration testing was skipped

If `/local-test` passes, proceed directly to Phase 3.6.

---

## Phase 3.6 — Evaluation + Acceptance Testing + Architecture + Security Review

After local tests pass, spawn **all four agents in parallel** (foreground). Each has fresh context and a different adversarial lens:

**Agent 1 — Evaluator:** Spawn an **`evaluator-agent`** with:

> Story ID: $ARGUMENTS
> Plan path: YOUR_PROJECT_ROOT/tasks/stories/$ARGUMENTS/plan.md
> Scope: full

**Agent 2 — Acceptance Tester:** Spawn an **`acceptance-test-agent`** with:

> Story ID: $ARGUMENTS
> Test strategy path: YOUR_PROJECT_ROOT/tasks/stories/$ARGUMENTS/test-strategy.md
> Plan path: YOUR_PROJECT_ROOT/tasks/stories/$ARGUMENTS/plan.md

**Agent 3 — Architect Reviewer:** Spawn an **`architect-reviewer-agent`** with:

> Story ID: $ARGUMENTS

_(This agent finds its own architecture artifacts via Glob. No path needed.)_

**Agent 4 — Security Reviewer:** Spawn a **`security-reviewer-agent`** with:

> Story ID: $ARGUMENTS

_(This agent reads security rules and architecture security section on its own.)_

Wait for **all four** to return.

**Write the handoff contracts:**
- Save the evaluation report to `YOUR_PROJECT_ROOT/tasks/stories/$ARGUMENTS/evaluation.md`
- Save the acceptance report to `YOUR_PROJECT_ROOT/tasks/stories/$ARGUMENTS/acceptance.md`
- Save the architecture review to `YOUR_PROJECT_ROOT/tasks/stories/$ARGUMENTS/architecture-review.md`
- Save the security review to `YOUR_PROJECT_ROOT/tasks/stories/$ARGUMENTS/security-review.md`

Output all reports under headings:

### Evaluation report for #$ARGUMENTS

[evaluator report]

### Acceptance test report for #$ARGUMENTS

[acceptance report]

### Architecture review for #$ARGUMENTS

[architect-reviewer report]

### Security review for #$ARGUMENTS

[security-reviewer report]

Then act on the **combined** verdict from all four:

**If evaluator says ❌ NO (hard gates failed):**
This should not happen if Phase 3.5 passed — but if it does, do NOT proceed. Show the failures and fix them first.

**If acceptance test says NOT ACCEPTED:**
Do NOT proceed. Show the failed acceptance criteria. These must be fixed — the feature doesn't work as intended.

**If architect-reviewer or security-reviewer has BLOCK findings:**
Do NOT proceed. Show the BLOCK findings. These must be fixed — architectural violations and security vulnerabilities cannot ship.

**If any agent has findings (⚠️ WITH CAVEATS, ACCEPTED WITH GAPS, or ADVISORY findings):**

---
**STOP 3.6 — Review found issues across all four reports.**

**Evaluation:** [N] findings with >= 75% confidence.
**Acceptance:** [M] criteria FAIL/PARTIAL, [K] integration gaps, [J] regression concerns.
**Architecture:** [N] findings ([B] BLOCK, [A] ADVISORY).
**Security:** [N] findings ([B] BLOCK, [A] ADVISORY, [P] PHI/PII risks).

Review each finding above. For each: say "fix" (I'll address it before PR) or "skip" (acceptable, proceed). Or say "proceed" to move to Phase 4 with findings as-is.

---

Do NOT proceed until YOUR_NAME responds.

**If all four pass (✅ YES, ACCEPTED, CLEAR, CLEAR):**

Say:

---
**All reviews passed — evaluation clear, feature accepted, architecture aligned, security clear. Ready for Phase 4 — Commit + PR?**

---

Do NOT proceed until YOUR_NAME confirms.

---

## Phase 4 — Commit + Sync + PR

Once all tasks are done and YOUR_NAME confirms:

Spawn a **`story-pr-agent`** (foreground) with:
- Story ID: $ARGUMENTS
- The list of all completed tasks (task id + name + files changed, from Phase 3 results)
- Current branch name (from git branch --show-current)

Wait for it to return the full PR preparation report.

Output the report in full.

Then say **exactly**:

---
**STOP 4 — All [N] tasks done. Review the commit messages and PR description above.**

*Run the git commands shown to commit and push. Then say "raise PR" when ready.*

---

Wait for YOUR_NAME to run the git commands and confirm. Only then raise the PR using `gh pr create`.

---

## Hard rules (never break these)

- Never chain phases — always wait for explicit confirmation at each STOP
- Never skip Phase 3.6 (evaluation + acceptance + architecture + security review) — even if changes look trivial, always run all four agents
- Never commit during Phase 3 — all commits happen in Phase 4
- If something fails 3 times → invoke `/debug`, do not keep trying
- Always follow the git commit format from `tasks/lessons.md`
- Never add "Co-Authored-By: Claude Sonnet 4.6" to commit messages — this is explicitly prohibited
- If YOUR_NAME says "stop" at any point — stop immediately, summarize state, ask what to do next
- A task is only ✅ when its `<verify>` command passes — verify commands MUST include running relevant tests, not just building
- If the acceptance-test-agent reports NOT ACCEPTED, the feature is not done — fix before proceeding to PR