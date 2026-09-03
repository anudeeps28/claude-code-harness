# TDD Mode — Deep Dive Findings

**Date:** 2026-09-01
**Question:** What would it take to make `/story` and `/implement` genuinely test-first (spec → test → code)?
**Status:** Built. Grilling session complete (13 decisions, section 10); all eight instruction files, the four tracker adapters and the docs are changed; the doc-consistency probe is green. Remaining: the throwaway end-to-end rig (D13).

---

## 1. The short version

The harness already does **spec** well and **tests** thoroughly. What it does not do is **order** them
test-first. Tests are planned as real tasks, but always in the same wave as the code, or the wave after.

Nothing in the codebase enforces this in code. It is written instruction that Claude reads at runtime.
That makes the change cheap to make and easy to get subtly wrong.

---

## 2. What already exists (keep, do not touch)

| Piece | Where | Verdict |
|---|---|---|
| Goal definition before planning | `/story` Phase 1.5, `/implement` Phase 1a | Already the "spec" step. Reuse as-is. |
| `test-strategy.md` per story | written by both planner agents | Already the written spec. Reuse as-is. |
| Every code task gets a paired test task | `story-plan-agent.md:22` | Correct rule, wrong order. |
| Verify command must run tests, not just build | both planners, both skills | Keep. |
| Three levels of testing | `rules/test-philosophy.md` | Keep. Unaffected. |
| Post-build gates (local-test, 4 review agents, e2e gate) | `/story` 3.5-3.7, `/implement` 2.5-3 | Keep. Unaffected. |
| `/tdd` skill | `skills/tdd/SKILL.md` | Manual, behaviour-level. Not wired to anything. |

**Takeaway:** we are not adding testing to a harness that lacks it. We are re-ordering a harness that
already tests well.

---

## 3. No code changes needed

Searched `hooks/`, `code-platform/`, `install/`, `trackers/`, `scripts/` for anything that parses the
task XML — `type=`, `<task`, `parallel_group`. **Zero hits** outside one test fixture.

Consequences:

- Good: no schema migration, no parser rewrite. `npm test` cannot go red from this change.
- Bad: `npm test` also **cannot prove the change works**. The only safety net is doc-consistency
  probes (see section 6).
- Bad: a contradiction between two instruction files does not throw an error. Claude silently picks
  one. You get test-first on some runs and not others.

---

## 4. The three repeated decisions

### Decision A — "tests go after the code" (must flip)

- `agents/story-plan-agent.md:22` — paired test task, "same wave or the next"
- `agents/story-plan-agent.md:37` — ordering rule 5
- `agents/story-plan-agent.md:251` — plan checklist
- `agents/implement-planner-agent.md:126` — task type definition
- `agents/implement-planner-agent.md:138` — ordering rule 4
- `rules/test-philosophy.md:100` — "same or next wave after the code they test"

### Decision B — "a test task is identical to a code task, no special handling" (the real blocker)

- `skills/story/SKILL.md:324`
- `skills/implement/SKILL.md:470`
- `skills/run-tasks/SKILL.md:204` — says "No special handling" in those words
- `rules/wave-execution.md:63`

A failing-test-first step needs the opposite: it passes **when the verify fails**. All four must change.

### Decision C — "every plan must include test tasks" (already correct, leave alone)

- `agents/story-plan-agent.md:22`, `:251`
- `agents/implement-planner-agent.md:126`, `:248`
- `rules/test-philosophy.md:94`
- `CONTRIBUTING.md:117`
- `README.md:394`

---

## 5. Rules that actively fight test-first

These are the ones that make this more than a find-and-replace.

### 5.1 The failed-task restore rule deletes the test we just wrote

`rules/wave-execution.md:104` — before retrying a failed task, the orchestrator reverts that task's
declared files and deletes any untracked files it created.

That rule assumes **FAIL means wreckage**. For a test-first task, FAIL means "the test passed when it
should have failed" — the test file itself is usually fine, and it is the thing we need to inspect.
Restoring would delete it and retry from nothing.

Also restated as a hard rule in `skills/story/SKILL.md` and `skills/implement/SKILL.md`.

**Needs:** an explicit carve-out for test-first tasks.

### 5.2 The 3-attempt rule escalates to the wrong skill

Both skills: "If something fails 3 times, invoke `/debug`."

`/debug` diagnoses build and runtime failures. A test that passes before the code exists is not that —
it means the behaviour already exists, or the test is wrong. That is a **planner or human** call.
`skills/tdd/SKILL.md` already handles this correctly and stops to investigate. The wave machinery does not.

**Needs:** a different escalation path for a test that passes too early.

### 5.3 Compiled languages cannot run a test for code that does not exist

In C#/.NET (the primary target), `dotnet test` will not build if the class under test is missing. So the
test cannot fail *on an assertion* — it fails to compile, which is not a valid failing test.

**Needs:** a skeleton step first (signatures only, throwing not-implemented), making each slice:

```
wave N     skeleton — interface and signatures only
wave N+1   test — must fail on an assertion
wave N+2   implementation — makes it pass
```

That is roughly 1.5x the waves, so roughly 1.5x the wall-clock, per slice.

### 5.4 A resumed run would silently lose test-first

`/run-tasks` has no flags of its own. It inherits mode from its caller, or reads
`run-mode: autonomous` from `tasks/stories/<id>/executor-state.md` when resumed standalone
(`skills/run-tasks/SKILL.md:26`, `:108`).

**Needs:** the same treatment — persist the mode into `executor-state.md` so a resumed story keeps it.
There is an existing pattern to copy exactly.

### 5.5 Nothing stops the implementer from editing the test

The executor may only touch files in its `<files>` list, enforced by the scope rules plus the post-wave
undeclared-edit check (`rules/wave-execution.md:84`). So the protection exists — **but only if the
planner keeps the test file out of the implementation task's `<files>`**. Today nothing tells it to.

**Needs:** a planner checklist item.

---

## 6. How we would verify a change that has no code

Existing pattern: `skills/implement/__tests__/rework-mode.probe.test.js`. It is not a code test — it
reads the instruction file and asserts the prose stays internally consistent as the file changes.

We should write the same kind of probe for TDD mode, asserting:

- every file that states Decision A states the new order
- every file that states Decision B documents the failing-test step
- the restore-rule carve-out exists in all three places that rule is written
- the mode is documented in the hard-rules block of both skills
- nothing that already worked regressed

Write the probe first, watch it fail, then fix the files. The change tests itself.

---

## 7. Proposed shape: a `--tdd` mode, not a new default

The harness already has combinable switches — `--quick`, `--auto`, `--full`, `--autonomous` — plus
`--rework` as a mode selector that short-circuits the flow (`skills/implement/SKILL.md:50-64`).
`--tdd` fits as an ordinary additive switch: it changes planning order and the meaning of one task
type, and changes nothing else.

Reasons not to flip the default:

- every run for every user changes at once
- costs about 1.5x the waves per slice
- no way to compare it against the current flow

`/story` has fewer flags than `/implement` (`--auto`, `--autonomous` only), so this adds the first
behaviour-shaping flag there.

---

## 8. Files in scope

**Must change (8):**

1. `agents/story-plan-agent.md` — ordering, task type, checklist
2. `agents/implement-planner-agent.md` — same
3. `agents/story-executor-agent.md` — the failing-test verify contract (the only genuinely new mechanic)
4. `skills/story/SKILL.md` — flag parsing, wave spawn, hard rules
5. `skills/implement/SKILL.md` — same
6. `skills/run-tasks/SKILL.md` — inherit the mode, wave spawn
7. `rules/wave-execution.md` — spawn rule, restore-rule carve-out
8. `rules/test-philosophy.md` — the ordering statement

**Keep in step (5):** `templates/tasks/stories/plan.template.md`, `README.md`, `CONTRIBUTING.md`,
`examples/tasks/todo.md`, `CHANGELOG.md`

**New (1):** a doc-consistency probe under `skills/<skill>/__tests__/`

**Possibly retire or re-scope (1):** `skills/tdd/SKILL.md` — see open question 8

---

## 9. Open questions for the grilling session

1. ~~Switch or default?~~ **SETTLED — a switch.** See section 10.
2. **Skeleton step** — its own task, or folded into the test task? Folding means fewer waves, but the
   test task then writes production code.
3. ~~Own type or attribute?~~ **SETTLED — an attribute.** See section 10. (Original wording:) `type="red"` versus
   `type="test" expect="red"`. The attribute is less disruptive to the four files that currently treat
   `type="test"` as ordinary.
4. ~~What happens when the test passes too early?~~ **SETTLED — see section 10.** (Original wording: stop and ask? Mark the behaviour as
   already built and skip the slice? Never `/debug`.)
5. **Restore rule** — exempt failing-test tasks entirely, or keep the test file and revert everything
   else?
6. **Bug fixes** — a regression test is naturally failing, no skeleton needed. Same path, or a shortcut?
7. **Does `--quick` skip the failing-test step?** Recommendation is no — it is cheap, and it is the
   whole point.
8. **What happens to `/tdd`?** Stays a manual behaviour-level tool, becomes the documentation for the
   mode, or gets retired.
9. **Does `--tdd` apply to every task, or only tasks that change behaviour?** Config edits, renames and
   doc changes have nothing to write a failing test against.
10. **What is the rollout?** Ship the switch, use it on this repo's own stories, then decide about the
    default.

---

## 10. Settled decisions (grilling session, 2026-09-01)

### D1 — It is a switch, not a new default

`--tdd` on `/story` and `/implement`. With the switch off, every run must behave exactly as it does
today, bit for bit.

Cost accepted: several rules now need two branches ("normally X, in TDD mode Y") written across
multiple files, which is more prose and more chance of drift. Paid deliberately, because there is no
code and no test suite covering this, so shipping it as a default would be shipping an unmeasured
change to every run.

### D2 — The mode is carried on the task, as an attribute

`type="test" must_fail="true"`.

The executor is a fresh agent that only sees one task block, so the mode has to travel in the task
itself. An attribute rather than a new `type` value, because four files currently state that a test
task is ordinary and list the types — an attribute leaves all of them true as written, needing only
one added sentence. A plan written without the attribute behaves exactly as today, which is what D1
requires.

Known cost: an attribute is easier for a planner to forget than a type. Covered by a planner
checklist item and the probe test.

Wording is deliberately plain (`must_fail`, not `expect="red"`) — the executor should not need to know
what "red" means.

### D3 — What counts as a real failing test

**Flipping pass and fail is not enough.** A green result can lie for at least 15 different reasons, and
a red result can lie too. The point of the failing test is not the failure — it is the proof that the
test actually checks the thing we are about to build. A test that cannot fail before the code exists
will not fail after the code breaks either.

**A real failure:** the test failed **on an assertion** — expected X, got Y. It ran, reached our code,
and the behaviour is genuinely missing.

**A fake failure:** an error, not an assertion. Crashed in setup, missing fixture, null before it
reached our code, compile break. Tells us nothing. Broken test — fix and retry, no human needed.

#### Four prevention rules

| Rule | Removes |
|---|---|
| A `must_fail` task runs **alone** in its wave | another agent building it mid-run |
| The verify must force a fresh build — no `--no-build`, no cache | stale build |
| The verify must not contain `\|\| true` or anything that hides failure | masked result |
| The verify must name **one** test, not a whole suite | most "did it even run" cases |

#### Proof the executor must show before reporting anything

- the test file exists on disk and contains the test by name
- exactly one test ran, and it was ours
- it failed on an assertion — not an error, not a skip, not a compile break

#### All 15 reasons a should-fail test passes, and the response

| # | Reason | Detectable? | Response |
|---|---|---|---|
| 1 | The feature already exists | Partly — real code in the method, or just a skeleton? | **Stop and ask**, with the evidence |
| 2 | Never ran, filter matched nothing | Yes — zero tests ran | **Broken** — fix filter, retry |
| 3 | Test is wrong in a subtle way | No | **Stop and ask** |
| 5 | Test file never saved | Yes — file is not there | **Broken** — retry |
| 6 | Test marked skip | Yes — runner reports skipped | **Broken** — retry |
| 7 | Stale build | Yes — prevented by rule above | **Broken** — rebuild clean, retry |
| 8 | Verify hides the failure | Yes — read the command string | **Rejected at planning**, never runs |
| 9 | Asserts nothing real | Yes — does the test call our new method? | **Broken** — rewrite |
| 10 | Tests a mock, not our code | Weakly | **Stop and ask** |
| 11 | Hit a different class, same name | Weakly | **Stop and ask** |
| 12 | Skeleton default matched what the test expected | Yes — the agent wrote the skeleton | **Broken** — test must expect what the skeleton cannot return |
| 13 | Skeleton throws, test treats the throw as success | Yes — test catches it on purpose | **Broken** — rewrite |
| 14 | Another agent built it mid-run | Yes — prevented by the alone-in-wave rule | **Broken** — re-run |
| 15 | Leftover data from another test | Yes — re-run the test on its own | If it fails alone, **that is our failing test** — proceed, log the pollution |
| 16 | Feature is off normally, on in test settings | No | **Stop and ask** |

*(4 was a duplicate of 12 in the original numbering and is dropped.)*

**Nine caught by machine. Five go to the human, most with evidence attached.
None of them go to `/debug` — nothing is broken.**

**Verified against real `dotnet test`, 2026-09-01.** `scripts/tdd-rig.js` builds a throwaway C#
project whose `traps/run-traps.js` plants each machine-checkable trap as real code and asserts the
signal the executor keys off is genuinely in the runner's output. **10/10 present** — traps 2, 6, 7,
8, 9, 12, 13, plus a genuine assertion failure (the only case that may report PASS) and a compile
break (which must never count as one). This matters because the contract could otherwise have asked
the executor for evidence the runner never actually prints.

Under `--autonomous`, a "stop and ask" here is a **pause-anyway trigger** per
`rules/autonomous-mode.md`, not a self-answered decision. A test that passes before the code exists
means the plan rested on a wrong assumption about the codebase, and that is a scope problem.

### After the failing test goes green

The implementation wave must make that same test pass, and break nothing else. That is the second
gate, and it is the existing behaviour — unchanged.

### D4 — Three separate tasks per slice, three separate agents

```
step 1   empty shell   — class and method exist, do nothing
step 2   the test      — must fail on an assertion
step 3   the real code — the test now passes
```

The shell exists because a compiled language will not build a test against a class that does not
exist, so without it the test cannot fail for the right reason — it just never runs.

**Each step is its own task, so each gets a fresh agent.** This is already how the harness works (one
task, one executor agent, no shared memory), so nothing new is needed — but it must be written down
explicitly so the steps are never merged as an optimisation.

Why they must not be merged: an agent that writes both the shell and the test picks the shell's return
value *and* the expected value. Shell returns empty string, test expects empty string, test passes, we
conclude the feature already exists. That is reason 12. A second agent that did not choose the shell's
default is far less likely to write a test that accidentally matches it.

Cost: three waves per slice instead of two.

### D5 — The implementer may read the test, never edit it

The task that writes the real code needs to read the test to know what it must satisfy. It must never
be able to change it — otherwise a failing test can be quietly moved rather than met.

Mechanically: keep the test file in the implementation task's `<read_first>`, never in its `<files>`.
The existing scope rules and the post-wave undeclared-edit check then enforce it (see 5.5).

### D6 — A must-fail task is exempt from the failed-task restore rule

`rules/wave-execution.md:104` (restated as a hard rule in both skills) reverts a failed task's declared
files and deletes its untracked files before a retry. That rule assumes a failure means wreckage.

For a `must_fail` task a failure usually means the test passed when it should not have — the test file
is intact and is the exact thing that needs inspecting. Deleting it retries from nothing.

**Rule:** never restore a `must_fail` task's files. Stated as one exemption, not a
keep-this-delete-that split, because the task writes only the test file anyway.

Accepted risk: a genuinely messy failure leaves fragments with nothing to clean them up. Acceptable
because most of those cases stop and ask a human, who then sees them.

### D7 — Autonomous mode: self-answer one case, pause on the rest

Five of the fifteen reasons need a human. Left alone, `--tdd --autonomous` would stall on most slices
and stop being autonomous in any useful sense.

- **Reason 1 (the feature already exists)** is checkable: open the method and see whether it holds real
  code or an empty shell. An autonomous run **self-answers** this one — skips the slice, logs the
  decision, and surfaces it in the PR under "Decisions made on your behalf" (existing mechanism, see
  `rules/autonomous-mode.md`).
- **Reasons 3, 10, 11 and 16** are not checkable from the run. These stay **pause-anyway triggers**.

When an autonomous run pauses here, it must report what it left behind in the working directory —
there is no human watching at the moment it happens.

Rejected: banning `--tdd --autonomous` outright. The combo is worth having, and the harness already
has the log-and-surface mechanism this needs.

### D8 — Only behaviour changes go test-first, and a skip must be justified in writing

Some tasks have nothing to write a failing test against — renames, config values, doc updates,
package bumps. Forcing the three-step cycle on those produces empty ceremony and pushes agents to
invent meaningless tests, which is reason 9 (asserts nothing real).

**The line:** if the task changes what the system *does*, it goes test-first. If it changes how the
code *looks* or what it is *configured with*, it does not.

**The planner makes the call, and must write the reason into the plan** — not a bare "exempt" but a
stated why, visible at the plan approval step.

Why the written reason matters: without it, the cheapest way for a planner to satisfy the mode is to
declare everything a non-behaviour change, which silently turns `--tdd` off while appearing to
comply. A judgement call you can read and challenge is acceptable; a silent one is not.

### D9 — Bug fixes are always test-first, switch or no switch

**This amends D1.** With `--tdd` off, everything behaves as it does today *except* bug fixes, which go
test-first always. D1's "bit for bit identical" now has exactly one exception, and it must be written
that way everywhere — two files stating it differently is the drift this whole change is guarding
against.

Rationale: for a bug the code already exists, so there is no shell step and the cost is near zero. And
the failing test is the proof the bug was actually reproduced, which is the part people skip.

Bug fixes are **two steps, not three** — write the failing test, fix the code. No shell step.

### D10 — The tracker says whether it is a bug

The planner must not guess this from prose. It changes what gets built, so it needs a real source.

**Every adapter gains a `Type:` line in `get-issue.sh` output**, carrying the tracker's own word — not
a category we invent:

| Tracker | Source | Notes |
|---|---|---|
| ADO | `System.WorkItemType` | Already fetched, but printed inside the title heading — needs its own field. Passes through Story / Bug / Feature / Task as-is |
| GitHub | native issue type if enabled, else a `bug` label | |
| Local | new `type:` field in the issue file, falling back to labels | our own format, so do it properly |
| Todoist | a `bug` label | nothing else available |

**Only the value "bug" changes any behaviour.** Story, Feature, Task, and an empty type all behave
exactly as today unless `--tdd` is passed. So an empty type is safe by construction, and no tracker
blocks the feature.

Where the type is genuinely unavailable and it matters, the planner decides and writes down why —
same rule as D8.

Rejected: flattening every type into "bug" or "feature". We only need one question answered (is this a
bug?), so inventing a taxonomy for the rest throws away the tracker's real word for nothing.

**Scope note:** this adds four adapter files plus their tests. It is also the *only* part of this
release that real tests can prove — `trackers/__tests__/` runs in `npm test`. Everything else is
instruction prose, covered only by a consistency probe.

### D11 — `--quick` does not skip the failing test

`--quick` skips the checks that happen *after* the code is built (review agents, end-to-end gate).
Test-first happens *while* building, so skipping it would change what gets built — which is not what
`--quick` means anywhere else in the harness.

It is also the cheap part. The expensive step is the four review agents at the end.

`--tdd --quick` is a valid combination: test-first build, no review agents afterwards.

### D12 — `/tdd` stays, and is kept in step with the mode

`skills/tdd/SKILL.md` is not replaced and not deleted. Same rules, different scale:

- `/tdd` — a human and one behaviour at a time, interactive
- `--tdd` — a whole story, run by agents

It has to be kept in step deliberately, because it already got one thing right before we did: it stops
and investigates when a test passes before any code was written. When the definition of a real failing
test changes, both change together, and the consistency probe covers both.

### D13 — Rollout, and a throwaway end-to-end rig

Order:

1. **Fix the install gap first.** The live harness is `~/.claude/`, and its copy of
   `rules/test-philosophy.md` is older than this repo's. Shipping into that mismatch makes every
   problem ambiguous — new mode, or stale copy?
2. **Write the consistency probe first, watch it fail, then change the eight files.** Test-first
   applied to this change.
3. **Ship the tracker adapter work separately.** It has real tests and can prove itself on its own.
4. **Prove the mode on a throwaway project** (below).
5. **Revisit the default** afterwards, with evidence.

#### The throwaway rig

A separate project **outside this repo** — not committed, genuinely disposable. But **the script that
creates it is committed here**, so the rig is reproducible and the traps are documented; otherwise it
only ever exists on one machine.

- **C#**, not Node. The whole three-step design exists because compiled languages will not build a test
  against a class that does not exist. A Node fixture never exercises that constraint.
- **Local tracker** — no external calls, and it is one of the four adapters being changed.
- Seeded with real code, real tests and a real `lessons.md`, so agents behave as they would on a live
  project.
- **15 planted traps**, one per failure reason in D3.

Two kinds of run:

- **Happy path** — give it a feature, run `/implement --tdd`, confirm the order was shell, then failing
  test, then code.
- **Traps** — for each of the 15, confirm the agent either caught it by machine or stopped and asked,
  and never called `/debug`.

Honest limit: this cannot live in `npm test`. Every run spawns real agents and costs real time and
money. It is a rig run by hand before shipping, not per commit.

#### Built, 2026-09-01 — `scripts/tdd-rig.js`

`node scripts/tdd-rig.js <dir>` generates the project and installs this harness into it. It refuses a
target inside the repo. The rig splits into two layers, which turned out to matter more than the
original "15 traps" framing:

**Layer A — mechanical, free, repeatable.** `traps/run-traps.js` plants each machine-checkable trap as
real C#, runs real `dotnet test`, and asserts the signal the executor is told to key off is genuinely
in the output. This closes a gap the probe cannot: the executor contract could have demanded evidence
the runner never actually prints.

First run: **10/10 signals present** — traps 2 (zero tests ran), 6 (skipped, exit 0), 7 (`--no-build`
passing a now-failing test), 8 (`|| true` masking a real failure), 9 (vacuous assertion), 12 (stub
returning `0m` satisfying a test expecting `0m`), 13 (`Assert.Throws<NotImplementedException>`
passing against the correct shell), plus a **genuine** assertion failure (the only case that may
report PASS) and a **compile break** (visibly distinguishable via `error CS…`, so it can never be
mistaken for a real failing test).

Traps 1, 3, 10, 11 and 16 are unchecked by design — they are precisely the cases that look identical
from outside and must be escalated to a human with evidence.

**Layer B — agent runs. First run 2026-09-01, and it earned its cost immediately.**

Both planning agents read the *installed* prose (not the repo copy) and passed every structural check:
test before code, `must_fail="true"`, alone in its wave, verify naming one test with a fresh build and
no `|| true`, test file in `read_first` and never in `files`. The bug path correctly went test-first
**with no flag passed**, in two steps with no shell, quoting the rule it relied on — and read `Type:
Bug` from the tracker rather than inferring it from the description.

Then it found three things nothing else could have.

**1. The contract rejected its own textbook red.** The rule said a real failure "is an assertion
failure". But the shell throws `NotImplementedException`, so the first red on a feature slice is an
*exception* — verified in a real xUnit run, the message carries no assertion text at all. The executor
would have called the correct red a broken test and retried it, on **every feature slice**. Fixed: the
line is now *where the failure came from*, not whether it was an assertion. Still distinct from trap
13 — failing *because* the shell threw is valid; *passing* by asserting the throw is not.

**2. "Exactly one test ran" rejected every table-driven test.** A `[Theory]` with three `[InlineData]`
rows is one method reporting three cases (`Passed: 3`). The rule was meant to rule out a whole-suite
run, not tables. Reworded.

**3. The rig's seeded bug was not a bug.** `ApplyFlat(10.05, 50)` already returned the correct `5.02`.
The planner worked this out from the code and — unprompted — wrote into the task that the executor must
**not** invert the assertion or hunt for an input that fails, but report the unexpected pass instead.
That is the never-manufacture-a-failure rule applied to a situation nobody had planned for. The rig now
seeds a genuine defect (round the discount, then subtract → `5.03`), invisible to the existing tests.

**And my own trap was too weak to catch (1).** Trap R asserted only "1 failed, no compiler error" —
never the *kind* of failure. That is trap 9, a test asserting less than its name claims, in the trap
suite itself. Split into R1 (assertion mismatch) and R2 (shell throw), each asserting its distinct
signal, plus a new table-driven trap. Now **12/12**.

**The executor run then found two more.** Given one `must_fail` task against the now-genuine bug, it
correctly reported PASS for a *failing* test, walked all four proofs with quoted evidence, and
identified the failure shape. It also raised, unprompted:

**4. `RESULT: PASS` sitting above `VERIFY_RC=1` and `Failed!` is ambiguous.** Only a reader who
already knows the `must_fail` convention can parse it, and a misread marks a wave green when no code
was written. Now `PASS (must_fail — red achieved)`.

**5. The security note contradicted Step 3.5.** Proof 1 requires checking the test file exists on disk
and holds the named test; the security note allowed *only* the `<verify>` command and the lock
commands. The agent used a `grep`, then flagged that it had exceeded its stated permissions to satisfy
its own instructions. Now a narrow read-only carve-out scoped to `must_fail` tasks and to files already
in the task's `<files>` / `<read_first>`.

**The BLOCKED path was then run deliberately** — a `must_fail` test whose behaviour already existed.
The executor walked all seven machine-checkable causes, ruled each out with quoted evidence, reported
BLOCKED, named "the behaviour already exists" as the likely cause, and produced the method body as
proof. It never touched the assertion and never went near `/debug`. Exactly the designed path. It found
two more:

**6. The "shell default satisfied it" row assumed a shell exists.** Its remedy — "expect something the
shell cannot return" — applied to a method holding real code is an instruction to manufacture a red
against working code, contradicting "never weaken the test to produce a failure" in the same file. The
agent hit the collision, resolved it correctly, and flagged it. The row is now gated on the method
actually being a shell.

**7. The red window had no scheduling rule.** Between a `must_fail` task and its implementation the
tree is deliberately red, so any task whose verify runs the whole suite in that window fails through no
fault of its own — observed when a shell task was reported FAIL because an unrelated `must_fail` test
was still open. Both planners now close the window in the very next wave, schedule nothing else in it,
and forbid a second red while one is open.

**The shape-2 red was then run** — the case the original contract got wrong. The executor reported
`PASS (must_fail — red achieved)`, identified shape 2, and confirmed **no assertion text anywhere** in
the output. It also confirmed both earlier fixes were load-bearing, unprompted:

> "Without that carve-out in the instructions I would have had to read `Total: 3` as three tests and
> reported FAIL, which would have been wrong."

One more finding:

**8. No deviation rule covered an impossible `<action>`.** The planner had asked for `[InlineData]`
rows as decimal literals with an `m` suffix; C# forbids `decimal` in attribute arguments, so the
instruction could not compile. Deviation rules 1-4 all address defects in the **codebase** — none
addressed a defect in the **task**. Both nearest instincts are wrong: silently substituting hides the
planning error, BLOCKED stalls the run over notation. New rule 5: satisfy `<done>`, keep everything
else the action pinned, let `tasks/lessons.md` break ties between workarounds, and report what was
impossible under its own heading.

**`/story --tdd` was then run on an enterprise install** — the other half of the feature, previously
untested and not even present in the solo pack. It passed all eight structural checks, and quoted the
brand-new red-window rule back while applying it. It also anticipated the `[InlineData]`/`decimal`
problem at planning time without being told. Two more:

**9. The planners' "name exactly one test" rule was never given the `[Theory]` carve-out.** The
executor got it; the planners did not, so the two disagreed. The planning agent noticed and sidestepped
by mandating a `[Fact]`, leaving the question open for any slice that genuinely needs a table. Both
planners now carry the same wording.

**10. "Every code task gets a paired test task" collides with the shell task.** The shell *is* a code
task, and the only test you can write against it asserts `NotImplementedException` — trap 13, a false
green. The planner hit the collision and invented its own resolution. Now stated: the shell's pair is
the `must_fail` test in the next wave, and it gets no test of its own.

**The orchestrator and resume paths were then run** — `--autonomous` handling a BLOCKED, and
`/run-tasks` resuming with no memory of the flag. Both behaved correctly: the autonomous run
self-answered the already-exists case with evidence and logged it; the resume worked out from the plan
alone that the task was test-first, because the `must_fail` attribute travels in the plan file. Between
them they found **seven more**, and these were a different *kind* of finding — not mistakes in the new
prose, but **general rules elsewhere in the harness that quietly forbid what test-first requires**:

| # | The general rule | What it forbade |
|---|---|---|
| 11 | "A task FAIL or BLOCKED halts the run" (×3 files) | the one self-answered case — an autonomous run would pause exactly where the feature says it must not |
| 12 | "Skip that slice" | silent on the fate of the test that wrongly went green |
| 13 | run-tasks: "passes only when the test fails on an assertion" | the shell-throw red — the *normal* first red on a feature slice |
| 14 | run-tasks hard rule: "only ✅ when its verify passes" | ever marking a `must_fail` task done, since its correct outcome is a non-zero exit |
| 15 | run-tasks hard rule: "restore before each retry" | the never-restore exception that lives in the wave rules |
| 16 | "runs alone in its wave" | nothing enforced it — auto-split fires only on *file overlap*, so a file-disjoint sibling passed silently |
| 17 | the wave STOP message | never said the suite is deliberately red between the test and its fix |

Every one of them reads correctly on its own. That is precisely why none was caught by review: they
are not wrong, they are *unqualified*, and the qualification only becomes necessary once a mode exists
where a failing verify is the correct outcome.

All of these are contradictions this feature introduced or collided with, in prose that reads perfectly
well until an agent has to act on it. **Sixteen of the seventeen were invisible to both the probe and
the mechanical traps.**

Both orchestrator agents also flagged that the rig was not a git repository, so the branch-drift and
stray-file checks silently no-opped — a Layer B run skipping the safety net it was meant to exercise.
The generator now runs `git init` and commits a baseline.

**Finally the GREEN step was run** — the task that closes a deliberately-red test — completing the
three-step cycle end to end for the first time:

| Wave | Result |
|---|---|
| 1 — empty shell | PASS |
| 2 — failing test | `PASS (must_fail — red achieved)`, shape 2 |
| 3 — implementation | PASS; the red went green, full suite 7/7 |

The implementation did **not** copy the seeded rounding-order defect from `ApplyFlat`, which was the
trap in that task. Asked why its verify runs the named test before the full suite, the agent gave the
reason better than the doc did:

> "A green suite would be consistent with the wave-2 test having been skipped, filtered out, renamed
> away, or passing on some other file's behaviour... Each half proves something the other cannot."

## 11. The two full runs — the harness building for itself

Two complete `/implement` runs were made against the harness's own codebase, each delivering a real
feature. Between them they found nineteen more issues; all are fixed and locked into the probe.

**Run 1 — `/implement --tdd --autonomous 1`** built `hooks/lib/plan-lint.js`. Everything structural
held. It found nine problems, the worst being that **`Skill(implement)` served the stale user-level
copy** — 168 lines, no `--tdd` anywhere. The agent caught it only by diffing the two files by hand.
Had it not, the run would have executed a flow with no test-first in it and reported success.

**Run 2 — `/implement --autonomous 6`, deliberately without `--tdd`** — verified the fixes and tested
the one rule that must work with no flag at all. It decided test-first *from the tracker*, unprompted:

> "the tracker reports `Type: Bug`, so this is planned test-first without `--tdd`."

Three fixes proved themselves under real conditions: the stray-file check stopped **zero** times where
it would previously have stopped three on a 41-file dirty tree; the red evidence was recorded in the
mandated three-part form; and the run opened a **second, unplanned red window** for an in-run security
fix, because the post-build rule now says it must.

It then found nine more. The worst was the same disease as skill shadowing, one layer down:
`.claude/trackers/active/` was a **copy**, so adapter fixes never reached the running harness — and
the two halves of one adapter had drifted five weeks apart *from each other*. Dogfood now links them.

**Run 3 — `/implement --tdd --autonomous --no-ship 2`, the final verification.** 18 waves, 8
`must_fail` tasks, 557 tests green. Every verdict came back in the exact mandated wording, every red
carried a verbatim runner line, and the `plan-lint` hook — built by run 1 of this same flow — checked
this run's own `plan.md` and returned clean.

Three results worth keeping:

- **It caught its own hollow red.** One slice's timing test measured 2.03 ms against the *unfixed*
  quadratic code, because the fixture had no `>` in it and the engine bailed identically either way.
  That slice never had a genuine red window. The agent found it mid-run, proved the fix by hand
  instead, recorded the caveat at the moment it happened rather than retrofitting it, and registered
  the corrected fixture. This is the discipline holding at the level that is easiest to fake.
- **Every earlier fix held under load.** The stray-file check fired on nothing false across 18 waves
  of a 45-file dirty tree. The adapter symlinks were confirmed identical. The red evidence was written
  in the mandated three-part form both times.
- **The review agents caught what the wave gates structurally could not** — an unbounded settings
  append that would have re-registered a hook on every update, and a fail-open the module had just
  been hardened to remove. Every task verify was green and the suite was 553/553 at the time. A green
  `<verify>` on every task is not evidence the plan was complete.

It then found nine more, the worst being a contradiction between two normative documents about the
central invariant: §2b's auto-split moved displaced siblings into "a new wave immediately after" a
`must_fail` task — the wave the planners reserve for the implementation, and exactly what
`no_implementation_next_wave` condemns. The remedy created the violation.

**The pattern across all five runs is consistent.** Almost nothing was caught by the probe or the
traps. What agents find is the seams: a general rule that quietly forbids what the mode requires, a
file that is a copy where everyone assumed a link, a sentence that means two things. None of it is
visible by reading — only by acting.

**18. The executor had no tie-break between the `<action>` and `tasks/lessons.md`.** It is told to
follow both "exactly", and test-first makes that collision routine rather than rare — a plan
deliberately stages work so one task omits what a convention requires. The agent resolved it correctly
and flagged, unprompted, that `ApplyTiered(-10m)` now returns rather than throwing. The `<action>` now
wins explicitly, and the divergence must be reported — which is how "a later task will add validation"
avoids becoming validation nobody ever added.

The lesson worth keeping: a doc-consistency probe proves files agree with each other, and a mechanical
trap proves the signals exist. Neither can tell you the contract asks for the **wrong** signal, or that
two sections of it cannot both be obeyed. Only an agent actually doing the work finds that — and the
most valuable output of the run was not the verdicts, but the four "your instructions contradict what I
saw" notes the agents volunteered when explicitly invited to.

Install verified: 34 skills, 12 rules, `must_fail` present in the installed `implement`, executor and
wave-rules copies, tracker `local`, and `get-issue.sh` returning `Type: Story` / `Type: Bug` through
the installed adapter.
