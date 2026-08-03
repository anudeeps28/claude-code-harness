---
name: run-tasks
description: Execute XML tasks from the story plan wave by wave (Phase 3 only — no understand, no plan, no PR). Use when resuming a story that already has a task plan. Usage: /run-tasks <story-id> [--auto]
argument-hint: Story ID e.g. 9950
---

**Core Philosophy:** Execute only — read the XML plan from the story's `plan.md` and run each wave; planning and PR are /story's job.

**Triggers:** "run tasks for #9950", "execute the task plan", "continue execution", "pick up from Phase 3", "resume wave execution"

---

Parse `$ARGUMENTS`:
1. **Extract flags:** strip `--auto` if present. `--auto` → auto-run all waves without pausing between them (still stops on failure).
2. **Story ID:** the remaining argument after stripping flags.

You run the pending XML tasks for story **#[story ID]** from `tasks/stories/[story ID]/plan.md`. No planning, no PR — just execution.

---

## Autonomous mode (inherited — no flag of its own)

`/run-tasks` has **no `--autonomous` flag.** It inherits autonomous mode from its caller per
`rules/autonomous-mode.md`. Detect the mode via either signal: the invocation context (an autonomous
`/implement` / `/story` says so when it hands off), or `run-mode: autonomous` in
`tasks/stories/$ARGUMENTS/executor-state.md` (the standalone-resume path — read it in Step 2). With
neither signal, run interactively exactly as below.

When the run is autonomous, apply the self-answer rule from `rules/autonomous-mode.md` to this skill's
checkpoints, and append each self-answered decision to `tasks/stories/$ARGUMENTS/decisions-log.md`:

- **Step 2 "no goal defined" A/B** → self-answer **(A) define the goal** (reversible; a gate is
  strictly better than none), run the Phase 1.5 goal step, log it. If the goal genuinely cannot be
  defined without a human ruling, that is a pause-anyway trigger.
- **Step 3 execution-mode A/B** → `--auto` is implied (autonomous implies `--auto`), so this question
  never fires — use mode B.
- **Step 4F wave STOP** → in mode B the wave pause already fires **only on FAIL/BLOCKED**, and that
  stays: a FAIL/BLOCKED is a genuine block, not a checkpoint. All-passed waves auto-continue.
- **Step 6 goal gate** → already deterministic; on failure it re-approaches and escalates to `/debug`
  (inherited-autonomous) per the 3-attempt rule — unchanged.

The mode never skips a phase, the goal gate, local tests, or a failure pause. Pause only on a
pause-anyway trigger (contradiction, irreversible action, scope change, 3-failed-attempts).

---

## Phase marker

At each phase boundary it owns, `/run-tasks` writes `tasks/stories/$ARGUMENTS/phase.md` per
`rules/phase-markers.md` — overwrite it in full with the six plain `key: value` lines
(`schemaVersion: 1`, `phase`, `role: builder`, `updated`, `skill`, `detail`), immediately BEFORE
spawning that step's agent. This happens in every run mode, interactive and autonomous alike. `role`
is always `builder` for `/run-tasks`. Because `/run-tasks` only ever runs Phase 3 (execution) and
local verification — and its sequence may revisit phases (e.g. back to `coding` after a failed goal
gate) — it must **not** write `phase: planning` or `phase: shipping` — those belong to
`/story`/`/implement`. See the concrete write points below.

---

## Step 1 — Find the task plan

Read `YOUR_PROJECT_ROOT\tasks\stories\$ARGUMENTS\plan.md` — the always-local story plan that `/story` and `/implement` write. It is the source of truth for the task plan in **every** tracker mode; `todo.md` is only a generated dashboard and never holds the XML plan.

Search for a `<tasks story="$ARGUMENTS">` block. Extract all `<task>` elements from it. Skip any task already marked `✅`.

If no `<tasks>` block exists for this story, stop immediately and say:

> No XML task plan found in tasks/stories/$ARGUMENTS/plan.md for #$ARGUMENTS. Run `/story $ARGUMENTS` first to generate one.

---

## Step 2 — Check git state + goal

Run:
```bash
cd YOUR_PROJECT_ROOT && git status && git branch --show-current
```

Confirm you are on the correct feature branch for story #$ARGUMENTS. If you are on `master`, say so and ask YOUR_NAME to confirm the branch before continuing.

**Record the branch name** — every wave re-checks it against this value (Step 4, A0a).

**Act on that `git status` output — do not just print it.** Per `rules/wave-execution.md`, treat it as possible foreign work when the tree is dirty **and** any of these hold:

- the current branch is another story's branch, not #$ARGUMENTS';
- another story's `tasks/stories/<other-id>/executor-state.md` shows an in-progress run with a recent `updated` timestamp;
- another story's `tasks/stories/<other-id>/phase.md` is fresh (freshness comes from `updated`, never from the file merely existing — see `rules/phase-markers.md`).

**Show what you found and ask.** Do not refuse outright, and do not proceed silently — a dirty tree is often YOUR_NAME's own scratch work (and on a resume, often this very story's partial work, which is expected and fine), so the call is theirs:

```
This working directory has uncommitted changes that may belong to another story:

  branch: <actual>   (this run wants: <intended branch>)
  modified: <files>
  untracked: <paths>
  tasks/stories/<other-id>/phase.md — updated <N> minutes ago (phase: <phase>)

Building two stories in one folder commingles their uncommitted work — see
rules/git-worktrees.md. Recommended: build this story in its own worktree.

(A) Stop — I'll set up a separate worktree
(B) These are my own changes, continue here
```

This is **not** self-answerable under an inherited autonomous run — proceeding could destroy another run's uncommitted work, which fails the reversibility test. An autonomous run **pauses** here.

**Autonomous check:** read `tasks/stories/$ARGUMENTS/executor-state.md` — if it contains `run-mode:
autonomous`, this is an inherited autonomous run (see "Autonomous mode" above); otherwise run
interactively.

**Goal check:** Read `tasks/stories/$ARGUMENTS/test-strategy.md` (or `tasks/stories/$ARGUMENTS/plan.md` if no test-strategy exists). Look for a defined e2e gate / acceptance criteria / goal definition.

- If a goal exists: display it as a one-liner — "Goal: [modality] — [concrete gate]" — so YOUR_NAME can confirm it's still correct before execution begins.
- If NO goal is defined: warn before proceeding:

  > "No goal definition found for #$ARGUMENTS. Without a goal, there's no e2e gate to run after execution — 'done' will mean 'tasks passed' rather than 'goal met.' Options:
  > (A) Define the goal now (I'll run Phase 1.5 — quick goal definition interview)
  > (B) Proceed without a goal gate — tasks only"

  If YOUR_NAME picks (A), run Phase 1.5 from `/story` (the goal definition step: modality menu → machine oracle → acceptance criteria as gate → observability). Write the result to `tasks/stories/$ARGUMENTS/test-strategy.md`. Then continue to Step 3.

  If YOUR_NAME picks (B), proceed — but skip any e2e gate at the end (Step 5 runs local tests only, no goal gate).

---

## Step 3 — Group tasks into waves

Parse the `parallel_group` attribute on each `<task>`. Group tasks by their `parallel_group` value. Waves execute in ascending group order.

If any task is missing a `parallel_group` attribute, treat it as its own group (sequential, one task per wave) and note this in your output.

Build a wave summary table and show it before starting execution:

| Wave | Task IDs | Task Names | Type |
|---|---|---|---|
| 1 | 1, 2 | "Add QueryFilters record", "Update ConversationManager" | auto, auto |
| 2 | 3 | "Update RagQueryService" | auto |
| 3 | 4 | "Update DependencyInjection.cs" | auto |
| 4 | 5 | "Deploy to Azure" | manual |

If `--auto` was passed, use mode B. If there is only 1 wave, use mode A. In both cases, skip the mode question and say **"[N] wave(s) planned. Starting Wave 1."**

Otherwise (2+ waves, no `--auto`), ask YOUR_NAME:

---
**[N] waves planned. Choose execution mode:**
- **(A) Wave-by-wave** — I'll pause after each wave for your approval before continuing (default)
- **(B) Auto-run** — I'll run all waves back-to-back and pause only at the end (or on failure)

*(Say "A" or "B", or just "go" for wave-by-wave. Tip: use `--auto` flag to skip this question next time.)*

---

Do NOT start execution until YOUR_NAME responds.

---

## Step 4 — Execute wave by wave

**Write the phase marker** before launching Wave 1: `schemaVersion: 1`, `phase: coding` (the coding
phase, displayed as Shipwright), `role: builder`, `updated: <ISO-8601 UTC now>`, `skill: run-tasks`,
`detail: Step 4 Wave 1 — story-executor-agent`. Update `detail` and `updated` (keeping `phase: coding`)
as execution moves between waves — write the full six-key marker per `rules/phase-markers.md` on every
wave transition.

**Seed the live progress checklist first.** Before launching Wave 1, create a `TodoWrite` list with
one item per pending `<task>` (across all waves), using the task names from the plan. This gives
YOUR_NAME live visibility and locks in the work order before any code changes. Mark the first wave's
task(s) `in_progress` as you launch them. The story plan (`tasks/stories/$ARGUMENTS/plan.md`) stays the
source of truth — the `TodoWrite` list is its in-session mirror. See `rules/progress-tracking.md`.

For **each wave**, in ascending group order. Wave execution follows `rules/wave-execution.md` — the steps below are its concrete write-up for this skill.

### A0a. Branch-drift check (EVERY wave, including single-task waves)

```bash
git branch --show-current
```

If it is not the branch recorded in Step 2, **STOP immediately** — do not launch the wave. Another session sharing this working directory has switched the branch, and anything launched now writes this story's work onto someone else's branch. Report expected vs actual and stop. This is a **contradiction** pause-anyway trigger — never self-answered under an inherited autonomous run.

### A0b. Overlap check (waves with 2+ tasks)

Agents in a wave share one working directory, so this is the only thing keeping them off each other's files. For every task pair, compare **both**:

- task A's `<files>` vs task B's `<files>` — **two writers** on one file; and
- task A's `<read_first>` vs task B's `<files>` — **a reader against a writer**: A reads the file for context while B rewrites it, so A works from a half-written version. Silent — nothing in the build output reveals it.

On any overlap, auto-split: move the higher-id task into a new wave immediately after this one, renumber the rest, and show the updated wave table, naming the file and both tasks. If there is no overlap, proceed silently.

### A. Announce the wave

Say: **"Wave [n]/[total] — launching [k] task(s) in parallel: [task names]"**

### B. Launch all tasks in the wave

For **each task** in the wave:

- If `type="auto"` or `type="test"`: spawn a `story-executor-agent` as a **background agent** with **no `isolation`** — it runs in this working directory on this branch — passing:
  - The single `<task>` XML block
  - Story ID: $ARGUMENTS

  A `type="test"` task is mechanically identical to `auto` — the executor writes the test/eval and runs its `<verify>`. No special handling.

  **Never pass `isolation: "worktree"` here.** An isolated worktree forks from the default branch and sees only *committed* state, while nothing is committed until the story's PR phase — so a dependent wave gets a copy without the files the earlier waves just wrote, and its `<verify>` fails on missing modules. See `rules/wave-execution.md`. Agents edit in parallel and serialize only on `<verify>`, via the lock in `agents/story-executor-agent.md` Step 3.

- If `type="manual"`: do NOT spawn an agent. Instead, display the full `<action>` content as instructions for YOUR_NAME to follow, then treat it as BLOCKED pending human confirmation.

Launch ALL auto/test tasks in the wave simultaneously (one Agent call per task, all in the same message). Do not wait for one before launching the next.

### C. Wait for all background agents to complete

Do not output anything while waiting. The platform will notify you as each agent finishes. Collect all results before proceeding.

### C1. Post-wave integrity checks (both, every wave)

*Stray-file check* — compare what actually changed against what the wave declared:

```bash
git status --porcelain
```

Every changed path must appear in some task's `<files>` (this wave or an earlier completed one). A path declared by **no** task means an agent edited outside its scope — the failure A0b cannot prevent, since it trusts the plan's file lists. Name the file and **STOP**; do not roll into the next wave. It may be a sibling agent's work being silently overwritten, and it will otherwise ship inside the story diff unnoticed. Ignore gitignored paths, the story workspace (`tasks/stories/$ARGUMENTS/`), and `tasks/.verify.lock` (a leftover lock means an agent died mid-verify — `rmdir` it and carry on; its own BLOCKED report already covers that).

*Branch-drift check* — re-run A0a. Checking both sides of a wave catches a hijack within one wave instead of at the end of the run.

### D. Show the consolidated wave result

Display a result table:

| Task | Name | Result | Summary |
|---|---|---|---|
| 1 | "Add QueryFilters record" | ✅ PASS | Created QueryFilters record, updated QueryRequest |
| 2 | "Update ConversationManager" | ✅ PASS | Replaced LastEmployer/LastPlanYear with LastFilters |
| 3 | "Update RagQueryService" | ❌ FAIL | Build error: CS0246 type not found |

For any BLOCKED task, show:

| 4 | "Deploy to cloud" | ⚠️ BLOCKED | YOUR_INFRA_PERSON — must upgrade search tier |

### E. Mark PASSed tasks done in the plan

For each task that returned PASS: mark it done in `tasks/stories/$ARGUMENTS/plan.md` by prepending `✅` to its `<task>` name line. Do all updates in one Edit pass — not one per task. **In the same pass, mark each PASSed task `completed` in the `TodoWrite` list, and mark the next wave's task(s) `in_progress`.** A FAILed or BLOCKED task stays `in_progress` until resolved. Never hand-edit `tasks/todo.md` — it is a generated dashboard (D9), not the task plan.

### F. STOP after every wave (behavior depends on execution mode):

**If mode A (wave-by-wave)** — say exactly:

---
**STOP — Wave [n] complete: [k passed] ✅ [j failed] ❌ [m blocked] ⚠️**

[If any FAIL]: Task [id] failed — "[error summary]". Try a different approach? (Say "retry" to re-run that task, or "debug" to invoke /debug.)
[If any BLOCKED]: Task [id] blocked — "[what is needed from whom]". Resolve this externally, then say "continue".
[If all passed]: All [k] tasks in Wave [n] passed.

*Continue to Wave [n+1]: "[wave n+1 task names]"? (Say "yes" to continue, or "stop" to pause.)*

---

Do NOT start the next wave until YOUR_NAME says "yes" (or "retry" / "continue" for failures/blockers).

**If mode B (auto-run):**
- Show the wave result table (step D) so YOUR_NAME can see progress in real-time.
- **If all tasks passed**: say "Wave [n] ✅ — continuing to Wave [n+1]..." and proceed immediately. Do NOT wait for confirmation.
- **If any task FAILED or BLOCKED**: STOP and show the full STOP message above — auto-run pauses on failure. YOUR_NAME must respond before continuing.
- After the **final wave** (all waves done, all passed), show the full summary and proceed to Step 5.

### G. On failure — 3-attempt rule (per task, not per wave)

Track failure attempts per task ID independently.

**Before every retry, restore that task's files** (see `rules/wave-execution.md`). The failed agent left partially-applied edits in the shared working directory. Revert **only that task's declared `<files>`**:

```bash
git checkout -- <that task's tracked files>
```

and delete any untracked files it created. A0b guarantees waves are file-disjoint, so this can never touch a sibling's work — but never use a blanket `git checkout .` or `git stash`, which would destroy the other agents' in-flight work. Without this, attempt 2 reads attempt 1's wreckage as if it were existing code and works *around* it, and `/debug` receives three failures layered together.

- Attempt 1 failed: restore that task's files, then spawn a fresh background agent (no `isolation`) for that task only, with the full error in its prompt. The wave's passing tasks are NOT re-run.
- Attempt 2 failed: restore, then spawn again with both previous errors included.
- Attempt 3 failed: restore, then **STOP. Say "3-attempt rule triggered on task [id]. Invoking /debug."** Then invoke `/debug`. Do NOT attempt a 4th time.

A wave is not complete until all its tasks have either PASSed or been escalated (to /debug or manual resolution). Do not advance to the next wave with an unresolved failure.

---

## Step 5 — Local verification

**Write the phase marker** before running `/local-test`: `schemaVersion: 1`, `phase: testing` (the
testing phase, displayed as Lookout), `role: builder`, `updated: <ISO-8601 UTC now>`,
`skill: run-tasks`, `detail: Step 5 — local-test`.

After all waves pass, run `/local-test 2` to verify the full build, all tests, and end-to-end smoke test pass with the changes.

If `/local-test` fails:
- Show the failure to YOUR_NAME
- Do NOT proceed to commit — fix the issue first
- If Docker is not available, fall back to `/local-test 1` (build + unit tests only) and note that integration testing was skipped

If `/local-test` passes, proceed to Step 6.

---

## Step 6 — Goal gate (if goal was defined)

**Write the phase marker** before running the gate: `schemaVersion: 1`, `phase: testing` (the testing
phase, displayed as Lookout), `role: builder`, `updated: <ISO-8601 UTC now>`, `skill: run-tasks`,
`detail: Step 6 — goal gate`.

If a goal was defined in Step 2 (or the user defined one via option A), run the e2e gate now:

- **Automated modality** (API/integration test, UI automation, graded eval): run it via `/local-test e2e`.
- **Structured human acceptance** (no machine oracle): show the ACTUAL behavior using the story's observability plan, then ask YOUR_NAME to sign off against each acceptance criterion.

**If the gate is green (or YOUR_NAME accepts):** proceed to Step 7.

**If the gate FAILS:** do NOT blind-retry. Observe the actual state → compare intended vs implemented vs observed → root-cause → fix → re-run. The 3-attempt rule applies to the gate too. Three evidence-based re-approaches without a green gate → invoke `/debug`.

If no goal was defined (user chose option B in Step 2), skip this step.

---

## Step 7 — When all waves are done

Say:

> All [N] tasks across [W] waves for #$ARGUMENTS are complete. Local tests passed. [If goal gate ran: "Goal gate green."] Run `/story $ARGUMENTS` Phase 4 to commit and raise the PR, or handle git manually using the steps in `tasks/lessons.md`.

---

## Hard rules

- Never commit anything — that is Phase 4's job
- **Never spawn a wave agent with `isolation: "worktree"`** — a worktree forks from the default branch and sees only committed state, and nothing is committed until the story's PR phase, so a dependent wave cannot see the files the earlier waves just wrote (`rules/wave-execution.md`)
- Check the branch hasn't drifted before AND after every wave — a branch changing mid-run means another session is sharing this directory, and it is a contradiction pause-anyway trigger, never self-answered
- Restore a failed task's declared `<files>` before each retry — never a blanket `git checkout .` or `git stash`, which would destroy sibling agents' in-flight work
- In mode A, never skip a STOP checkpoint between waves. In mode B, always stop on failure/blocked — never auto-continue past errors
- Never start Wave N+1 while Wave N has an unresolved FAIL or BLOCKED
- If YOUR_NAME says "stop" at any point — stop immediately, show which tasks are ✅ done and which are pending, and which wave you were on
- 3 failures on any single task → invoke `/debug`, never attempt a 4th time
- Manual tasks are never spawned as agents — always displayed as human instructions
- A task is only ✅ when its `<verify>` command passes — verify commands MUST include running relevant tests