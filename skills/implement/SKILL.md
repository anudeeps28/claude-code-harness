---
name: implement
description: Build a feature from a tracker task (local task, GitHub issue, or Todoist task) or plain description — understand, plan, execute, evaluate, and PR in a streamlined flow, or loop back on a rejected PR with `--rework <PR#>`. Lighter than /story — designed for solo devs and small teams. Usage: /implement <issue-id, task-title, or description> [--discuss] [--research] [--quick] [--auto] [--full] [--autonomous] [--rework <PR#>]
argument-hint: "#42, 'Build login flow', 'add dark mode to settings page', or --rework 58 'also rename the flag'"
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
cd YOUR_PROJECT_ROOT && git status --porcelain > "tasks/stories/<id>/.tree-baseline" 2>/dev/null; git status && git branch --show-current
```

**That baseline file is not optional.** Every post-wave stray-file check compares against it rather
than against a clean tree, and every review agent needs the path handed to it explicitly — it lives
under a gitignored directory, so nothing finds it by looking. See `rules/wave-execution.md` §1.

**Act on that output — do not just print it.** Per `rules/wave-execution.md`, treat it as possible foreign work when the tree is dirty **and** any of these hold:

- the current branch is already another story's branch (e.g. `implement/<some-other-id>`);
- another story's `tasks/stories/<other-id>/executor-state.md` shows an in-progress run with a recent `updated` timestamp;
- another story's `tasks/stories/<other-id>/phase.md` is fresh (freshness comes from `updated`, never from the file merely existing — see `rules/phase-markers.md`).

**Show what you found and ask.** Do not refuse outright, and do not proceed silently — a dirty tree is often YOUR_NAME's own scratch work, so the call is theirs:

```
This working directory has uncommitted changes that may belong to another story:

  branch: implement/<other-id>   (this run wants: <intended branch>)
  modified: <files>
  untracked: <paths>
  tasks/stories/<other-id>/phase.md — updated <N> minutes ago (phase: <phase>)

Building two stories in one folder commingles their uncommitted work — see
rules/git-worktrees.md. Recommended: build this story in its own worktree.

(A) Stop — I'll set up a separate worktree
(B) These are my own changes, continue here
```

This is **not** self-answerable under `--autonomous` — proceeding could destroy another run's uncommitted work, which fails the reversibility test. An autonomous run **pauses** here.

Parse `$ARGUMENTS`:

0. **Detect `--rework <PR#>` first — this is a MODE SELECTOR, not an additive flag.** If `$ARGUMENTS` starts with (or contains) `--rework <PR#>`, where `<PR#>` is the numeric PR number, extract it and treat any remaining free text after it as optional typed feedback. **Validate that `<PR#>` matches `^[0-9]+$` before using it anywhere** — if it is missing or non-numeric, stop and ask; never pass an unvalidated `<PR#>` into a `gh` command or a script argument. Unlike `--discuss`/`--research`/`--quick`/`--auto`/`--full`/`--autonomous` (which combine with the normal build flow), `--rework` **short-circuits** the entire Understand → Plan → Build → PR flow below and jumps straight to the Rework mode section further down this file. `--rework` is itself an **explicit autonomous entry point** — invoking the flag *is* the signal (the same role `--autonomous` plays for the forward flow), so it runs under the self-answer rule of `rules/autonomous-mode.md` without needing a separate `--autonomous`. If `--rework` is detected, skip steps 1-4 below and the branch-creation step, and go directly to that section.

1. **Extract flags** into a set (strip them out before interpreting the rest):
   - `--discuss` → run a pre-plan clarification step (Phase 1a)
   - `--research` → run a codebase-scan step before the planner (Phase 1b)
   - `--quick` → skip Phase 3 (evaluation + acceptance testing)
   - `--tdd` → **test-first mode**: the planner orders each behaviour slice as empty shell → failing test → real code. Off by default. Bug fixes are test-first even without it. `--quick` does not skip test-first. See **Test-first mode** below.
   - `--no-ship` → run everything up to but **not including** the git phase: no `git add`, `commit`, `push`, branch or worktree operation, and no PR. Stop after the reviews and the e2e gate, and report what *would* be committed. This is the terminal state an audit, a dry run, or a dogfooding exercise actually wants — without it the only way to end a run without touching git is to abandon it mid-flow, which leaves the story workspace claiming work is still in progress. Orthogonal to every other flag.

     **Where it stops, exactly** — three things a run needs told, because "stop before the git phase" left all three ambiguous in practice:
     - **Skip the branch creation** in "Before you start". It runs earlier in this file than the flag's own prohibition.
     - **Do not spawn `story-pr-agent`.** It performs *tracker* mutations (closing the item, updating the status table) rather than git ones, so "the git phase" does not obviously exclude it — but closing a tracker item for work that was never shipped is exactly the false record this flag exists to avoid. Draft the PR body yourself in the report if it is useful; change nothing outside the story workspace.
     - **Write the terminal phase marker yourself:** the six keys per `rules/phase-markers.md` with `detail: run complete — terminal state under --no-ship, no git operation performed`. Without it the workspace still claims work is in progress, which is the very problem the flag was added to solve.
   - `--auto` → auto-run all waves without pausing between them (still stops on failure)
   - `--full` → sugar for `--discuss` + `--research` (does NOT imply `--quick` or `--auto`)
   - `--autonomous` → run the entire flow with **no human STOP checkpoints** — self-answer reversible questions, pause only when genuinely blocked, auto-push and open a PR as the single human gate (see **Autonomous mode** below). Implies `--auto`.

   `--full`, `--quick`, `--auto`, `--tdd`, `--no-ship` and `--autonomous` are orthogonal and may be combined. Before proceeding, expand `--full` into its underlying two flags, and expand `--autonomous` to also set `--auto`. `--autonomous` does NOT imply `--quick` — evaluation, acceptance testing, and the e2e goal gate still run.

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

Create a branch for this work — **unless `--no-ship` was passed**, in which case skip this step
entirely and stay on the current branch. `--no-ship` forbids every git state change, and a branch
creation *is* one; this step runs before the flag's own prohibition is stated, so without the carve-out
here a literal reading creates a branch and then promises not to.

```bash
git checkout -b implement/<issue-id-or-slugified-title>
```

---

## Autonomous mode (only if `--autonomous` is set)

When `--autonomous` is set, run the **entire** flow — Understand → Goal → Plan → Execute → Local
Verify → Evaluate → PR — **without stopping at any human checkpoint**. The PR is the single human
gate. This mode changes *only* whether the flow pauses; it changes nothing about *what work is done*
— every phase (including Goal Definition and all safety machinery) still runs.

**Self-answer rule.** At every point where the flow would normally STOP and wait for YOUR_NAME:
- If the decision is **reversible** AND there is a clear recommended option → **take the recommended
  option, do not wait**, and append one line to the **decisions log** (see below).
- Otherwise → **pause and ask** (this is the only thing that stops an autonomous run mid-flight).

**Pause-anyway triggers** (an autonomous run stops and asks the human on any of these):
- a **contradiction** — the task, brief, or code conflict in a way you cannot reconcile with a recommendation;
- an **irreversible action** — anything destructive or hard to undo (deleting data, force-push, etc.);
- a **scope change** — the work turns out materially larger or different than the approved brief/goal;
- the **3-failed-attempts** rule fires (route to `/debug` as usual).

**One carve-out, and only one:** a `must_fail="true"` task reporting BLOCKED because **the behaviour
already exists** is self-answered, not halted — see **Test-first mode** below. Every other BLOCKED
cause halts as described here.

A task **FAIL or BLOCKED** result also halts the run — that is a genuine block, not a checkpoint, and
`--auto`'s "pause on failure" behavior is unchanged.

**Decisions log.** Keep a running list of every self-answered decision as
`- <question> → <chosen option> (reversible; <one-line why>)`. Accumulate it across all phases in the
shared sink `tasks/stories/<id>/decisions-log.md` (create it if absent) — inherited sub-skills append
to the **same** file — and surface it verbatim in the PR body under **"Decisions made on your
behalf"** (Phase 3).

**Propagation to sub-skills (inherited).** The full autonomous convention — the self-answer rule,
pause-anyway triggers, decisions-log sink, and inheritance mechanism — is centralized in
`rules/autonomous-mode.md`. Sub-skills and agents **inherit** the mode; they have **no `--autonomous`
flag of their own**. When `--autonomous` is set, `/implement` propagates the mode two ways:
1. **Invocation context** — every sub-skill/agent spawn below (`/local-test`, `/debug`, the executor
   and review agents) is told, in its invocation, that this is an autonomous run and to self-answer
   its checkpoints per `rules/autonomous-mode.md`, appending to the shared decisions-log.
2. **Durable marker** — write `run-mode: autonomous` into `tasks/stories/<id>/executor-state.md` (the
   file this flow already updates every wave), so a standalone resume (e.g. `/run-tasks <id>` after an
   interruption) inherits the mode without a live orchestrator.

`/local-test` and the review agents (evaluator / acceptance / architect / security) have no human
checkpoints, so the mode is a **no-op** for them — they always report back and never pause; their
findings' fix-vs-skip decision is self-answered here in Phase 3. `/debug` runs inherited-autonomous
and **self-drives** the diagnosis, pausing only if it cannot build a deterministic signal or exhausts
its hypotheses (see `rules/autonomous-mode.md`).

Throughout the phases below, any block that says **STOP** is **auto-resolved by the self-answer rule
above when `--autonomous` is set** — record the decision and proceed, unless a pause-anyway trigger fires.

---

## Phase marker

At every phase boundary, write `tasks/stories/<id>/phase.md` per `rules/phase-markers.md` — overwrite
it in full with the six plain `key: value` lines (`schemaVersion: 1`, `phase`, `role: builder`,
`updated`, `skill`, `detail`), immediately BEFORE spawning that phase's agent. This happens in every
run mode, interactive and autonomous alike — it is not gated on `--autonomous`. `role` is always
`builder` for `/implement`. See the concrete write points at each phase below.

---

## Rework mode (only if `--rework <PR#>` is set)

`--rework <PR#>` loops `/implement` back onto an already-open, already-reviewed PR instead of starting
a fresh build — mirroring the fetch → analyze → fix → reply → resolve pattern of
`skills/babysit-pr/SKILL.md`, but driving straight through it under autonomous self-answer semantics
(no gates until the push) rather than pausing at babysit-pr's four GATEs. `--rework` is an explicit
autonomous entry point in its own right (see step 0) — the flag is the signal, so this is not an
"inherited" run and needs no `--autonomous`.

**a. No fresh build.** On a valid `--rework`, do **not** run Phase 1 (Understand), Phase 1.5 (Goal
Definition), or Phase 1c (Plan). Do **not** create a new branch. Do **not** open a new PR.

**b. Check out the PR's existing head branch.** First confirm the PR's head is in *this* repo, not a
fork — a cross-repo (fork) head branch name is not fork-qualified, so a later push could silently land
on a same-named branch of `origin` instead of the contributor's fork:

```bash
gh pr view <PR#> --json isCrossRepository,headRefName,headRepositoryOwner
```

If `isCrossRepository` is `true`, **treat it as a pause-anyway trigger and stop** — you cannot safely
push to a fork's branch from here; ask the human. Otherwise check out the head branch:

```bash
HEAD_BRANCH=$(gh pr view <PR#> --json headRefName -q .headRefName)
git checkout "$HEAD_BRANCH"
```

Never create a new branch with `checkout` for this step — this is the same branch the open PR already tracks, not a new one.

**c. Fetch unresolved review threads.**

```bash
bash "YOUR_PROJECT_ROOT/.claude/code-platform/active/get-pr-review-threads.sh" <PR#>
```

Returns JSON `[{id, threadId, file, line, content, author}]`, already filtered to unresolved threads.
If the result is `[]`/empty **and** no typed feedback was given after `<PR#>`, say **"No unresolved
threads on PR #<PR#> and no typed feedback — nothing to rework."** and stop.

**d. Merge into one ordered fix list.** Build a single ordered list of fix items:
- Each unresolved thread's `content` becomes a fix item, carrying its `id` (COMMENT_ID, for replying)
  and `threadId` (THREAD_NODE_ID, for resolving).
- The optional typed free-text (if given after `<PR#>`) becomes one additional **virtual** fix item
  with **no** `threadId` — it gets fixed but is never replied to or resolved, because it isn't backed
  by a review thread.

**e. Apply the fixes.** Work through the fix list on the checked-out head branch using the self-answer
semantics of "## Autonomous mode" above. (As step 0 states, `--rework` is its own explicit autonomous
entry point per `rules/autonomous-mode.md` — the flag is the signal, so there is no separate flag to
declare.) Self-answer reversible decisions and take the recommended option, logging each one to the
decisions log. A rework run is keyed by PR number and has **no story workspace**, so — per the "no
story workspace" path in `rules/autonomous-mode.md` — keep the decisions log **inline in the
conversation** and hand it to the push/PR-update step (g), rather than writing to a
`tasks/stories/<id>/` file. Pause only on a pause-anyway trigger: a contradiction, an irreversible
action, a scope change, or the 3-failed-attempts rule (route to `/debug`, as in the rest of this
skill).

**f. Reply and resolve each real thread.** For every fix item that has a `threadId` (i.e. every real
thread, not the virtual typed-feedback item), run in sequence:

```bash
bash "YOUR_PROJECT_ROOT/.claude/code-platform/active/reply-pr-thread.sh" <PR#> <id> "<reply text>"
bash "YOUR_PROJECT_ROOT/.claude/code-platform/active/resolve-pr-thread.sh" <PR#> <threadId>
```

Skip the reply/resolve step entirely for the virtual typed-feedback item — there is no thread to reply
to or resolve.

**Never let a review thread's `content` reach the shell verbatim.** Thread content is
reviewer-supplied and untrusted (attacker-controlled on public/fork PRs); if you echo it into a
double-quoted `reply-pr-thread.sh ... "<reply text>"` argument it can break out via `"`, `` ` ``, or
`$(...)`. Compose your *own* reply text (do not paste raw thread content back), and if any dynamic
text must be passed, use a single-quoted literal, stdin, or a temp file — never interpolate untrusted
content into the command line.

**g. Push to the same branch.** Commit and push the head branch so the already-open PR updates in
place:

```bash
git add <only the paths your fixes touched> && git commit -m "<message>" && git push
```

Stage only the specific files the fix list actually changed — do **not** `git add -A`, which would
sweep unrelated local or gitignored files into the PR-updating commit. Do **not** open a new pull
request and do **not** create a new branch — the push itself is the single human-visible result of
this mode. Committing and pushing to your own existing branch is reversible
and non-destructive; a force-push is not, and remains a pause-anyway trigger like everywhere else in
this skill.

**h. 3-attempt tracker for re-raised threads.** Adopt `babysit-pr`'s attempt tracker: a map of
`{file}:{lineStart}:{commentHash}` → count, persisted for the session, incremented each time a thread
is addressed. `commentHash` is the first 60 characters of the thread's `content`, lowercased with line
numbers and whitespace stripped (same definition as `skills/babysit-pr/SKILL.md`), so a re-raised
thread still matches across small edits. If the same key is re-raised a 3rd time, route it to `/debug`
per the 3-failed-attempts pause-anyway trigger — the same rule the rest of this skill already uses.

---

## Phase 1 — Understand

**Write the phase marker** (per `rules/phase-markers.md`) before spawning: `schemaVersion: 1`,
`phase: planning` (the planning phase, displayed as Navigator), `role: builder`, `updated: <ISO-8601
UTC now>`, `skill: implement`, `detail: Phase 1 — story-understand-agent`.

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

*(In `--autonomous`: skipped — accept the brief as-is, log "brief accepted as understood", and continue. If the brief materially contradicts the task, that is a pause-anyway trigger.)*

---

Do NOT proceed until YOUR_NAME responds (unless `--autonomous`). If YOUR_NAME gives corrections, append them to `YOUR_PROJECT_ROOT/tasks/stories/<id>/brief.md` under a "Corrections from YOUR_NAME" section.

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

*(In `--autonomous`: the goal is still fully **defined** here — never skipped — but the confirmation is self-answered. Adopt the goal you defined, log "goal self-approved: [one-line gate]", and continue. The escape hatch ("skip gate — no runtime impact") is itself a reversible call you may self-answer.)*

---

Do NOT proceed until YOUR_NAME responds (unless `--autonomous`). The confirmed goal is the input to the planner — it turns the goal into the test strategy + test/eval tasks.

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

**Write the phase marker** before spawning: `schemaVersion: 1`, `phase: planning` (the planning phase,
displayed as Navigator), `role: builder`, `updated: <ISO-8601 UTC now>`, `skill: implement`,
`detail: Phase 1c — implement-planner-agent`.

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

*(In `--autonomous`: skipped — the plan is self-approved (log "plan self-approved: [N] tasks"), and because `--autonomous` implies `--auto`, execution runs in mode B. A materially wrong or oversized plan is a scope-change pause-anyway trigger.)*

---

Do NOT proceed until YOUR_NAME responds (unless `--autonomous`).

**Plan revision stall detection:** If YOUR_NAME requests changes, re-run the planner with corrections. Track issue count across iterations. If issues don't decrease between consecutive iterations, stop: "Plan revision is stalling — (A) approve as-is, (B) adjust scope, (C) manual control." Max 3 revision iterations before escalating.

---

## Phase 2 — Execute (wave by wave)

**Write the phase marker** before launching Wave 1: `schemaVersion: 1`, `phase: coding` (the coding
phase, displayed as Shipwright), `role: builder`, `updated: <ISO-8601 UTC now>`, `skill: implement`,
`detail: Phase 2 Wave 1 — story-executor-agent`. Update `detail` and `updated` (keeping `phase:
coding`) as execution moves between waves — write the full six-key marker per
`rules/phase-markers.md` on every wave transition.

Once YOUR_NAME approves, note the **execution mode**: if `--auto` flag was set, use mode B. Otherwise use what they chose at STOP 1 (A = wave-by-wave, B = auto-run; default A if not specified). `--autonomous` implies `--auto`, so an autonomous run is always mode B — the wave pauses never fire, but a FAIL/BLOCKED still halts the run exactly as mode B's "pause on failure" does.

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

Wave execution follows `rules/wave-execution.md` — the checks below are its concrete write-up for this skill.

**A0a. Branch-drift check (EVERY wave, including the single-task fast path):**

```bash
git branch --show-current
```

If it is not the branch this run created, **STOP immediately** — do not launch the wave. Another session sharing this working directory has switched the branch, and anything launched now writes this feature's work onto someone else's branch. Report expected vs actual and stop. This is a **contradiction** pause-anyway trigger — never self-answered, even under `--autonomous`.

**A0b. Overlap check (only when the wave has 2+ tasks):** Agents in a wave share one working directory, so this check is the only thing keeping them off each other's files. For every task pair, compare **both**:
- task A's `<files>` vs task B's `<files>` — two writers on one file
- task A's `<read_first>` vs task B's `<files>` — a reader against a writer; A reads for context while B rewrites, so A works from a half-written file. Silent — nothing in the build output reveals it.

On any overlap, auto-split: move the higher-id task into a new wave immediately after this one, renumber the rest, and show the updated wave table ("Wave [n] split due to file overlap in `[file]` (Task [x] writes, Task [y] reads)."). If there's no overlap, proceed silently.

**A. Announce:** "Wave [n]/[total] — [task names]"

**B. Launch tasks:**
- `type="auto"` and `type="test"`: spawn each as a **background** `story-executor-agent` — with **no `isolation`**, so it runs in this working directory on this branch. Launch all in the same wave simultaneously. (A `type="test"` task is mechanically identical to `auto` — the executor writes the test/eval and runs its verify.)

  **Never pass `isolation: "worktree"` here.** An isolated worktree forks from the default branch and sees only *committed* state, while this skill commits nothing until Phase 3 — so a dependent wave gets a copy without the files the earlier waves just wrote, and its `<verify>` fails on missing modules. See `rules/wave-execution.md` for the full rationale. Agents edit in parallel and serialize only on `<verify>`, via the lock in `agents/story-executor-agent.md` Step 3.
- `type="manual"`: display instructions for YOUR_NAME.

**C. Wait for all to complete.** Show results:

| Task | Name | Result | Summary |
|---|---|---|---|
| 1 | "..." | PASS/FAIL/BLOCKED | [one line] |

**C1. Post-wave integrity checks (both, every wave):**

*Stray-file check* — compare what changed **since this run started** against what the wave declared:

```bash
git status --porcelain | grep -Fxv -f "tasks/stories/<id>/.tree-baseline"
```

Compare against the run's own baseline, never a bare `git status`. The pre-flight check above
deliberately allows a dirty tree, so a run legitimately proceeds with dozens of pre-existing modified
files; measured against a clean tree, every one of them is flagged and the rule orders a stop after
**every wave of every run in a dirty tree**. Full reasoning, plus the known per-path limit, in
`rules/wave-execution.md` §1. Hand this path to every review agent — none of them can find it alone.

Every **newly** changed path must appear in some task's `<files>` (this wave or an earlier completed one). A path declared by **no** task means an agent edited outside its scope — the failure the overlap check cannot prevent, since it trusts the plan's file lists. Name the file and **STOP**; do not roll into the next wave. It may be a sibling agent's work being silently overwritten, and it will otherwise ship inside the story diff unnoticed. Ignore gitignored paths, the story workspace (`tasks/stories/<id>/`), and `tasks/.verify.lock` (a leftover lock means an agent died mid-verify — `rmdir` it and carry on; its own BLOCKED report already covers that).

*Branch-drift check* — re-run A0a. Checking both sides of a wave catches a hijack within one wave instead of at the end of the run.

**C2. Update the executor state:** Write/update `tasks/stories/<id>/executor-state.md` with the current progress table and wave log. Update after EVERY wave, not just at the end. This file is the resume state if the session is interrupted, and is read by `/improve-harness` for pattern detection. **In the same pass, mark each PASSed task `completed` in the `TodoWrite` list and mark the next wave's task(s) `in_progress`.** FAILed/BLOCKED tasks stay `in_progress` until resolved. **If `--autonomous` is set, include a `run-mode: autonomous` line in this file** so a standalone resume (`/run-tasks <id>`) inherits the mode (see the propagation contract in "Autonomous mode" above).

**D. STOP after each wave (behavior depends on execution mode):**

**If mode A (wave-by-wave):**

---
**Wave [n] complete: [passed] PASS, [failed] FAIL. Continue?**

[If this wave held a `must_fail` task that passed]: ⚠️ The test suite is **deliberately red** right now — `[test name]` fails on purpose, and Wave [n+1] is what makes it pass. If you run the tests at this checkpoint you will see a failure; that is the expected state, not a broken build.

---

Do NOT start the next wave until YOUR_NAME responds.

**If mode B (auto-run):**
- Show the wave result table so YOUR_NAME can see progress in real-time.
- **If all tasks passed**: say "Wave [n] ✅ — continuing to Wave [n+1]..." and proceed immediately. Do NOT wait for confirmation.
- **If any task FAILED or BLOCKED**: STOP and show the full wave result — auto-run pauses on failure. YOUR_NAME must respond before continuing.
- After the **final wave** (all waves done, all passed), show the full summary and proceed to Phase 2.5.

**On failure — 3-attempt rule:**
- Attempt 1-2 failed → **restore that task's files first, then** re-spawn with error context
- Attempt 3 failed → restore that task's files, then **STOP.** Say "3-attempt rule. Invoking /debug." Invoke `/debug`.

**Restoring a failed task's files (before every retry — see `rules/wave-execution.md`):** the agent left partially-applied edits in the shared working directory. Revert **only that task's declared `<files>`**:

```bash
git checkout -- <that task's tracked files>
```

and delete any untracked files it created. The overlap check guarantees waves are file-disjoint, so this can never touch a sibling's work — but never use a blanket `git checkout .` or `git stash`, which would destroy the other agents' in-flight work. Without this, attempt 2 reads attempt 1's wreckage as if it were existing code and works *around* it, `/debug` receives three failures layered together, and a stopped run leaves broken fragments in the diff beside the passing tasks' work.

---

## Phase 2.5 — Local Verification

**Write the phase marker** before running `/local-test`: `schemaVersion: 1`, `phase: testing` (the
testing phase, displayed as Lookout), `role: builder`, `updated: <ISO-8601 UTC now>`,
`skill: implement`, `detail: Phase 2.5 — local-test`.

After all tasks pass, run `/local-test 2` (or `/local-test 1` if Docker is not available — note that integration testing was skipped).

If tests fail → fix first, do NOT proceed.
If tests pass → proceed to Phase 3.

---

## Phase 3 — Evaluate + PR

**If `--quick` was passed:** Skip evaluation and acceptance testing, go straight to PR preparation
(write the `shipping` phase marker below before that step).

**Otherwise:** **Write the phase marker** before spawning the review agents: `schemaVersion: 1`,
`phase: reviewing` (the reviewing phase, displayed as Warden), `role: builder`, `updated: <ISO-8601 UTC
now>`, `skill: implement`, `detail: Phase 3 — evaluator/acceptance/architect/security review`.
Spawn **all four review agents in parallel** (foreground):

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

**Before any finding may be skipped, apply the ship test** (`rules/deferrals.md`): with this item left
undone, does the change behave incorrectly for its **real configured inputs** — the roster, config,
env, model or endpoint the project actually declares, not the values its tests use? If yes, it is a
blocker, not a deferral: fix it in-run, regardless of the agent's `ADVISORY` label or how large the
*ideal* fix would be (a one-line correction that makes the shipped behavior right is the blocker; the
proper redesign is the deferral — split them and test each separately). A green test suite is not
evidence of a No; tests can encode the defect.

To be exact about the two outcomes, because the phrasing below has been misread in a real run:
a finding that **fails** the ship test (a No — the shipped change behaves correctly without it) may be
deferred. A finding that **passes** the ship test (a Yes — the change behaves incorrectly for its real
configured inputs) is a **blocker: fix it in-run**, never a deferral. "Survives the ship test" in the
sentence below means *survived the fix-or-defer decision as a deferral* — i.e. a No.

**Every deferred finding is registered before the PR is opened** —
`bash .claude/trackers/active/create-issue.sh "<title>" "<body>" "deferred"` — and the PR's
"Deferred / follow-ups" section references it **by its tracker id**. A deferral bullet with no id is a
defect in the run, not a record.

**e2e goal gate (skipped only with `--quick`):** Before PR, run the feature's e2e gate — the goal defined in Phase 1a / the test strategy. Run `/local-test e2e` for an automated modality, or for a no-oracle feature surface the actual behavior (per the observability plan) for YOUR_NAME to sign off. **"Done" is goal-met, not "compiles."** If the gate fails, do NOT blind-retry: observe the actual state → compare intended vs implemented vs observed → root-cause (route behavioral gaps to `/troubleshoot`, the 3-attempt trigger to `/debug`) → fix → re-run. Three evidence-based re-approaches without a green gate → STOP and invoke `/debug`; do not attempt a 4th (a blind repeat doesn't count as a re-approach). The gate blocks PR until green or human-accepted.

**After evaluation + acceptance + the e2e gate pass (or were skipped with `--quick`):**

**Write the phase marker** before spawning `story-pr-agent`: `schemaVersion: 1`, `phase: shipping`
(the shipping phase, displayed as Harbormaster), `role: builder`, `updated: <ISO-8601 UTC now>`,
`skill: implement`, `detail: Phase 3 — story-pr-agent`.

Spawn a **`story-pr-agent`** (foreground) with:
- Story ID: [issue ID or branch name]
- Completed tasks: [list from Phase 2]
- Branch: [current branch]
- [If `--autonomous`] Decisions log: the contents of `tasks/stories/<id>/decisions-log.md` (the shared sink that `/implement` **and** every inherited sub-skill appended to) — the PR body MUST include a **"Decisions made on your behalf"** section rendering this list verbatim, so the reviewer sees every reversible call made without them.

Output the PR preparation report.

---
**STOP 3 — Review the commit messages and PR description above. Run the git commands shown, then say "push" when ready.**

*(In `--autonomous`: skipped — do not wait. Commit, push the branch, and open the PR yourself with the commands below. The PR is opened **as a normal (non-draft) PR** — it is the single human gate, so a pre-push stop would defeat the purpose. Committing/pushing your own branch and opening a PR are reversible and non-destructive; force-push or any history rewrite is NOT, and remains a pause-anyway trigger.)*

---

Wait for YOUR_NAME to commit and push (unless `--autonomous`, in which case do it now). Then create the PR:

```bash
gh pr create --title "<title>" --body "<body from PR agent>"
```

---

## Test-first mode (`--tdd`)

`--tdd` is **off by default**. Without it, and for anything that is not a bug fix, this skill behaves
exactly as it always has — the planner emits no `must_fail` attribute, and every rule below is inert.

**The one exception: bug fixes are test-first whether or not `--tdd` was passed.** For a bug the code
already exists, so there is no shell step and the cost is near zero, and the failing test is the proof
the bug was genuinely reproduced. Whether an item is a bug comes from the tracker's `Type:` line, never
from the wording of the description — see `agents/story-plan-agent.md` / `agents/implement-planner-agent.md`.

When the mode is on, the planner orders each behaviour slice as **empty shell → failing test → real
code**, three separate tasks in three consecutive waves (two for a bug fix, which needs no shell). The
full planning contract lives in the planner agent; the full execution contract lives in Step 3.5 of
`agents/story-executor-agent.md`. What this skill owns is below.

### Waves

A task carrying `must_fail="true"` **runs alone in its wave** (`rules/wave-execution.md`). Do not batch
it with siblings — another agent in the same wave can create the very behaviour the test is proving
absent, and the failing test goes green for a reason that has nothing to do with the test.

### A failed `must_fail` task is never restored

The standing rule — restore a failed task's declared `<files>` before retrying — is **exempt** for
`must_fail` tasks. For an ordinary task a failure means wreckage. Here it usually means the test passed
when it should not have, and the test file is intact and is the exact evidence needed to work out why.
Restoring deletes it and retries from nothing.

### When a `must_fail` task reports BLOCKED

The executor checks every machine-checkable cause first (zero tests ran, test skipped, file never
written, stale build, the test asserts nothing, the shell's default satisfied it, a "not implemented"
error treated as success, leftover state from another test). If it reports BLOCKED, the remaining
causes need a person:

- the behaviour **already exists** and nothing needs building
- the test is subtly wrong
- it exercises a mock rather than the real code
- it hit a different class with the same name
- the feature is switched on in test settings only

Show the executor's evidence and ask. **This never goes to `/debug`** — nothing is broken. `/debug`
diagnoses build and runtime failures; a test passing before its code exists means the plan rested on a
wrong assumption about the codebase, which is a planning decision. The 3-attempt rule must not route it
there either.

### Under `--autonomous`

One case is self-answerable, the rest are not:

- **The behaviour already exists** — checkable from the run: open the method and see whether it holds
  real code or an empty shell. If it holds real code, skip that slice, log the decision, and surface it
  in the PR under "Decisions made on your behalf". **Skipping the slice means dropping the
  implementation task, not the test.** The test that wrongly went green is a legitimate passing
  regression test for behaviour that genuinely exists — keep it. It also stays on disk anyway, because
  a `must_fail` task's files are never restored. Deleting it would throw away real coverage and hide
  that the plan was wrong about the codebase.
- **Every other BLOCKED cause** is a **pause-anyway trigger** per `rules/autonomous-mode.md` — a wrong
  assumption about the codebase is a scope problem, and scope problems are already on that list.

Because nobody is watching at the moment it happens, a run pausing here must report **what it left
behind** in the working directory.

---

## Hard rules

- Never chain phases — always wait for confirmation at each STOP — **unless `--autonomous`**, which auto-resolves every STOP via the self-answer rule (see **Autonomous mode**) and pauses only on a contradiction, an irreversible action, a scope change, or the 3-attempt rule
- Never skip Phase 1 (understand) — the brief grounds planning in what the codebase actually looks like
- Never skip Phase 1.5 (goal definition) — the goal is the input to planning and the terminal condition; the only way past the gate is the explicit "skip gate — no runtime impact" escape hatch
- Never commit during Phase 2 — all commits happen in Phase 3
- **Never spawn a wave agent with `isolation: "worktree"`** — a worktree forks from the default branch and sees only committed state, and this skill commits nothing until Phase 3, so a dependent wave cannot see the files the earlier waves just wrote (`rules/wave-execution.md`)
- Check the branch hasn't drifted before AND after every wave — a branch changing mid-run means another session is sharing this directory, and it is a contradiction pause-anyway trigger, never self-answered
- `--tdd` is off by default and orthogonal to every other flag; it never skips a phase, a gate or a STOP. **Bug fixes are test-first even without it** — the single exception to "no flag, no change"
- **Whenever test-first mode is on** — `--tdd`, *or* a bug fix with no flag at all — a defect found *after* the waves (a review finding, a failed acceptance criterion, a red e2e gate) is fixed **test-first too**: the failing test that reproduces it comes first. Say "test-first mode is on", never "under `--tdd`": scoping this to the flag exempts precisely the bug-fix run, the one case where test-first is not optional. This is where the discipline is most easily lost and matters most; a patch with no failing test behind it, inside a run reporting test-first compliance, is exactly the outcome the mode exists to prevent
- `--no-ship` stops the run cleanly before any git operation — everything up to and including the reviews and the e2e gate runs, nothing is committed, pushed or opened as a PR
- **`--autonomous --no-ship` is the audit / dogfooding combination.** `--autonomous` on its own ends by pushing and opening a PR, which is exactly what a dry run must not do; the two flags are orthogonal, and pairing them is how you get an unattended full-flow run that touches no git state. Say so explicitly rather than relying on the operator to notice they compose
- **`--quick` does not skip test-first** — `--quick` only skips checks that run *after* the build (review agents, e2e gate), and test-first happens *during* it. `--tdd --quick` is a valid combination
- A `must_fail="true"` task runs **alone in its wave**, is **never restored** after a failure, and a test that passes when it should have failed **never goes to `/debug`** — nothing is broken
- Restore a failed task's declared `<files>` before each retry — never a blanket `git checkout .` or `git stash`, which would destroy sibling agents' in-flight work
- If something fails 3 times → invoke `/debug`, do not keep trying
- If YOUR_NAME says "stop" at any point → stop immediately
- `--quick` skips evaluation, acceptance testing, and the e2e goal gate — never skips human gates, local tests, or Phase 1.5
- **"Done" is goal-met, not "compiles"** — outside `--quick`, the feature ships only when acceptance criteria are met and the e2e gate is green (or human-accepted for no-oracle features)
- `--discuss` and `--research` are additive, opt-in, and never change any STOP checkpoint — they run *before* Phase 1.5, not instead of it
- `--full` expands to `--discuss --research` at parse time; it does NOT imply `--quick`, so `--full --quick` is a valid, meaningful combo
- `--autonomous` skips only the **human STOP checkpoints** — it NEVER skips a phase, the goal definition, the evaluator/acceptance/e2e gate, local tests, or a failure pause; it implies `--auto` but NOT `--quick`, and it does not change any default or `--auto` behavior
- In `--autonomous`, every self-answered decision is logged and surfaced in the PR under "Decisions made on your behalf"; the PR is opened non-draft as the single human gate
- `--autonomous` propagates to invoked sub-skills and agents, which **inherit** the mode (no flag of their own) per `rules/autonomous-mode.md` — via invocation context plus a `run-mode: autonomous` marker in `executor-state.md`; `/local-test` and the review agents are no-ops, and `/debug` self-drives
- For 1-2 file changes, don't over-decompose into multiple tasks
- A task is only ✅ when its `<verify>` command passes — verify commands MUST include running relevant tests
- If NOT ACCEPTED by the acceptance-test-agent, the feature is not done — fix before PR
- Never skip a review finding without applying the ship test in `rules/deferrals.md` — a finding whose absence makes the shipped change behave incorrectly for its real configured inputs is a blocker, and no `ADVISORY` label, green test suite, or "the proper fix is bigger than this story" converts it into a deferral
- Never write a deferral as prose alone — register it as a tracker item at defer-time and cite its id in the PR; if the tracker call fails, say so explicitly rather than downgrading the item back to a sentence
- `--rework <PR#>` is a mode selector, not a fresh build — it checks out the PR's existing head branch, merges unresolved review threads with any typed feedback into one fix list, fixes + replies/resolves each real thread, and pushes to the SAME branch so the open PR updates in place. It NEVER opens a new PR or creates a new branch, is its own **explicit** autonomous entry point (the flag is the signal — it runs under the self-answer rule of `rules/autonomous-mode.md`, no `--autonomous` needed), and pauses only on a pause-anyway trigger.
