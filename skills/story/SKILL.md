---
name: story
description: Goal-driven story execution — understand → define goal → plan → execute → verify → e2e gate → PR. Done = goal met (acceptance + e2e gate green), not just compiles. Use when starting a sprint story, implementing a feature, or picking up a task. Usage: /story <story-id> [--auto]
argument-hint: Story ID e.g. 9950
---

**Core Philosophy:** Every story is **goal-driven** — planning defines the goal (acceptance criteria + the right e2e gate), and the session iterates toward it until the goal is genuinely met. "Done" is goal-met (acceptance criteria satisfied AND the e2e gate green or human-accepted), not "compiles + tasks ran." Nothing advances without your explicit confirmation at each STOP gate.

**Triggers:** "work on story 9950", "implement story #123", "start on story", "pick up this story", "execute story"

---

You are the story execution orchestrator for YOUR_PROJECT_NAME.

Parse `$ARGUMENTS`:
1. **Extract flags:** strip `--auto` if present. `--auto` → auto-run all waves without pausing between them (still stops on failure).
2. **Story ID:** the remaining argument after stripping flags.

The story to execute is: **#[story ID]**

Run these phases in strict order — Understand → **Goal Definition (1.5)** → Plan → Execute → Local Verify → Review → **e2e Goal Gate (3.7)** → PR. Each phase ends with a mandatory STOP checkpoint. **Do not advance to the next phase without YOUR_NAME's explicit confirmation.**

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

## Phase 1.5 — Goal Definition

Once YOUR_NAME confirms Phase 1, define the **goal** before planning. This is what makes the story goal-driven: "done" is not "compiles + tasks ran" — it's this goal being met. See `rules/test-philosophy.md` (Level 3).

Work through this with YOUR_NAME — it is a short, mandatory branch, not a full interview:

1. **What does end-to-end verification look like for this story?** Classify it against the e2e modality menu:

   | Modality | What it proves | Typical story |
   |---|---|---|
   | **Automated test** (API / integration) | The system returns the right result through its real interface | backend / pipeline / multi-component |
   | **UI automation** | User clicks through and sees the right thing | UI-facing |
   | **Domain-specific graded evaluation** | Non-deterministic / AI output is correct, judged vs a ground truth | AI / generative / extraction |
   | **Structured human acceptance** | A human ruling / subjective UX call, signed off against the criteria | no machine oracle exists |

   **The menu is OPEN.** If none fit, define a new modality — and note that the plan must include a task to build that probe/harness. Pick one or more.

2. **Is there a machine oracle for this story's goal?** Yes → the gate is an automated check. No (needs a human ruling / subjective call) → the gate is a **structured human acceptance check** — the actual behavior is still shown (observability, below) and YOUR_NAME signs off. Either way the story is gated; the gate is never skipped.

3. **Write the acceptance criteria AS the gate.** Each criterion is phrased so the e2e gate directly checks it — one unified list, no paper-vs-test drift. Define the **concrete gate**: the exact check that must go green.

4. **Decide observability.** For each criterion, how will the ACTUAL state be seen (API response, log, trace, screenshot, structured query)? If it can't be seen with what exists, the plan must include a task to build a probe — respecting the project's data-access rules (observe via API/logs, never raw prod DB reads).

**Escape hatch:** for a change with zero runtime behavior (docs, comments, pure rename), YOUR_NAME may say "skip gate — no runtime impact"; log it and proceed. This is the only way to skip the gate.

Output the goal under the heading:

### Goal for #$ARGUMENTS
- **E2E modality:** [chosen — or new modality to build]
- **Machine oracle?** [yes → automated gate / no → structured human acceptance]
- **Concrete gate:** [the exact check that must go green]
- **Acceptance criteria (= the gate):** [the unified list]
- **Observability:** [how the actual state is seen per criterion, or "probe to be built as a task"]

Then say **exactly**:

---
**STOP 1.5 — This is the goal for #$ARGUMENTS: [one-line modality + gate]. The story is done only when these acceptance criteria are met and this gate is green (or human-accepted). Approve this goal, or adjust it?**

*(Confirm to proceed to Phase 2. The plan is built to satisfy this goal.)*

---

Do NOT proceed until YOUR_NAME responds. The confirmed goal is the input to Phase 2 — the plan agent turns it into the test strategy + test/eval tasks.

---

## Phase 2 — Plan

Once YOUR_NAME confirms Phase 1 (with or without corrections) and the Phase 1.5 goal:

If YOUR_NAME gave corrections, append them to `YOUR_PROJECT_ROOT/tasks/stories/$ARGUMENTS/brief.md` under the "Corrections from YOUR_NAME" section.

Spawn a **`story-plan-agent`** (foreground) with the full Phase 1 brief as input, the **Phase 1.5 goal** (modality + concrete gate + acceptance-criteria-as-gate + observability), plus any corrections YOUR_NAME gave. The plan agent turns the goal into the test-strategy block and the matching test/eval tasks.

Wait for it to return the XML task plan and test strategy. Output it under the heading:

### Execution plan for #$ARGUMENTS

**Write the handoff contracts:**
- Verify the plan agent saved the full plan (XML + wave summary + rationale) to `YOUR_PROJECT_ROOT/tasks/stories/$ARGUMENTS/plan.md` using the structure from the plan template. If it didn't, save it from the agent's output. This plan file — not `todo.md` — is what `/run-tasks` reads to resume execution if the session is interrupted; it lives in the always-local `tasks/stories/` workspace and works in every tracker mode.
- Verify the test strategy was saved to `YOUR_PROJECT_ROOT/tasks/stories/$ARGUMENTS/test-strategy.md`. If it wasn't, extract the test strategy section from the plan output and save it there.

Then say **exactly**:

---
**STOP 2 — Review each task above. The plan has [N] tasks including [M] test tasks. Review the test strategy — the goal (e2e modality + concrete gate), acceptance-criteria-as-gate, observability plan, integration scenarios, and regression guardrails. Confirm the plan satisfies the Phase 1.5 goal. Approve to begin execution, or request changes.**

**Execution mode** (only show if the plan has 2+ waves AND `--auto` was NOT passed — omit entirely otherwise):
- **(A) Wave-by-wave** — I'll pause after each wave for your approval before continuing (default)
- **(B) Auto-run** — I'll run all waves back-to-back and pause only at the end (or on failure)

*(Say "approve" or "approve A" for wave-by-wave, "approve B" for auto-run, or describe what to change. Tip: use `--auto` flag to skip this question next time.)*

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

Once YOUR_NAME approves the plan, note the **execution mode**: if `--auto` flag was set, use mode B. Otherwise use what they chose at STOP 2 (A = wave-by-wave, B = auto-run; default A if not specified). If there is only 1 wave, execution mode is always A (no point asking — there's nothing to auto-continue through). Parse the `parallel_group` attribute on each `<task>` and group tasks into waves. Show the wave summary table before starting:

| Wave | Task IDs | Task Names | Type |
|---|---|---|---|
| 1 | 1, 2 | "Task A", "Task B" | auto, auto |
| 2 | 3 | "Test Task C" | test |

Say: **"[N] waves planned. Starting Wave 1."**

**Seed the live progress checklist first.** Before launching Wave 1, create a `TodoWrite` list with
one item per pending `<task>` (across all waves), using the plan's task names — so YOUR_NAME sees
progress live and the work order is locked in before any code changes. The story plan
(`tasks/stories/$ARGUMENTS/plan.md`) stays the source of truth; the `TodoWrite` list is its in-session
mirror. See `rules/progress-tracking.md`.

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
- `type="auto"` and `type="test"` tasks: spawn each as a **background** `story-executor-agent` with `isolation: "worktree"`, passing the single `<task>` XML block and story ID. Launch ALL in the same message simultaneously. (A `type="test"` task is mechanically identical to `auto` — the executor writes the test/eval and runs its `<verify>`.)
- `type="manual"` tasks: display the `<action>` as instructions for YOUR_NAME. Do not spawn an agent. Treat as BLOCKED pending human confirmation.

**C. Wait for all background agents to complete.**
Collect all results before proceeding.

**D. Show the consolidated wave result table:**

| Task | Name | Result | Summary |
|---|---|---|---|
| 1 | "Task A" | ✅ PASS | [one line what changed] |
| 2 | "Task B" | ❌ FAIL | [error summary] |
| 3 | "Task C" | ⚠️ BLOCKED | [who/what is needed] |

**E. Mark PASSed tasks done in the plan** — mark each done with `✅` in `tasks/stories/$ARGUMENTS/plan.md` in one Edit pass. **In the same pass, mark each PASSed task `completed` in the `TodoWrite` list and mark the next wave's task(s) `in_progress`.** FAILed/BLOCKED tasks stay `in_progress` until resolved. Never hand-edit `tasks/todo.md` — it is a generated dashboard (D9), not the task plan.

**E2. Update the executor state handoff:** Write/update `YOUR_PROJECT_ROOT/tasks/stories/$ARGUMENTS/executor-state.md` with the current progress table and wave log. Update after EVERY wave, not just at the end. This file is the source of truth for what's been done.

**F. STOP after every wave (behavior depends on execution mode):**

**If mode A (wave-by-wave)** — say exactly:

---
**STOP 3 — Wave [n] complete: [k passed] ✅  [j failed] ❌  [m blocked] ⚠️**

[If FAIL]: Task [id] failed — "[error]". Say "retry" to re-run, or "debug" to invoke /debug.
[If BLOCKED]: Task [id] blocked — "[what is needed from whom]". Resolve externally, then say "continue".
[If all passed]: All [k] tasks in Wave [n] passed.

*Continue to Wave [n+1]: "[wave n+1 task names]"? (Say "yes" to continue, or "stop" to pause.)*

---

Do NOT start the next wave until YOUR_NAME says "yes".

**If mode B (auto-run):**
- Show the wave result table (step D) so YOUR_NAME can see progress in real-time.
- **If all tasks passed**: say "Wave [n] ✅ — continuing to Wave [n+1]..." and proceed immediately. Do NOT wait for confirmation.
- **If any task FAILED or is BLOCKED**: STOP and show the full STOP 3 message above — auto-run pauses on failure. YOUR_NAME must respond before continuing.
- After the **final wave** (all waves done, all passed), show the full summary and proceed to Phase 3.5.

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
**All reviews passed — evaluation clear, feature accepted, architecture aligned, security clear. Ready for Phase 3.7 — the e2e goal gate?**

---

Do NOT proceed until YOUR_NAME confirms.

---

## Phase 3.7 — Goal-seeking e2e gate

This is the terminal check: the story is **not done** until its goal is met. Run the **e2e gate defined in Phase 1.5** (the chosen modality + concrete gate, recorded in `tasks/stories/$ARGUMENTS/test-strategy.md`). Phase 3.6 asks "is the code sound?"; Phase 3.7 asks "does it actually meet the goal end-to-end?"

_(If YOUR_NAME took the "skip gate — no runtime impact" escape hatch at Phase 1.5, note it and skip straight to Phase 4.)_

**Run the gate:**
- **Automated modality** (API/integration test, UI automation, graded eval): run it via `/local-test e2e` (the gate command comes from `tasks/lessons.md` — never hardcoded here).
- **Structured human acceptance** (no machine oracle): show the ACTUAL behavior using the story's observability plan (API response, log, trace, screenshot — never a raw prod DB read), then ask YOUR_NAME to sign off against each acceptance criterion.

**If the gate is green (or YOUR_NAME accepts the human check):** the goal is met. Say:

---
**Goal met for #$ARGUMENTS — acceptance criteria satisfied and the e2e gate is green (or human-accepted). Ready for Phase 4 — Commit + PR?**

---

Do NOT proceed until YOUR_NAME confirms.

**If the gate FAILS — diagnostic re-approach (evidence-driven, NOT blind retry):**

A failed gate never triggers a blind re-run. Each iteration runs an explicit cycle, in-session with YOUR_NAME at the gates (no background autonomous loop — only a slow deploy/build step, if any, may run in the background):

1. **Observe the ACTUAL state** using the story's observability plan. If you can't see what the system actually did, build a probe (endpoint, query, log line) — respecting data-access rules.
2. **Compare three things:** *intended* (the acceptance criterion) vs *implemented* (what we actually changed) vs *observed* (what the system actually does/returns).
3. **Root-cause the gap.** For a behavioral gap (compiles but does the wrong thing), route through `/troubleshoot`. For the 3-attempt-rule trigger, route through `/debug`. Do NOT reimplement those — invoke them.
4. **Decide the next concrete action** from the diagnosis, apply the fix, then re-run the gate. A re-approach only counts against the 3-attempt rule if it is evidence-based — a blind repeat is not allowed.

**Brakes:** the 3-attempt rule applies to the gate too. Three evidence-based re-approaches without a green gate → **STOP, invoke `/debug`.** Do not attempt a 4th.

**Blocks PR.** Goal not met = no PR. Phase 4 is only reachable once the gate is green or human-accepted.

---

## Phase 4 — Commit + Sync + PR

Once the goal is met (Phase 3.7 gate green or human-accepted) and YOUR_NAME confirms:

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
- **"Done" is goal-met, not "compiles"** — the story is done only when all tasks pass, acceptance criteria are satisfied, AND the Phase 3.7 e2e gate is green (or human-accepted). Phase 4 is unreachable until then
- Never skip Phase 1.5 (goal definition) — the goal is the input to planning and the terminal condition; the only way past the gate is the explicit "skip gate — no runtime impact" escape hatch
- Never skip Phase 3.6 (evaluation + acceptance + architecture + security review) — even if changes look trivial, always run all four agents
- Never skip Phase 3.7 (e2e goal gate) — a failed gate blocks PR; re-approach is evidence-driven (observe → compare → root-cause → decide), never a blind retry, and never a background autonomous loop
- Never commit during Phase 3 — all commits happen in Phase 4
- If something fails 3 times → invoke `/debug`, do not keep trying
- Always follow the git commit format from `tasks/lessons.md`
- Never add "Co-Authored-By: Claude Sonnet 4.6" to commit messages — this is explicitly prohibited
- If YOUR_NAME says "stop" at any point — stop immediately, summarize state, ask what to do next
- A task is only ✅ when its `<verify>` command passes — verify commands MUST include running relevant tests, not just building
- If the acceptance-test-agent reports NOT ACCEPTED, the feature is not done — fix before proceeding to PR