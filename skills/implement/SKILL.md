---
name: implement
description: Build a feature from a tracker task (local task, GitHub issue, or Todoist task) or plain description — understand, plan, execute, evaluate, and PR in a streamlined flow. Lighter than /story — designed for solo devs and small teams. Usage: /implement <issue-id, task-title, or description> [--discuss] [--research] [--quick] [--auto] [--full]
argument-hint: "#42, 'Build login flow', or 'add dark mode to settings page'"
---

**Core Philosophy:** Understand it, plan it, build it, check it, ship it — with a human gate at each step. Like `/story` but without the sprint ceremony.

**Triggers:** "implement this", "build this feature", "work on issue 42", "implement #42", "build this", "pick up this issue"

---

You are the implementation orchestrator for YOUR_PROJECT_NAME. You will build: **$ARGUMENTS**

Run these phases in order — **Understand (1)** → **Goal Definition (1.5)** → Plan → Execute → Local Verify → Evaluate → PR. Each phase ends with a STOP checkpoint. **Do not advance without YOUR_NAME's confirmation.**

---

## Before you start

Read `YOUR_PROJECT_ROOT/tasks/notes.md` if it exists — it contains conventions, known fixes, and decisions.

```bash
cd YOUR_PROJECT_ROOT && git status && git branch --show-current
```

Parse `$ARGUMENTS`:

1. **Extract flags** into a set (strip them out before interpreting the rest):
   - `--discuss` → run a pre-plan clarification step (Phase 1a)
   - `--research` → run a codebase-scan step before the planner (Phase 1b)
   - `--quick` → skip Phase 3 (evaluation + acceptance testing)
   - `--auto` → auto-run all waves without pausing between them (still stops on failure)
   - `--full` → sugar for `--discuss` + `--research` (does NOT imply `--quick` or `--auto`)

   `--full`, `--quick`, and `--auto` are orthogonal and may be combined. Expand `--full` into the underlying two flags before proceeding.

2. **Classify the remaining arguments:**
   - **Detect the active tracker:** Read `.claude/.harness-manifest.json` → `tracker` field. If not set, fall back to `tasks/tracker-config.md` `**Type:**` field. If neither exists, default to `local`.
   - If the active tracker is `local`:
     - Numeric IDs (with or without `#`) → it's a **local task ID** — fetch via `trackers/active/get-issue.sh <ID>` (reads `tasks/issues/<ID>.md`)
     - Plain text description → **no ID given.** Offer to register it first so the work lands in the local task registry:
       > "No task ID given. Create a local task for this so it's tracked? (I'll run `create-issue.sh` and use the new ID — say "yes", or "skip" to build it ad-hoc without a registry entry.)"

       If YOUR_NAME says **yes**: `bash trackers/active/create-issue.sh "<description>" "" ""` → capture the new numeric ID from the output and treat it as the task ID from here on (the render hook regenerates `todo.md`). If YOUR_NAME says **skip**: proceed with the plain description and no registry entry — the zero-tracker escape hatch, still fully supported.
   - If the active tracker is `todoist`:
     - Quoted strings or task titles → it's a **Todoist task title** — search for it using `trackers/active/get-sprint-issues.sh` and match by title
     - Numeric IDs without `#` → it's a **Todoist task ID** — fetch via `trackers/active/get-issue.sh <ID>`
   - If they start with `#` or are a number (and tracker is `github`) → it's a **GitHub issue ID**
   - Otherwise → it's a **plain text description**

3. **Echo back** the parsed intent on one line, e.g. `Task: #42  |  Flags: --discuss --research` or `Task: "Build login flow" (Todoist)  |  Flags: --research`, so YOUR_NAME can catch a typo before anything else runs.

4. **Fetch task context** (if from a tracker):
   - For GitHub issues: `bash trackers/active/get-issue.sh <NUMBER>`
   - For Todoist tasks: `bash trackers/active/get-issue.sh <TASK_ID>`
   - For local tasks: `bash trackers/active/get-issue.sh <ID>` (reads `tasks/issues/<ID>.md`)
   - Use the fetched title, description, and acceptance criteria to enrich the planner's input.

Create a branch for this work:
```bash
git checkout -b implement/<issue-id-or-slugified-title>
```

---

## Phase 1 — Understand

Spawn a **`story-understand-agent`** (foreground) with this prompt:

> Story ID: [issue ID or "no issue — from description"]
> Task description: [the issue title/description or plain text from $ARGUMENTS]
> Sprint file path: none (this is an /implement run, not a sprint story)
>
> Produce the complete 8 pre-planning points for this task. If there is no sprint file, skip the sprint file reading step and rely on the tracker data and codebase scan instead.

Wait for it to return. Output its full result under the heading:

### Pre-planning brief for [task description]

**Write the handoff contract:** Save the full brief to `YOUR_PROJECT_ROOT/tasks/stories/<id>/brief.md`. Include all points produced by the agent.

Then say **exactly:**

---
**STOP 1 — Does this brief match your understanding of the task? Any corrections before I define the goal?**

*(Confirm to proceed to Phase 1.5. Say "yes" or give corrections.)*

---

Do NOT proceed until YOUR_NAME responds. If YOUR_NAME gives corrections, append them to `YOUR_PROJECT_ROOT/tasks/stories/<id>/brief.md` under a "Corrections from YOUR_NAME" section.

---

### Phase 1a — Discuss (only if `--discuss` is set)

Ask YOUR_NAME these 3 fixed questions in order, one at a time, waiting for an answer after each. If YOUR_NAME has already answered any of them in the original `$ARGUMENTS`, **skip that question** and note it as "(already answered)":

1. **Intent:** "In one sentence — what problem does this solve, or what does the user get out of it?"
2. **Hidden constraints:** "Anything I can't see from the code — perf budgets, compat requirements, related work in flight, stuff to avoid touching?"
3. **Anything else?** "Anything else I should know before planning? (Answer 'no' to skip.)"

Collect all answers verbatim. These are passed to the planner as a `User clarifications:` block. **Do not proceed to Phase 1.5 until all answers are in.**

### Phase 1.5 — Goal Definition (MANDATORY)

After Phase 1 (Understand) and Phase 1a (if run), define the **goal** before planning. This is what makes the implementation goal-driven: "done" is not "compiles + tasks ran" — it's this goal being met.

Work through this with YOUR_NAME — it is a short, mandatory step, not a full interview:

1. **What does end-to-end verification look like for this task?** Classify against the e2e modality menu:

   | Modality | What it proves | Typical task |
   |---|---|---|
   | **Automated test** (API / integration) | The system returns the right result through its real interface | backend / pipeline / multi-component |
   | **UI automation** | User clicks through and sees the right thing | UI-facing |
   | **Domain-specific graded evaluation** | Non-deterministic / AI output is correct, judged vs a ground truth | AI / generative / extraction |
   | **Structured human acceptance** | A human ruling / subjective UX call, signed off against the criteria | no machine oracle exists |

   The menu is OPEN — if none fit, define a new modality and note that the plan must include a task to build that probe/harness. Pick one or more.

2. **Is there a machine oracle?** Yes → the gate is an automated check. No → the gate is a **structured human acceptance check** (the actual behavior is still shown via observability, YOUR_NAME signs off).

3. **Write the acceptance criteria AS the gate.** Each criterion is phrased so the e2e gate directly checks it — one unified list, no paper-vs-test drift. Define the **concrete gate**: the exact check that must go green.

4. **Decide observability.** For each criterion, how will the ACTUAL state be seen (API response, log, trace, screenshot, structured query)? If it can't be seen with what exists, the plan must include a task to build a probe.

**Escape hatch:** for a change with zero runtime behavior (docs, comments, pure rename), YOUR_NAME may say "skip gate — no runtime impact"; log it and proceed.

Output the goal under the heading:

### Goal for [task description]
- **E2E modality:** [chosen — or new modality to build]
- **Machine oracle?** [yes → automated gate / no → structured human acceptance]
- **Concrete gate:** [the exact check that must go green]
- **Acceptance criteria (= the gate):** [the unified list]
- **Observability:** [how the actual state is seen per criterion, or "probe to be built as a task"]

Then say **exactly:**

---
**STOP 1.5 — This is the goal: [one-line modality + gate]. The task is done only when these acceptance criteria are met and this gate is green (or human-accepted). Approve this goal, or adjust it?**

*(Confirm to proceed to planning.)*

---

Do NOT proceed until YOUR_NAME responds. The confirmed goal is the input to the planner — it turns the goal into the test strategy + test/eval tasks.

### Phase 1b — Research (only if `--research` is set)

Launch a single **Explore sub-agent** (foreground) with this scope:

> Scan the codebase for existing functions, utilities, classes, patterns, or modules that the following task could reuse instead of writing new code:
>
> Task: [the task description or issue title]
> [If `--discuss` was run, include the User clarifications here]
>
> Return a **Reuse inventory** — at most 10 items, each one line:
> `path/to/file.ext:symbol — 1-line note on what it does and why it's relevant`
>
> Do not propose a design. Do not list files that merely exist; only list what would plausibly be reused. If nothing relevant exists, say "No reusable utilities found — this is greenfield."

Capture the inventory verbatim. It will be passed to the planner.

### Phase 1c — Plan

Spawn an **`implement-planner-agent`** (foreground) with the Phase 1 brief as input:

> Task: $ARGUMENTS (pass through exactly — issue ID or description, flags already stripped)
> Project root: YOUR_PROJECT_ROOT
>
> Pre-planning brief (from Phase 1):
> [full brief from the story-understand-agent]
>
> [If YOUR_NAME gave corrections] Corrections:
> [verbatim corrections]
>
> Goal (from Phase 1.5):
> - E2E modality: [chosen modality]
> - Machine oracle: [yes/no]
> - Concrete gate: [the exact check]
> - Acceptance criteria (= the gate): [the unified list]
> - Observability: [how actual state is seen]
>
> [If Phase 1a ran] User clarifications:
> 1. Intent: [answer]
> 2. Hidden constraints: [answer]
> 3. Anything else: [answer or "skipped"]
>
> [If Phase 1b ran] Reuse inventory:
> [verbatim inventory lines]

Wait for it to return the brief + plan. Output it under:

### Implementation plan

**Verify the handoff contracts:** The planner agent should have saved these files. Confirm each exists:
- `tasks/stories/<id>/plan.md` — the brief + XML task plan. **This is what `/run-tasks` reads to resume execution** if the session is interrupted; it lives in the always-local `tasks/stories/` workspace and works in every tracker mode.
- `tasks/stories/<id>/test-strategy.md` — acceptance criteria, integration scenarios, regression guardrails

If either is missing, extract the relevant section from the plan output and save it. The `test-strategy.md` file is critical — the acceptance-test-agent in Phase 3 reads it. Do **not** write the plan to `tasks/todo.md`: it is a generated dashboard (D9) and does not exist in tracker mode.

Then say **exactly:**

---
**STOP 1 — Review the plan above. [N] tasks planned. Say "go" to start building, or describe what to change.**

**Execution mode** (only show if the plan has 2+ waves AND `--auto` was NOT passed — omit entirely otherwise):
- **(A) Wave-by-wave** — I'll pause after each wave for your approval before continuing (default)
- **(B) Auto-run** — I'll run all waves back-to-back and pause only at the end (or on failure)

*(Say "go" or "go A" for wave-by-wave, "go B" for auto-run. Tip: use `--auto` flag to skip this question next time.)*

---

Do NOT proceed until YOUR_NAME responds.

**Plan revision stall detection:** If YOUR_NAME requests changes, re-run the planner with corrections. Track issue count across iterations. If issues don't decrease between consecutive iterations, stop: "Plan revision is stalling — (A) approve as-is, (B) adjust scope, (C) manual control." Max 3 revision iterations before escalating.

---

## Phase 2 — Execute (wave by wave)

Once YOUR_NAME approves, note the **execution mode**: if `--auto` flag was set, use mode B. Otherwise use what they chose at STOP 1 (A = wave-by-wave, B = auto-run; default A if not specified).

Parse the XML task plan from Phase 1. Group tasks by `parallel_group` into waves.

If there's only 1 wave (including the single-task case): execution mode is always A — skip the wave table and execute directly.

If there are multiple tasks, show the wave summary:

| Wave | Task IDs | Names | Type |
|---|---|---|---|
| 1 | 1, 2 | "...", "..." | auto, auto |

**Seed the live progress checklist first.** Before launching Wave 1, create a `TodoWrite` list with one
item per pending task (across all waves), using the plan's task names — for live visibility and to lock
in the work order before any code changes. (Skip for the single-task case — a one-item list is noise.)
`todo.md` stays the source of truth; this is its in-session mirror. See `rules/progress-tracking.md`.

For **each wave:**

**A0. Conflict check (only when the wave has 2+ tasks):** Compare every task pair's `<files>`. If any file appears in two tasks in this wave, they would run in separate worktrees and clobber each other at merge-back — auto-split: move the higher-id task into a new wave immediately after this one, renumber the rest, and show the updated wave table ("Wave [n] split due to file overlap in `[file]`."). If there's no overlap, proceed silently. (No-op for the single-task fast path.)

**A. Announce:** "Wave [n]/[total] — [task names]"

**B. Launch tasks:**
- `type="auto"` and `type="test"`: spawn each as a **background** `story-executor-agent` with `isolation: "worktree"`. Launch all in the same wave simultaneously. (A `type="test"` task is mechanically identical to `auto` — the executor writes the test/eval and runs its verify.)
- `type="manual"`: display instructions for YOUR_NAME.

**C. Wait for all to complete.** Show results:

| Task | Name | Result | Summary |
|---|---|---|---|
| 1 | "..." | PASS/FAIL/BLOCKED | [one line] |

**C2. Update the executor state:** Write/update `tasks/stories/<id>/executor-state.md` with the current progress table and wave log. Update after EVERY wave, not just at the end. This file is the resume state if the session is interrupted, and is read by `/improve-harness` for pattern detection. **In the same pass, mark each PASSed task `completed` in the `TodoWrite` list and mark the next wave's task(s) `in_progress`.** FAILed/BLOCKED tasks stay `in_progress` until resolved.

**D. STOP after each wave (behavior depends on execution mode):**

**If mode A (wave-by-wave):**

---
**Wave [n] complete: [passed] PASS, [failed] FAIL. Continue?**

---

Do NOT start the next wave until YOUR_NAME responds.

**If mode B (auto-run):**
- Show the wave result table so YOUR_NAME can see progress in real-time.
- **If all tasks passed**: say "Wave [n] ✅ — continuing to Wave [n+1]..." and proceed immediately. Do NOT wait for confirmation.
- **If any task FAILED or BLOCKED**: STOP and show the full wave result — auto-run pauses on failure. YOUR_NAME must respond before continuing.
- After the **final wave** (all waves done, all passed), show the full summary and proceed to Phase 2.5.

**On failure — 3-attempt rule:**
- Attempt 1-2 failed → re-spawn with error context
- Attempt 3 failed → **STOP.** Say "3-attempt rule. Invoking /debug." Invoke `/debug`.

---

## Phase 2.5 — Local Verification

After all tasks pass, run `/local-test 2` (or `/local-test 1` if Docker is not available — note that integration testing was skipped).

If tests fail → fix first, do NOT proceed.
If tests pass → proceed to Phase 3.

---

## Phase 3 — Evaluate + PR

**If `--quick` was passed:** Skip evaluation and acceptance testing, go straight to PR preparation.

**Otherwise:** Spawn **all four review agents in parallel** (foreground):

**Agent 1 — Evaluator:** Spawn an **`evaluator-agent`** with:

> Story ID: [issue ID or "implement/<branch-name>"]
> Plan path: YOUR_PROJECT_ROOT/tasks/stories/<id>/plan.md
> Scope: quick (if < 5 files changed) or full (if >= 5 files changed)

**Agent 2 — Acceptance Tester:** Spawn an **`acceptance-test-agent`** with:

> Story ID: [issue ID or "implement/<branch-name>"]
> Test strategy path: YOUR_PROJECT_ROOT/tasks/stories/<id>/test-strategy.md
> Plan path: YOUR_PROJECT_ROOT/tasks/stories/<id>/plan.md

**Agent 3 — Architect Reviewer:** Spawn an **`architect-reviewer-agent`** with:

> Story ID: [issue ID or "implement/<branch-name>"]

**Agent 4 — Security Reviewer:** Spawn a **`security-reviewer-agent`** with:

> Story ID: [issue ID or "implement/<branch-name>"]

Wait for **all four** to return. Show all reports.

**Write the handoff contracts:** Save each report under `tasks/stories/<id>/` — `evaluation.md`, `acceptance.md`, `architecture-review.md`, and `security-review.md`. `evaluation.md` is required, not optional: `/improve-harness` scans `tasks/stories/*/evaluation.md` for pattern detection and skips any story that lacks it, so without this the story is invisible to the learning loop.

**If evaluator hard gates fail:** Fix first, re-run evaluation.

**If acceptance test says NOT ACCEPTED:** Fix the failed criteria first. The feature doesn't work as intended.

**If architect-reviewer or security-reviewer has BLOCK findings:** Fix first. Architectural violations and security vulnerabilities cannot ship.

**If findings >= 75% confidence, acceptance gaps, or ADVISORY findings exist:** Show them. For each: YOUR_NAME says "fix" or "skip".

**e2e goal gate (skipped only with `--quick`):** Before PR, run the feature's e2e gate — the goal defined in Phase 1a / the test strategy. Run `/local-test e2e` for an automated modality, or for a no-oracle feature surface the actual behavior (per the observability plan) for YOUR_NAME to sign off. **"Done" is goal-met, not "compiles."** If the gate fails, do NOT blind-retry: observe the actual state → compare intended vs implemented vs observed → root-cause (route behavioral gaps to `/troubleshoot`, the 3-attempt trigger to `/debug`) → fix → re-run. Three evidence-based re-approaches without a green gate → STOP and invoke `/debug`; do not attempt a 4th (a blind repeat doesn't count as a re-approach). The gate blocks PR until green or human-accepted.

**After evaluation + acceptance + the e2e gate pass (or were skipped with `--quick`):**

Spawn a **`story-pr-agent`** (foreground) with:
- Story ID: [issue ID or branch name]
- Completed tasks: [list from Phase 2]
- Branch: [current branch]

Output the PR preparation report.

---
**STOP 3 — Review the commit messages and PR description above. Run the git commands shown, then say "push" when ready.**

---

Wait for YOUR_NAME to commit and push. Then create the PR:

```bash
gh pr create --title "<title>" --body "<body from PR agent>"
```

---

## Hard rules

- Never chain phases — always wait for confirmation at each STOP
- Never skip Phase 1 (understand) — the brief grounds planning in what the codebase actually looks like
- Never skip Phase 1.5 (goal definition) — the goal is the input to planning and the terminal condition; the only way past the gate is the explicit "skip gate — no runtime impact" escape hatch
- Never commit during Phase 2 — all commits happen in Phase 3
- If something fails 3 times → invoke `/debug`, do not keep trying
- If YOUR_NAME says "stop" at any point → stop immediately
- `--quick` skips evaluation, acceptance testing, and the e2e goal gate — never skips human gates, local tests, or Phase 1.5
- **"Done" is goal-met, not "compiles"** — outside `--quick`, the feature ships only when acceptance criteria are met and the e2e gate is green (or human-accepted for no-oracle features)
- `--discuss` and `--research` are additive, opt-in, and never change any STOP checkpoint — they run *before* Phase 1.5, not instead of it
- `--full` expands to `--discuss --research` at parse time; it does NOT imply `--quick`, so `--full --quick` is a valid, meaningful combo
- For 1-2 file changes, don't over-decompose into multiple tasks
- A task is only ✅ when its `<verify>` command passes — verify commands MUST include running relevant tests
- If NOT ACCEPTED by the acceptance-test-agent, the feature is not done — fix before PR
