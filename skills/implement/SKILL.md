---
name: implement
description: Build a feature from a GitHub issue or plain description — understand, plan, execute, evaluate, and PR in a streamlined flow. Lighter than /story — designed for solo devs and small teams. Usage: /implement <issue-id or description> [--discuss] [--research] [--quick] [--full]
argument-hint: "#42 or 'add dark mode to settings page'"
---

**Core Philosophy:** Understand it, plan it, build it, check it, ship it — with a human gate at each step. Like `/story` but without the sprint ceremony.

**Triggers:** "implement this", "build this feature", "work on issue 42", "implement #42", "build this", "pick up this issue"

---

You are the implementation orchestrator for YOUR_PROJECT_NAME. You will build: **$ARGUMENTS**

Run these 3 phases in order. Each phase ends with a STOP checkpoint. **Do not advance without YOUR_NAME's confirmation.**

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
   - `--full` → sugar for `--discuss` + `--research` (does NOT imply `--quick`)

   `--full` and `--quick` are orthogonal and may be combined. Expand `--full` into the underlying two flags before proceeding.

2. **Classify the remaining arguments:**
   - If they start with `#` or are a number → it's a **GitHub issue ID**
   - Otherwise → it's a **plain text description**

3. **Echo back** the parsed intent on one line, e.g. `Task: #42  |  Flags: --discuss --research`, so YOUR_NAME can catch a typo before anything else runs.

Create a branch for this work:
```bash
git checkout -b implement/<issue-id-or-short-name>
```

---

## Phase 1 — Understand + Plan

### Phase 1a — Discuss (only if `--discuss` is set)

Ask YOUR_NAME these 3 fixed questions in order, one at a time, waiting for an answer after each. If YOUR_NAME has already answered any of them in the original `$ARGUMENTS`, **skip that question** and note it as "(already answered)":

1. **Intent:** "In one sentence — what problem does this solve, or what does the user get out of it?"
2. **Acceptance bar:** "How will we know this is done? What must be true for you to call it shipped?"
3. **Hidden constraints:** "Anything I can't see from the code — perf budgets, compat requirements, related work in flight, stuff to avoid touching?"

Then ask one **optional free-form tail:**

4. **Anything else?** "Anything else I should know before planning? (Answer 'no' to skip.)"

Collect all answers verbatim. These are passed to the planner as a `User clarifications:` block. **Do not proceed to Phase 1b/1c until all answers are in.**

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

Spawn an **`implement-planner-agent`** (foreground) with:

> Task: $ARGUMENTS (pass through exactly — issue ID or description, flags already stripped)
> Project root: YOUR_PROJECT_ROOT
>
> [If Phase 1a ran] User clarifications:
> 1. Intent: [answer]
> 2. Acceptance bar: [answer]
> 3. Hidden constraints: [answer]
> 4. Anything else: [answer or "skipped"]
>
> [If Phase 1b ran] Reuse inventory:
> [verbatim inventory lines]

Wait for it to return the brief + plan. Output it under:

### Implementation plan

**Verify the handoff contracts:** The planner agent should have saved these files. Confirm each exists:
- `tasks/stories/<id>/plan.md` — the brief + XML task plan
- `tasks/stories/<id>/test-strategy.md` — acceptance criteria, integration scenarios, regression guardrails
- `tasks/todo.md` — contains the `<tasks>` XML block for `/run-tasks` resumability

If any are missing, extract the relevant section from the plan output and save it. The `test-strategy.md` file is critical — the acceptance-test-agent in Phase 3 reads it.

Then say **exactly:**

---
**STOP 1 — Review the plan above. [N] tasks planned. Say "go" to start building, or describe what to change.**

---

Do NOT proceed until YOUR_NAME responds.

**Plan revision stall detection:** If YOUR_NAME requests changes, re-run the planner with corrections. Track issue count across iterations. If issues don't decrease between consecutive iterations, stop: "Plan revision is stalling — (A) approve as-is, (B) adjust scope, (C) manual control." Max 3 revision iterations before escalating.

---

## Phase 2 — Execute (wave by wave)

Once YOUR_NAME approves:

Parse the XML task plan from Phase 1. Group tasks by `parallel_group` into waves.

If there's only 1 task: skip the wave table, just execute it directly.

If there are multiple tasks, show the wave summary:

| Wave | Task IDs | Names | Type |
|---|---|---|---|
| 1 | 1, 2 | "...", "..." | auto, auto |

For **each wave:**

**A. Announce:** "Wave [n]/[total] — [task names]"

**B. Launch tasks:**
- `type="auto"`: spawn each as a **background** `story-executor-agent` with `isolation: "worktree"`. Launch all in the same wave simultaneously.
- `type="manual"`: display instructions for YOUR_NAME.

**C. Wait for all to complete.** Show results:

| Task | Name | Result | Summary |
|---|---|---|---|
| 1 | "..." | PASS/FAIL/BLOCKED | [one line] |

**C2. Update the executor state:** Write/update `tasks/stories/<id>/executor-state.md` with the current progress table and wave log. Update after EVERY wave, not just at the end. This file is the resume state if the session is interrupted, and is read by `/improve-harness` for pattern detection.

**D. STOP after each wave:**

---
**Wave [n] complete: [passed] PASS, [failed] FAIL. Continue?**

---

**On failure — 3-attempt rule:**
- Attempt 1-2 failed → re-spawn with error context
- Attempt 3 failed → **STOP.** Say "3-attempt rule. Invoking /debug." Invoke `/debug`.

---

## Phase 2.5 — Local Verification

After all tasks pass, run `/local-test 2` (or `/local-test 1` if Docker is not available).

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

**If evaluator hard gates fail:** Fix first, re-run evaluation.

**If acceptance test says NOT ACCEPTED:** Fix the failed criteria first. The feature doesn't work as intended.

**If architect-reviewer or security-reviewer has BLOCK findings:** Fix first. Architectural violations and security vulnerabilities cannot ship.

**If findings >= 75% confidence, acceptance gaps, or ADVISORY findings exist:** Show them. For each: YOUR_NAME says "fix" or "skip".

**After evaluation + acceptance pass (or were skipped with `--quick`):**

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
- Never commit during Phase 2 — all commits happen in Phase 3
- If something fails 3 times → invoke `/debug`, do not keep trying
- If YOUR_NAME says "stop" at any point → stop immediately
- `--quick` skips evaluation and acceptance testing — never skips human gates or local tests
- `--discuss` and `--research` are additive, opt-in, and never change any STOP checkpoint — they run *before* the planner, not instead of it
- `--full` expands to `--discuss --research` at parse time; it does NOT imply `--quick`, so `--full --quick` is a valid, meaningful combo
- For 1-2 file changes, don't over-decompose into multiple tasks
- A task is only ✅ when its `<verify>` command passes — verify commands MUST include running relevant tests
- If NOT ACCEPTED by the acceptance-test-agent, the feature is not done — fix before PR
