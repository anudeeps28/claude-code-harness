# Retiring `/story` and `/run-tasks`: what they did, and where it lives now

ADR-0001 retires `/story` and `/run-tasks` only after a line-by-line check that nothing they do is
lost. This is that check (F7 #62). Every phase and gate of `skills/story/SKILL.md`, every step of
`skills/run-tasks/SKILL.md`, and every behaviour of the three story agents is listed with where
`/implement` covers it, or why it is moved or dropped.

**Pack check.** "Enterprise only" below means `/implement` does it only when
`.claude/.harness-manifest.json` says `"workflowPack": "enterprise"`. Solo installs never touch a
sprint file.

## `/story`, phase by phase

| `/story` | What it does | Where it lives now |
|---|---|---|
| Flags `--auto`, `--autonomous`, `--tdd` | Same meaning in both | Covered: `/implement` flags (`--auto`, `--autonomous`, `--tdd`), plus `--quick`, `--discuss`, `--research`, `--resume`, `--rework`, `--no-ship`, `--standalone` |
| Before you start: read `tasks/lessons.md` | Commit rules, Code Rabbit patterns, the 3-attempt rule | **Moved (#63):** `/implement` Before you start now reads `tasks/lessons.md`, else `tasks/notes.md`. It used to read only `notes.md`, so an enterprise install skipped its commit rules |
| Before you start: foreign-work check on a dirty tree | Show and ask; not self-answerable | Covered: `/implement` Before you start, same wording (`rules/wave-execution.md`) |
| Autonomous mode: self-answer, pause-anyway triggers, the `must_fail` carve-out | | Covered: `/implement` Autonomous mode (`rules/autonomous-mode.md`). **Dropped in #83:** the `must_fail` task itself, with the executor; the story loop's red step (`red-evidence.js`) takes its place |
| Decisions log is public in the PR: never secrets, tokens or PII | | **Moved (#63)** to `/implement` Autonomous mode, both packs |
| Durable `run-mode: autonomous` marker | | Covered: `executor-state.md`, read by `/implement --resume` |
| Phase marker at every phase | | Covered: `/implement` Phase marker |
| Phase 1: find the latest `tasks/sprint*.md` and give it to `story-understand-agent` | The sprint file holds notes, blockers and plans that are not in the tracker | **Moved (#63), enterprise only:** `/implement` Phase 1 passes the latest sprint file; solo passes "none" as before |
| Phase 1: brief saved to `brief.md`, STOP 1, corrections appended | | Covered: `/implement` Phase 1 |
| Phase 1.5: goal (modality menu, machine oracle, criteria as the gate, observability), STOP 1.5, the "skip gate" escape hatch | | Covered: `/implement` Phase 1.5, and since F3 a Proof / Seen by / Would lie if line per criterion |
| Phase 2: `story-plan-agent` with the brief, goal and corrections | | Covered by `implement-planner-agent` (Phase 1c). Its differences are listed under the agents below |
| Phase 2: plan and `test-strategy.md` saved; STOP 2 with the execution-mode choice (A wave-by-wave, B auto-run) | | Dropped in #83: there is no wave-by-wave or auto-run choice; the plan gate is the one stop, and a standalone story's Goal is saved in `brief.md`, not a `test-strategy.md` |
| Phase 2: plan revision stall detection (3 rounds) | | Covered: `/implement` Phase 1c |
| Phase 3: waves; branch-drift check before and after; overlap check (`<files>` and `<read_first>`); background executors with no isolation; stray-file check; restore before retry; 3-attempt rule | | Dropped in #83: there are no waves, overlap check or background executors; the branch-drift check, the restore before retry and the stray-file check stay (`rules/wave-execution.md`), and the 3-attempt rule is in the story loop |
| Phase 3: `type="manual"` tasks shown as instructions | | Dropped in #83: there is no task XML, so no `type="manual"` task |
| Phase 3: seed TodoWrite before Wave 1 | | **Dropped in #83:** there are no waves. The checklist (`rules/progress-tracking.md`) is seeded before the first story with one item per story, and an item is `completed` only after its review |
| Phase 3: mark ✅ in `plan.md` when a wave passes | | Dropped in #83: there is no ✅ on a task line any more; a story is done only after its review and the e2e gate, recorded as `step: done` in `executor-state.md` |
| Phase 3: `executor-state.md` after every wave | | Covered: the step record |
| Phase 3: STOP 3 after each wave in mode A, with the "deliberately red" note for a `must_fail` wave | | Dropped in #83: there are no waves or `must_fail` tasks; `--step` stops once in the build, at STOP 2 (the tests green) |
| Phase 3.5: `/local-test 2`, falling back to `1` without Docker | | Covered: `/implement` Phase 2.5 |
| Phase 3.6: four reviewers in parallel; reports saved; STOP 3.6 fix or skip; the ship test; deferrals registered | | Covered: `/implement` Phase 3. In a Feature, the full panel (F6) adds a fifth reviewer |
| Phase 3.7: the e2e goal gate; evidence-driven re-approach; `/troubleshoot` and `/debug`; blocks the PR | | Covered: `/implement` Phase 3 e2e gate, where NOT SET UP is also red (F3) |
| Phase 4: `story-pr-agent`; STOP 4 | | Covered: `/implement` Phase 3 PR step, same agent |
| Phase 4 under `--autonomous`: never auto-push from the default branch | `/story` could run on whatever branch was checked out | **Moved (#63)** to `/implement`'s PR step, both packs. `/implement` creates its own branch, but the check is cheap and a resumed run may not have |
| Test-first mode: waves, `must_fail` never restored, BLOCKED handling, `--autonomous` carve-out | | Dropped in #83: waves and `must_fail` are gone; `/implement` Test-first mode now covers the red evidence, and an already-met criterion is recorded as `shape: already-met` |
| Hard rule: follow the commit format in `tasks/lessons.md` | Includes the template's "never add Co-Authored-By" line | **Moved (#63):** `/implement` hard rule "follow the commit rules in lessons/notes". The co-author rule lives in those commit rules (`templates/tasks/lessons.md`), not hard-coded in the skill |
| Hard rule: "Never add Co-Authored-By: Claude Sonnet 4.6" | | Covered by the line above, through the lessons file |
| Every other hard rule | | Covered: `/implement` Hard rules |

## `/run-tasks`

| `/run-tasks` | Where it lives now |
|---|---|
| Find the plan in `tasks/stories/<id>/plan.md` | Covered: `/implement --resume <id>` (`bin/resume-point.js` reads `executor-state.md` and the plan) |
| Check git state and the goal; inherit `run-mode: autonomous` | Covered: `--resume` steps c and f |
| Group pending tasks into waves; run them with every wave rule | Dropped in #83: there are no waves or `to-run:` tasks; `--resume` re-enters the story loop at the saved `step:` (and `round:`) |
| Restore half-done tasks first; never a `must_fail` task | Dropped in #83: there are no tasks; `--resume` step d restores the step in flight (unstaged changes only, at `code`) |
| Local verification, then the goal gate if one was defined | Covered: `--resume` continues through Phase 2.5 and Phase 3 |
| Stop after execution: no review, no PR | **Dropped.** `--resume` carries the run to the end, because a run that skips the review has not finished. For "build without shipping", `--no-ship` stops before any git step |

## The three story agents

| Agent | Used by `/implement`? | Behaviour `/implement`'s agents lack | Decision |
|---|---|---|---|
| `story-understand-agent` | Yes, Phase 1 | Reads the sprint file's section for the story | **Kept.** Enterprise `/implement` now passes the sprint file (#63) |
| `story-pr-agent` | Yes, the PR step | Step 6 updates the sprint file's Master Status Table | **Kept**, with Step 6 run only on an enterprise install that has a sprint file (#63). In a Feature run, `/implement` updates each committed story's row itself at the Feature's PR, because no `story-pr-agent` runs per story there |
| `story-plan-agent` | No, `/story` only | One `<task>` per tracker child task | **Moved (#63), enterprise only, then changed in #83:** there is no `<task>` XML any more; `implement-planner-agent` names each child task in the story section's `Files:` lines, one line per child task, on an enterprise install |
| | | `DependencyInjection.cs` always in its own wave | **Dropped.** A .NET-specific rule. Dropped in #83: there are no waves and no task XML, so the overlap check that once kept two tasks off one file is gone too |
| | | `type="manual"` tasks alone and last | Dropped in #83: there is no task XML, so no `type="manual"` task |
| | | Parallelism rationale table | Dropped in #83: there are no parallel tasks to explain; a story is built by one builder at a time |
| | | Decision Brief coverage table | Covered in a lighter form: `implement-planner-agent` warns per unvalidated dealbreaker |
| | | Planner authority limits; quality checklist | Covered: `implement-planner-agent` authority limits and hard rules, plus `proof-check.js` and `demo.js` at plan approval |

So `story-plan-agent` is removed with `/story` (#64). `story-understand-agent` and `story-pr-agent`
stay, under their names: agent names are quality contracts, and renaming two agents across both packs
buys nothing.

## Every "moved" item

All landed in #63, each now in `/implement`:

- [x] Read `tasks/lessons.md` (else `notes.md`) — **Before you start**
- [x] Decisions log: never secrets, tokens or PII — **Autonomous mode**
- [x] Sprint file to `story-understand-agent` (enterprise) — **Phase 1**
- [x] One task per tracker child task (enterprise) — **Phase 1c** and `implement-planner-agent`; **changed in #83:** one `Files:` line per child task in the story section, not a `<task>`
- [x] Never auto-push from the default branch — **Phase 3**, the PR step
- [x] Commit rules from the lessons file — **Hard rules**
- [x] Master Status Table (enterprise) — `story-pr-agent` Step 6, and **The Feature's PR** in Feature mode
