---
name: run-tasks
description: Execute XML tasks from todo.md wave by wave (Phase 3 only — no understand, no plan, no PR). Use when resuming a story that already has a task plan. Usage: /run-tasks <story-id> [--auto]
argument-hint: Story ID e.g. 9950
---

**Core Philosophy:** Execute only — read the XML plan from todo.md and run each wave; planning and PR are /story's job.

**Triggers:** "run tasks for #9950", "execute the task plan", "continue execution", "pick up from Phase 3", "resume wave execution"

---

Parse `$ARGUMENTS`:
1. **Extract flags:** strip `--auto` if present. `--auto` → auto-run all waves without pausing between them (still stops on failure).
2. **Story ID:** the remaining argument after stripping flags.

You run the pending XML tasks for story **#[story ID]** from `todo.md`. No planning, no PR — just execution.

---

## Step 1 — Find the task plan

Read `YOUR_PROJECT_ROOT\tasks\todo.md`.

Search for a `<tasks story="$ARGUMENTS">` block. Extract all `<task>` elements from it. Skip any task already marked `✅`.

If no `<tasks>` block exists for this story, stop immediately and say:

> No XML task plan found in todo.md for #$ARGUMENTS. Run `/story $ARGUMENTS` first to generate one.

---

## Step 2 — Check git state

Run:
```bash
cd YOUR_PROJECT_ROOT && git status && git branch --show-current
```

Confirm you are on the correct feature branch for story #$ARGUMENTS. If you are on `master`, say so and ask YOUR_NAME to confirm the branch before continuing.

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

For **each wave**, in ascending group order:

### A. Announce the wave

Say: **"Wave [n]/[total] — launching [k] task(s) in parallel: [task names]"**

### B. Launch all tasks in the wave

For **each task** in the wave:

- If `type="auto"`: spawn a `story-executor-agent` as a **background agent** with `isolation: "worktree"`, passing:
  - The single `<task>` XML block
  - Story ID: $ARGUMENTS

- If `type="manual"`: do NOT spawn an agent. Instead, display the full `<action>` content as instructions for YOUR_NAME to follow, then treat it as BLOCKED pending human confirmation.

Launch ALL auto tasks in the wave simultaneously (one Agent call per task, all in the same message). Do not wait for one before launching the next.

### C. Wait for all background agents to complete

Do not output anything while waiting. The platform will notify you as each agent finishes. Collect all results before proceeding.

### D. Show the consolidated wave result

Display a result table:

| Task | Name | Result | Summary |
|---|---|---|---|
| 1 | "Add QueryFilters record" | ✅ PASS | Created QueryFilters record, updated QueryRequest |
| 2 | "Update ConversationManager" | ✅ PASS | Replaced LastEmployer/LastPlanYear with LastFilters |
| 3 | "Update RagQueryService" | ❌ FAIL | Build error: CS0246 type not found |

For any BLOCKED task, show:

| 4 | "Deploy to cloud" | ⚠️ BLOCKED | YOUR_INFRA_PERSON — must upgrade search tier |

### E. Update todo.md for all PASSed tasks in this wave

For each task that returned PASS: mark it done in `tasks/todo.md` by prepending `✅` to its task name line. Do all updates in one Edit pass — not one per task.

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

- Attempt 1 failed: include the full error in the retry agent prompt. Spawn fresh background worktree agent for that task only. Re-run the rest of the wave's passing tasks are NOT re-run.
- Attempt 2 failed: spawn again with both previous errors included.
- Attempt 3 failed: **STOP. Say "3-attempt rule triggered on task [id]. Invoking /debug."** Then invoke `/debug`. Do NOT attempt a 4th time.

A wave is not complete until all its tasks have either PASSed or been escalated (to /debug or manual resolution). Do not advance to the next wave with an unresolved failure.

---

## Step 5 — Local verification

After all waves pass, run `/local-test 2` to verify the full build, all tests, and end-to-end smoke test pass with the changes.

If `/local-test` fails:
- Show the failure to YOUR_NAME
- Do NOT proceed to commit — fix the issue first
- If Docker is not available, fall back to `/local-test 1` (build + unit tests only) and note that integration testing was skipped

If `/local-test` passes, proceed to Step 6.

---

## Step 6 — When all waves are done

Say:

> All [N] tasks across [W] waves for #$ARGUMENTS are complete. Local tests passed. Run `/story $ARGUMENTS` Phase 4 to commit and raise the PR, or handle git manually using the steps in `tasks/lessons.md`.

---

## Hard rules

- Never commit anything — that is Phase 4's job
- In mode A, never skip a STOP checkpoint between waves. In mode B, always stop on failure/blocked — never auto-continue past errors
- Never start Wave N+1 while Wave N has an unresolved FAIL or BLOCKED
- If YOUR_NAME says "stop" at any point — stop immediately, show which tasks are ✅ done and which are pending, and which wave you were on
- 3 failures on any single task → invoke `/debug`, never attempt a 4th time
- Manual tasks are never spawned as agents — always displayed as human instructions
- A task is only ✅ when its `<verify>` command passes — verify commands MUST include running relevant tests