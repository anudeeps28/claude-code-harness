# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/). This project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added

- **Test-first mode: `--tdd` on `/story` and `/implement`.** The harness already planned test tasks and gated hard on them, but always ordered them *after* the code — `type="test"` tasks went "in the same wave or the next wave after the code they test". `--tdd` reverses that: each behaviour slice is planned as **empty shell → failing test → real code**, three separate tasks in three consecutive waves, so three *different* fresh agents. The shell step exists because a compiled language will not build a test against a class that does not exist, so without it the test cannot fail for the right reason — it never runs. The steps are never merged, because an agent that writes both the shell and the test picks the shell's return value *and* the expected value and can satisfy its own test by accident. The implementer reads the test via `<read_first>` and may never list it in `<files>`, so a failing test gets met rather than moved. **The flag is off by default** and a plan carrying no `must_fail` attribute behaves exactly as before, with one deliberate exception: **bug fixes are test-first with or without the flag** (two steps, no shell — the code already exists, and the failing test is the proof the bug was actually reproduced). `--quick` does not skip it: `--quick` only skips checks that run *after* the build.
- **A `must_fail="true"` task has an inverted, evidence-based verify contract** (`agents/story-executor-agent.md` Step 3.5). Flipping pass and fail is *not* enough — a green result can lie in at least fifteen ways that have nothing to do with the feature, and a red one can too. A **real** failure is an **assertion** failure; an error, a skip, a compile break, or a run of zero tests is a broken test, not a failing one. Before reporting, the executor must show positive proof the test ran: the file exists on disk and contains the test by name, exactly one test ran and it was ours, it was not skipped, and it failed on an assertion. Four prevention rules remove four of the fifteen causes outright — the task **runs alone in its wave** (a sibling agent can create the very behaviour the test proves absent), the verify must force a fresh build (never `--no-build`), must never mask failure (no `|| true`), and must name exactly one test. Nine causes are then caught by machine and five are escalated to a human with evidence attached. **None of them go to `/debug`** — nothing is broken; a test passing before its code exists means the plan rested on a wrong assumption about the codebase, which is a planning decision. Under `--autonomous`, only the checkable "the behaviour already exists" case self-answers (logged, surfaced in the PR); the rest are pause-anyway triggers, and a run pausing here must report what it left behind.
- **A failed `must_fail` task is exempt from the restore-before-retry rule** (`rules/wave-execution.md`, restated in both skills). For an ordinary task a failure means wreckage and the files are reverted. Here a failure usually means the test passed when it should not have — the test file is intact and is the exact evidence needed to diagnose it, so restoring would delete it and retry from nothing.
- **Every tracker adapter now reports the item type.** `get-issue.sh` emits a `**Type:**` line carrying the tracker's own word (`Bug`, `Story`, `Feature`, `Task`) rather than a category of our invention — ADO from `System.WorkItemType`, GitHub from its native issue type or a `bug` label, Local from a new `type:` frontmatter field falling back to labels, Todoist from a `bug` label. The planner must take "is this a bug?" from the tracker, never from the wording of a description, because it now changes what gets built. **Only the value `Bug` changes any behaviour** — `Story`, `Feature`, `Task` and `Unknown` all behave exactly as before unless `--tdd` was passed, so a tracker that cannot report a type is safe by construction and never blocks planning.
- **`/tdd` is kept, and deliberately kept in step.** The existing skill (a human, one behaviour at a time, interactive) and the new flag (a whole story, run by agents) are the same discipline at two scales and now share one definition of a real failing test. It is not superseded: it got one thing right before the mode did — stopping to investigate when a test passes before any code is written.
- **New doc-consistency probe: `skills/implement/__tests__/tdd-mode.probe.test.js`.** Nothing in this repo parses the task XML — `type="test"`, `must_fail` and `parallel_group` are instructions read at runtime — so a contradiction between two files does not throw, it just makes Claude pick one, and you get test-first on some runs and not others. The probe asserts all twelve affected files agree: the flag is documented and parsed in both skills, `must_fail` is known everywhere it must be, the old code-first ordering is *qualified rather than deleted* (the default path still needs it), the restore carve-out exists in all three places that rule is written, every adapter emits `Type:`, and nothing that already worked regressed. It was written first and watched fail before any file was edited.
- **New throwaway end-to-end rig: `node scripts/tdd-rig.js <dir>`.** A doc-consistency probe proves twelve files agree with each other; it cannot prove that the *signals* the executor is told to look for actually appear in a real test runner's output. The rig generates a disposable C# project — real code, real passing tests, a real `lessons.md`, and a local tracker seeded with one Story and one Bug — then installs this harness into it. It is C#, not Node, deliberately: the empty-shell step exists **only** because a compiled language will not build a test against a class that does not exist, so a Node rig would never exercise the reason the design has three steps. The generator is committed; the rig it builds is disposable and lives outside the repo, so the traps stay documented and reproducible rather than existing on one machine. Two layers: **Layer A** (`traps/run-traps.js`) plants each machine-checkable failure mode as real C#, runs real `dotnet test`, and asserts the signal is genuinely present — no agents, no API calls, free to re-run; **Layer B** is the by-hand agent run (`/implement --tdd 1` for the feature, `/implement 2` for the bug) that checks the ordering, the alone-in-its-wave rule, and the `read_first`/`files` split. First Layer A run: **10/10 signals present**, covering traps 2, 6, 7, 8, 9, 12, 13, a genuine assertion failure, and a compile break.
- **A `NotImplementedException` from the method under test counts as a REAL failing test.** Found by the first end-to-end agent run, and it would have broken every feature slice. The contract originally said a real failure "is an **assertion** failure — expected X, got Y", with anything else classed as a broken test. But the empty shell's body is `throw new NotImplementedException()`, so the first red on a feature slice is an **exception**: verified in a real xUnit run, the message reads `System.NotImplementedException : The method or operation is not implemented.` and contains no assertion text whatsoever. The executor would have rejected the textbook correct red, every single time. The line is now drawn at **where the failure came from**, not at whether it was an assertion — an assertion failure *or* a `NotImplementedException` raised inside the method under test both prove the behaviour is absent, while a compile break, a crash in setup, or an exception from anywhere else prove nothing. Kept distinct from trap 13: a test that *fails* because the shell threw is valid, a test that *passes* by asserting `Assert.Throws<NotImplementedException>(…)` is asserting the shell rather than the behaviour and is still a false green.
- **A `must_fail` success is reported as `PASS (must_fail — red achieved)`, never a bare `PASS`.** Raised by the executor agent itself during the end-to-end run. On this one task type the polarity is inverted, so a success report sits directly above a verify output whose exit code is 1 and whose final line reads `Failed!`. A bare `PASS` there is only legible to a reader who already knows the convention, and the cost of a misread is a wave marked green when no code was written. The parenthetical is free and removes the ambiguity.
- **The executor's security note contradicted Step 3.5.** Also surfaced by the agent doing the work. Step 3.5 requires proving the test file exists on disk and contains the named test before reporting — which no `<verify>` command can do — while the security note permitted *only* the `<verify>` command and the verify-lock commands. A strict reading left the first proof unsatisfiable; the agent satisfied it with a `grep` and then flagged that it had exceeded its stated permissions to do so. There is now a narrow carve-out, scoped to `must_fail` tasks and to read-only inspection (`ls`, `cat`, `grep`, `head`, `tail`) of files already in the task's own `<files>` and `<read_first>` lists.
- **The "shell default satisfied the test" diagnosis now states its precondition.** Raised by an executor agent working the BLOCKED path. That row of the false-pass table prescribes FAIL with the remedy *"the test must expect something the shell cannot return"* — but it was written assuming the method under test **is** a shell. Applied to a method holding real code, the remedy becomes an instruction to manufacture a red against working code, in direct contradiction with the same file's *"Never weaken the test to produce a failure"*. The agent spotted the collision, resolved it correctly in favour of not weakening the test, and flagged it. The row is now gated on the method actually being a shell, and the case it was colliding with — the behaviour already exists — is explicitly a **BLOCKED**, never a FAIL.
- **The red window is now a scheduling rule.** Between a `must_fail` task and the task that makes it pass, the tree is *deliberately* red. Any task whose `<verify>` runs the whole suite during that window fails through no fault of its own — observed in a real run, where a shell task was reported FAIL because an unrelated `must_fail` test was still open. Both planners now require the implementation task to be the **very next wave**, forbid scheduling anything else in that window, forbid opening a second `must_fail` test while one is still red, and require the implementation's verify to run the named test *before* the full suite so a failure stays attributable.
- **New executor deviation rule 5 — the action is impossible as written.** Rules 1-4 all cover defects in the **codebase**; nothing covered a defect in the **task**. Found when a planner wrote an action requiring `[InlineData]` rows as decimal literals with an `m` suffix — C# forbids `decimal` in attribute arguments, so the instruction could not compile. The two nearest instincts are both wrong: silently substituting something that compiles hides the planning error from the planner who has to fix it, and reporting BLOCKED stalls a whole run over what is usually a notation problem. The rule now says: satisfy `<done>` (the real contract — `<action>` is only how the planner expected it to be met), keep everything else the action pinned, prefer the alternative that respects `tasks/lessons.md`, and report what was impossible under its own heading. Only if no conforming alternative satisfies `<done>` is it a genuine BLOCKED. In the observed case both `double` rows and string rows would have compiled, and the project's "money is `decimal`, never `double`" rule is what made strings the correct answer.
- **The shell task's pair is the failing test, not a test of its own.** Surfaced by a `/story --tdd` planning run. The quality checklist demands *every code task has a paired test task*, and the shell **is** a code task — but the only test you can write against a shell asserts `NotImplementedException`, which the same feature classifies as trap 13, a false green. The planner hit the collision and had to invent its own resolution on the spot. Both planners now state it: the shell's pair is the `must_fail` test in the very next wave, the shell gets no test of its own, and this needs no written exemption because a shell changes nothing about what the system does — which is the entire point of it.
- **The planners' "name exactly one test" rule now allows table-driven tests too.** The executor got this carve-out first; the planners did not, so the two disagreed. The planning agent noticed and sidestepped by mandating a `[Fact]`, leaving it unresolved for any slice that genuinely needs a table. Both planners now carry the same wording, plus the C# constraint that usually forces the decision anyway — attribute arguments must be compile-time constants of an attribute-legal type, so `decimal` cannot appear in `[InlineData]` (CS0182), and widening to `double` is not an acceptable substitute where the project says money is `decimal`.
- **Six general rules that quietly forbade what test-first requires.** All surfaced by orchestrator and resume agents doing the work; each reads correctly in isolation, which is exactly why none of them was caught by review. **(1)** *"A task FAIL or BLOCKED halts the run"* appears in `rules/autonomous-mode.md` and both skills with no exception, while the `--tdd` section says the already-exists case self-answers — an autonomous run reading top-to-bottom would pause precisely where the feature says it must not. Now carved out in all three, and only for that one case. **(2)** *"Skip that slice"* never said what becomes of the test that wrongly went green; it is kept, as a legitimate passing regression test, and it stays on disk anyway under the never-restore rule. **(3)** `/run-tasks` paraphrased the contract as *"passes only when the test fails on an assertion"* — narrower than the executor spec and wrong for the shell-throw red, which is the *normal* first red on a feature slice. **(4)** Its hard rule *"a task is only ✅ when its `<verify>` passes"* had no carve-out, so read literally a `must_fail` task could never be marked done — its correct outcome is a non-zero exit. **(5)** Its hard rule *"restore a failed task's `<files>` before each retry"* likewise lacked the exception that lives in the wave rules. **(6)** *"Runs alone in its wave"* was asserted but never enforced: the auto-split check fires only on **file overlap** and only on waves with 2+ tasks, so a `must_fail` task grouped with a file-disjoint sibling passed silently — the dangerous case, since a sibling touching different files can still create the behaviour the test is proving absent. `rules/wave-execution.md` now has a separate isolation check that splits on that ground alone.
- **The wave STOP now says when the suite is deliberately red.** A wave-by-wave run legitimately halts between the failing test and the code that fixes it, so a human running the tests at that checkpoint sees a failure and no explanation. All three skills now name the test and say plainly that the next wave is what makes it pass.
- **The rig is a git repository.** The wave machinery's safety checks — branch-drift before and after every wave, the stray-file check via `git status --porcelain`, restore-before-retry — all fail with *"fatal: not a git repository"* in a bare directory, so a Layer B run silently skipped the very safety net it was meant to exercise. Both orchestrator agents flagged it. `scripts/tdd-rig.js` now runs `git init` and commits a baseline.
- **The executor now has a stated tie-break between the `<action>` and the project conventions.** It was told both to follow `tasks/lessons.md` *"exactly"* and to follow the `<action>` *"precisely"*, with no precedence rule. Pre-existing, but test-first turns the collision from rare into routine: a plan deliberately stages work so that one task omits something a convention requires — validation deferred to a later task, a shell with no behaviour at all, a test written to fail. Following the convention instead silently merges two tasks and breaks the sequencing. The `<action>` now wins, **and the divergence must be reported** — naming the convention, quoting the override, and stating what is consequently missing. Found when an executor implemented a tiered discount without argument validation exactly as instructed, then flagged unprompted that `ApplyTiered(-10m)` now returns rather than throwing. That flag is the whole point: it is how "a later task will add validation" avoids becoming validation nobody ever added.
- **Dogfooding now links the tracker and code-platform adapters, not just skills/agents/hooks/rules.** The same disease as skill shadowing, one layer down: `.claude/trackers/active/` was a **copy** taken at install time, so every edit to `trackers/<name>/*.sh` was invisible to the running harness — a fix could be written, tested green, and still be dead code from the harness's own point of view. A real `/implement` run found the two halves of a single adapter five weeks out of sync **with each other** (`get-issue.sh` current, `create-issue.sh` stale), which is only possible because nothing links them. The adapter dirs can't be linked wholesale — the installer flattens one chosen adapter into `active/` — so the link target comes from the manifest, and an unknown tracker yields no link rather than a guess. New `scripts/dogfood-links.js` with 6 tests.
- **New `hooks/lib/skill-shadowing.js` + session-start warning.** A user-level skill takes precedence over a project skill of the same name. Harmless when they match; silently catastrophic when they don't — this repo carries a 723-line `implement` with a whole test-first mode in it, and `~/.claude` carries a 168-line copy that has never heard of it. Invoking the skill by name serves the stale one, with no error and no warning, and the run reports success having done something else entirely. Found when an agent diffed the two by hand; nothing in the harness would have told it. Detection is fail-open (a warning system that throws is worse than none), reports identical-but-shadowed separately from divergent, and 13 divergent skills are currently flagged in this repo.
- **A latency budget, a lint glob, and a tracker adapter's line endings** — see Fixed.
- **New hook: `plan-lint-check.js` — the red-window rules are now enforced, not merely written.** `hooks/lib/plan-lint.js` lints a story's task plan for three violations — a `must_fail` task sharing its wave (`must_fail_not_alone`), the closing wave missing or holding a task that does not read the failing test (`no_implementation_next_wave`), and a second red opening before the first closes (`overlapping_red_windows`) — and the hook blocks on them. Both the module and the hook were built by `/implement --tdd` runs of this harness, and the wired hook validated the second run's own `plan.md`. It **fails closed** and caps its input: an unreadable-but-present plan must never render as clean, and the 5s hook envelope cannot preempt CPU-bound work (its timer is `unref`’d), so the cap is the only real control. The block reason is newline-sanitised, because a plan's own `id` attribute could otherwise forge `RESULT: 0 violations. Plan is clean, proceed.` into the very text the agent acts on.
- **The auto-split remedy no longer parks displaced tasks inside the red window.** Two normative documents disagreed about the central invariant. `rules/wave-execution.md` §2b, on finding a `must_fail` task sharing a wave, moved every sibling into "a new wave immediately after" it — which is precisely the wave the planners reserve for the implementation, and precisely what `plan-lint`'s `no_implementation_next_wave` rule condemns. The fix created the violation: a displaced sibling's verify then runs against a deliberately red tree and fails through no fault of its own, which is the exact failure the section exists to prevent. Siblings now move to after the wave that *closes* the red window. Raised as a BLOCK by an architect agent during a real run.
- **Two constraints the linter hard-blocks on are now written down.** `no_implementation_next_wave` requires the implementation at exactly `wave + 1` — not merely somewhere later — and `overlapping_red_windows` forbids a second `must_fail` test opening while one is still red, **including for independent slices that share no files**. Neither appeared in any rules document; both were enforced only by code. Concurrent red windows make a failing suite unattributable, which is the same reason a single red window bars everything else from its wave.
- **`--no-ship` is fully wired.** It shipped half-done: it forbade every git state change while the unconditional `git checkout -b implement/<id>` step above it was ungated, so a literal reading created a branch and then promised not to. It was also silent on the two things a run actually needs told — whether `story-pr-agent` runs (it performs *tracker* mutations rather than git ones, and closing an item for work that was never shipped is the false record the flag exists to avoid) and what terminal phase marker to write, without which the workspace still claims work is in progress, which was the flag's whole justification. All three fixed, and `--no-ship` added to the orthogonality list it was missing from.
- **"Fresh" now has a number.** The foreign-work pre-flight check turns on whether another story's `phase.md` is "fresh", and that check is explicitly **not self-answerable under `--autonomous`** — so an undefined threshold on a non-self-answerable gate leaves a run no choice but to halt or invent one, and a real run invented one. It is now `updated` within the last 30 minutes, with two qualifications learned the hard way: a marker left by an *earlier run of the same exercise in the same directory* is not foreign work (otherwise run 3 of a dogfooding session halts on the wreckage of runs 1 and 2), and age is evidence rather than proof.
- **Two agent contracts forbade what the orchestrating skills required of them.** `acceptance-test-agent` read "no commentary outside the structured report" as a ban on writing `tasks/stories/<id>/acceptance.md`, which the skills require as a handoff artifact and `/improve-harness` silently skips stories without — it declined, and the orchestrator reconstructed the file by hand. And `story-executor-agent`'s "never modify `README.md`" made the project's own documented procedure for adding a hook impossible to execute with the agent the project uses to add hooks. Both now carve out exactly the required case and nothing more.
- **A table-driven test is one test method, not a suite run.** Also from the end-to-end run. The proof-of-execution rule said "exactly one test ran", but a `[Theory]` with three `[InlineData]` rows is one test method reporting three cases — confirmed by the rig, which sees `Passed: 3` for a single filtered method. Taken literally the rule rejected every table-driven test, which is a normal and desirable way to pin boundary values. It now rules out what it was always meant to rule out — a whole-suite run burying our result among dozens of others — while allowing a table whose every reported case belongs to the named method.
- **New skill: `/hackathon` — demo-deadline mode.** Works a queue of small changes one at a time: *fix → build → launch → the human looks → next*. Speed comes from cutting **process** — no story workspace, no planning agents, no evaluator, no PR gate — and explicitly never from cutting verification: the app is still built, the suite still runs before a push, and every change is looked at in the running app before handover. A change nobody looked at is not done. One item in progress at a time, tracked in `tasks/hackathon-<YYYY-MM-DD>.md` and mirrored into `TodoWrite`. The single condition that ends the mode is a change turning out to be architectural or riskier than it looked — that gets escalated, not hacked in. Stack-agnostic: build/test commands, branch-and-commit policy, and known build traps are all read from `tasks/lessons.md` (enterprise) or `tasks/notes.md` (solo), never hardcoded — including the branch policy, since trunk-based vs feature-branch is the project's call and a branch was never the slow part. Also carries the two false-green traps worth knowing under time pressure: a test that reads a file off disk passes even when the build failed, and an incremental build can test stale binaries.
- **`/to-issues` produces a dependency graph, not just a list.** The skill now creates a single **parent feature**, its stories as children, and a **blocked-by edge** (via `add-blocker.sh`) between the stories that genuinely block one another — because anything scheduling work off the board reads those links to decide what can start now, and a decomposition with no links looks *fully parallel*, so a scheduler launches everything at once including work that is not yet buildable. Every edge carries one of two reasons: `prerequisite` (can't be built until the blocker exists) or `overlap` (independent, but both rewrite the same file, so parallel agents in separate worktrees silently clobber each other on merge — real, and undetectable downstream). The rules push for the *fewest true edges*: no transitive edges, no "feels later" edges (creation order already carries that), no `related`-style link standing in for a blocker, no cross-project edges. New `--parent "<id>"` attaches stories to an existing feature instead of creating one. Approval in Phase 4 now shows the edge table with reasons, a plain-text tree, and a mermaid graph, and states plainly which stories can run at the same time; Phase 7 repeats both views with the real ids as a receipt.
- **`/to-issues` cycle pre-flight — a hard gate before the first write.** The edge list is walked for cycles (including self-edges) before anything is created; on a hit it prints the exact chain and stops with nothing written. This lives upstream of creation because a downstream scheduler is likely to **fail open** on a cycle — detect it, leave every member schedulable, post a notification — so a cycle written to a shared board silently discards the ordering instead of announcing itself.
- **`/to-issues` destination resolution — discover, show, always ask.** Items created in the wrong bucket are this skill's quietest failure: created successfully, links and all, and never visible in the view the team or the scheduler actually reads (a scheduler typically scopes its board to one area + iteration). The new phase lists the real options read-only from the active tracker (ADO iterations/areas, GitHub milestones, Todoist projects/sections), asks once, and carries the answer into the approval block — it never silently accepts the value hardcoded in an adapter script. Defaults come from the new `ado_area_path` / `ado_iteration_path` settings in `tasks/tracker-config.md`.
- **`feeds_agent_scheduler` setting gates `--with-tasks`.** New `tasks/tracker-config.md` flag. An agent scheduler typically applies no work-item-type filter — a Task is as schedulable as a story, and adopting a parent pulls its whole child subtree — so on a scheduler-backed board `/to-issues` now stops at feature → story and refuses `--with-tasks` with an explanation rather than seeding the queue with items nothing should launch a session for. The breakdown still travels, in the story body's `## Breakdown` section, and `/story` / `/implement` produce the real task plan at build time.
- **ADO create scripts take `ADO_WORK_ITEM_TYPE`, `ADO_AREA_PATH`, and `ADO_ITERATION_PATH`.** `create-issue.sh` and `create-sub-issue.sh` read all three from the environment (env vars rather than positional args, because arg4 is already the milestone slot in the GitHub adapter and the section slot in Todoist). The type override is what lets one adapter create a parent `Feature`, a story, and a child `Task`, and it is also the escape hatch for Scrum-process projects, which reject `User Story` server-side with VS402323. Defaults are unchanged — `User Story` / `Task`, with both paths omitted when unset — so existing callers behave exactly as before.
- **Roster declares `contextWindow`.** Both shipped rosters (`templates/harness-roles.solo.json`, `templates/harness-roles.enterprise.json`) now carry an optional-but-always-shipped per-role `contextWindow` (1,000,000, matching `claude-opus-5[1m]`). Role facts belong to the roster, not to the consumer: an orchestrator sizes its context-recycle check off the declared window instead of guessing from the model id, so adding a model's window is a settings edit rather than a code change (DevOS SPEC §3.1, *"Role definitions live in the harness, not the OS… harness + OS changes ship together"*). Previously the consumer kept a hardcoded model→window map, which silently mis-sized any model missing from it. Additive and backward-compatible — a reader that doesn't know the field ignores it, and an absent or invalid value falls back to model-derived sizing. `model` and `contextWindow` are only correct together, so the install test now asserts both, pinned to one another.
- **`rules/deferrals.md` — the ship test and defer-time registration.** New single-source-of-truth rule closing two independent holes in how the harness ships unfinished work. **(1) Severity.** Before any review finding may be skipped, skills now apply the *ship test*: with this item left undone, does the change behave incorrectly for its **real configured inputs** — the roster, config, env, model or endpoint the project actually declares, not the values its tests use? A Yes is a blocker, and no `ADVISORY` label, green test suite, or "the proper fix needs a schema change" converts it into a deferral (a green suite is not evidence — a fixture using a value the system never uses will pass over a broken path forever; and the effort of the *ideal* fix says nothing about the minimum fix). **(2) Memory.** A deferral is now a tracker item created at defer-time via `trackers/active/create-issue.sh`, cited in the PR by its id — a "Deferred / follow-ups" bullet with no id is a defect in the run. Prose in PR bodies, decisions logs, and notes files never resurfaces, so "documented" was never the same as "tracked". Wired into `/implement`, `/story`, and `/evaluate` at their fix-vs-skip decision points and hard rules; `rules/autonomous-mode.md` marks the ship test explicitly non-self-answerable (a Yes that cannot be fixed in-run is a contradiction pause-anyway trigger, not a logged decision).
- **`/sync-tracker` Step 6.5 — orphaned-deferral harvest.** Reconciliation now runs in both directions: delivered work should be *closed*, and deferred work should be *open*. The new step scans `tasks/notes.md`, `tasks/lessons.md`, `tasks/stories/*/{decisions-log,evaluation}.md`, and merged PR bodies for deferral language, drops any line already carrying a tracker id, and offers the survivors for registration. It proposes and never registers silently, and applies the ship test to each survivor first — a sweep is exactly where a mislabeled blocker would otherwise be laundered into a low-priority backlog task. Read-only under `--dry-run`.
- **`rules/phase-markers.md` — the `phase.md` phase-marker convention.** New single-source-of-truth rule defining `tasks/stories/<id>/phase.md`: a plain `key: value` file (`schemaVersion`, `phase`, `role`, `updated`, `skill`, `detail`) overwritten in full at every subagent boundary, written by `/implement`, `/story`, `/run-tasks`, and `/evaluate` (writing as the `reviewer` role). There is no `persona` key — `harness-roles.json` is authoritative for the phase→persona display mapping, so a consumer joins on `phase`/`role` and reads the display name from the roster rather than trusting a duplicated string in the marker. An external orchestrator (e.g. DevOS's Story State Reader) live-derives the current phase — planning, coding, testing, reviewing, shipping — without knowing harness internals. Independent of `executor-state.md`, which remains the durable resume state.

### Changed

- **Role roster collapses from five sessions to two (`schemaVersion` 1 → 2).** `harness-roles.json` now declares `pipeline: ["builder","reviewer"]`: a **builder** (understand → plan → code → test → fix → commit/push/draft the PR body — the proven `/implement` / `/story` flow) and a fresh, adversarial, report-only **reviewer**. The five nautical names — Navigator, Shipwright, Lookout, Warden, Harbormaster — survive only as `phases[]` display metadata on each role, not as separate sessions. Each role entry now carries `displayName`, `skills`, `agent`, `phases[]`, `model` (`claude-opus-5[1m]`), `effort` (builder `medium`, reviewer `high`), and `producesArtifacts` — the old `stages` field is removed entirely; DevOS's roster-reader rejects a non-1 `schemaVersion` before it ever gets to reading role fields, so nothing there consumed `.stages`. The roster now declares only what an orchestrator *spawns* — the two new roles name far fewer skills than the five old roles did, because the old `decide`/`define` stages and the skills that lived there (`grill-me`, `wayfinder`, `architect`, `plan`, `sprint-plan`, `decision-brief`, `tdd`, `local-test`, `deploy`, `babysit-pr`, `sync-tracker`, `improve-harness`) are intentionally no longer named by any role — that work stays human-driven upstream of the roster, it has not been dropped. **Upgrade the consumer in lockstep with this bump:** DevOS's `readRoster` returns `null` on a `schemaVersion` mismatch and never throws, so an un-upgraded consumer silently loses the roster for *every* project it reads, with no diagnosable error — a `schemaVersion` of `1` is no longer valid and must not be read by old parsing logic.
- **`agents/builder.md` and `agents/reviewer.md` replace the five role agents.** `agents/navigator.md`, `shipwright.md`, `lookout.md`, `warden.md`, and `harbormaster.md` are removed; existing installs drop them on `/update-harness`. `builder` covers the planning/coding/testing/shipping phases in one session; `reviewer` covers the reviewing phase only and never fixes, commits, pushes, or opens a PR.

### Fixed

- **Local tracker silently returned empty issues on Windows.** `get-issue.sh` parses frontmatter by comparing each line against `---`. Issue files written on Windows carry CRLF, so the delimiter never matched, frontmatter was never entered, and the adapter exited **0** with a blank title, state and labels — a silent wrong answer rather than an error, which is the worst possible failure for something a planner reads. Each line is now stripped of its trailing carriage return. `list-issues.sh` had the same bug in a different form: `state`, `title`, `labels` and `assignee` kept their trailing CR, so the `open` comparison failed and a raw carriage return landed inside the emitted JSON strings.
- **Local tracker emitted invalid JSON on Windows.** `list-issues.sh` wrote the issue file path into the `url` field unescaped. Windows paths are full of backslashes, which are escape characters in JSON, so the entire document failed to parse for every consumer — not one field, the whole array. Backslashes are now escaped before quotes (the order matters, or the escaping escapes itself) in `url`, `title` and `assignee`. This was also the cause of the long-standing `wayfinder` end-to-end failures.
- **`npm run lint` did not run on Windows.** The `skills/*/__tests__/` argument was left for the shell to expand and Git Bash on Windows did not, so ESLint aborted with "No files matching the pattern" and linted nothing at all — including the directories listed before it. It is now a quoted glob that ESLint expands itself.
- **Tracker tests were flaky under the full suite.** `node --test` runs test files concurrently, and every adapter assertion spawns bash, which on Windows also spawns git and the fixture CLIs. Under that contention a script finishing in well under a second on its own could sit past the 15s `spawnSync` limit, so the suite went red on a different test each run with no diff to explain it — noise that trained everyone to ignore real failures. The ceiling is now 90s in `conformance.test.js` and `wayfinder-e2e.test.js`: the scripts are fast, only process startup is slow, so a generous limit costs nothing on a healthy run and only fires on a genuine hang.
- **`npm run dogfood` never worked on Windows.** It crashed with a raw `EPERM` stack trace from `fs.symlinkSync` and no explanation. Windows refuses `symlink()` unless the user has Developer Mode enabled or is running elevated, so on a normal Windows account this was the *default* outcome, not an edge case — meaning the repo's own documented dogfooding workflow ("editing source IS editing the live harness") was unavailable to every Windows contributor, silently. It now falls back to a **directory junction**, which needs no special privilege and resolves the same way for this purpose, and only if *both* fail does it print an actionable message (turn on Developer Mode, or run once elevated) plus the reassurance that dogfood mode is optional — a plain install works, you just reinstall after editing source.
- **A latency test measured machine contention, not the code.** `detectProjectState_WithInjectedRunner_CompletesUnder500ms` asserted a 500ms wall-clock budget, but `node --test` runs files concurrently — it was observed at 1053ms under a full-suite run while completing in ~30ms on its own. What the test actually guards against is a real regression: someone reintroducing a `gh` subprocess, a network call, or a recursive filesystem walk despite the injected runner, any of which costs seconds. The budget is now 3000ms, which still catches all of those and stops the suite going red on a busy machine — flaky reds are worse than a loose bound, because they train everyone to ignore a failing suite.
- **`install.js --help` listed the wrong trackers.** It advertised `--tracker <github|ado|todoist>` with "default: github", but `local` has been accepted for some time and is what `--yes` actually selects. Anyone reading the help would conclude a non-interactive local install was impossible.

- **ADO item creation no longer fails outright when tags are passed.** Both `trackers/ado/create-issue.sh` and `create-sub-issue.sh` sent tags as `--tags`, which `az boards work-item create` does not accept — verified against azure-devops extension 1.0.2 and 1.0.6, where the whole call dies with "unrecognized arguments". Since `create-issue.sh` defaults its tag arg to `needs-triage`, *every* ADO create was hitting the invalid flag. Tags now go through `--fields "System.Tags=..."`, the same mechanism `add-label.sh` already used on `work-item update`. New conformance tests assert `--fields System.Tags=` is present and `--tags` is absent on both scripts.
- **New ADO work items are no longer stranded at the project root.** Neither create script passed an area or iteration path, so items were created successfully and then never appeared in any filtered board or backlog view — and a child does **not** inherit its parent's area path, so a whole story subtree could land somewhere nobody was looking. Both scripts now forward `ADO_AREA_PATH` / `ADO_ITERATION_PATH` when set, and `/to-issues` resolves and confirms the destination before the first write.
- **Wave agents no longer run in isolated worktrees — dependent waves could not see prior waves' work.** `/implement`, `/story`, and `/run-tasks` spawned every `auto`/`test` task with `isolation: "worktree"`. An isolated worktree is created from the **default branch** and can only ever see **committed** state, while all three skills deliberately commit nothing until their PR phase — so each task after Wave 1 was handed a copy of the project that lacked the very files its own plan had ordered written first, and its `<verify>` failed on missing modules. This is structural, not a mis-set base ref: the no-commit rule and worktree isolation cannot both hold. Reproduced directly — an agent spawned with `isolation: "worktree"` reported `HEAD` at `main`'s tip, one commit behind the feature branch, and could not see a file **committed** to that branch. Observed twice in real runs (DevOS PR #19, where Wave 2 agents self-merged the feature branch to compile and isolation was dropped from Wave 4 on; DevOS PR #32, where the whole 9-task/7-wave run was executed sequentially to avoid it, forfeiting all parallelism). Worktrees also stranded failed agents' work in hidden `.claude/worktrees/` directories that nothing collected. Wave agents now run in the orchestrator's working directory on its feature branch, still launched concurrently; the same-file protection worktrees were meant to provide comes from the pre-wave overlap check, which holds regardless of isolation. New `rules/wave-execution.md` is the single source of truth.
- **Concurrent wave agents no longer corrupt each other's builds.** With agents sharing one working directory, two `<verify>` commands running at once collide in shared build scratch (`node_modules/.cache`, `.next`, `tsconfig.tsbuildinfo`, `obj/`, `target/`, `__pycache__`) and produce failures unrelated to the code. `story-executor-agent` now takes an atomic `mkdir`-based lock around the verify step only — editing stays fully parallel, where the wall-clock actually goes — with a 20-minute stale-lock break-in so a dead agent cannot wedge the wave, and a BLOCKED report rather than an unguarded build if the lock cannot be acquired.
- **A failed task's partial edits are reverted before it is retried.** Previously a failed agent's half-applied changes stayed in the working directory, so attempt 2 read attempt 1's wreckage as existing code and worked *around* it, `/debug` received three attempts layered together, and a stopped run left broken fragments in the diff beside the passing tasks' work. All three skills now restore **only that task's declared `<files>`** before each retry (never a blanket `git checkout .` or `git stash`, which would destroy sibling agents' in-flight work — safe because the overlap check keeps waves file-disjoint). This restores the one genuinely useful property worktrees had without the part that broke dependent waves.
- **The wave overlap check now covers reader-vs-writer collisions, and is verified after the fact.** It compared only `<files>` against `<files>`, missing the case where one task's `<read_first>` names a file another task is rewriting — the reader then works from a half-written version, silently, with nothing in the build output to reveal it. It now compares `<read_first>` against other tasks' `<files>` as well. Because that check trusts the plan's file lists, each wave now also ends with a stray-file check (`git status --porcelain` against the union of the wave's declared files): a path changed but declared by no task means an agent edited outside its scope, which stops the run rather than shipping inside the story diff unnoticed.
- **Executor agents are unconditionally forbidden from running state-changing git commands.** The rule existed but lived inside a section headed "Worktree isolation" that opened with *"You run inside an isolated git worktree"*, so an agent could read it as conditional — and it named only "branch-switching commands", which `git pull` is not. In a real run (DevOS PR #26) a subagent ran `git checkout main` + `git pull` mid-build and landed the story's first commit on local `main`. `story-executor-agent` now bans `checkout`, `switch`, `branch`, `stash`, `pull`, `fetch`, `merge`, `rebase`, `reset`, `restore`, `clean`, `add`, `commit`, and `push` by name, in every mode and every phase, with the reasoning attached: the agent shares the orchestrator's working directory, so any of these changes the branch or tree for the whole run — including for the sibling agents working beside it. Read-only git is still allowed.
- **Two stories can no longer be built in one working directory unnoticed.** `rules/git-worktrees.md` states the *1 folder = 1 branch = 1 AI terminal* invariant, but nothing enforced it: all three skills ran `git status` at startup and ignored the result. Two concurrent `/implement` runs in one directory commingled two features' uncommitted edits in shared files and cost a manual recovery (DevOS PR #32 — a fresh worktree off `main`, 20 files copied, 5 hand-reconstructed). Startup now reads that `git status` and, when the tree is dirty *and* another story's branch or a fresh `phase.md`/`executor-state.md` suggests a live sibling run, shows exactly what it found and asks — it does not refuse outright, since a dirty tree is often the user's own scratch work. Because a startup check only protects the run that starts *second*, every wave additionally re-checks the branch on both sides: a branch that changed mid-run is a hard stop, and a **contradiction** pause-anyway trigger that is never self-answered under `--autonomous`.
- **Solo installs no longer ship skills that spawn uninstalled agents.** `/implement` and `/run-tasks` spawn `story-understand-agent`, `story-executor-agent`, and `story-pr-agent` by name, but all three were on the enterprise-only skip list — so a solo install had skills pointing at agents that were never copied. The three now ship in both packs (only `story-plan-agent` and the `sprint-plan-*` agents stay enterprise-only). Existing solo installs pick them up on `/update-harness`.
- **Skills are now pack-filtered.** Previously *every* skill was copied to *every* install, so solo users received `/story` and `/sprint-plan` — which depend on the enterprise-only agents and cannot run in a solo install. Solo installs now omit both, and `--update` prunes them from installs made before this change.
- **Install verification catches roster drift.** `verifyInstall` now asserts that every agent a pack's skills spawn is present, and that no enterprise-only skill leaked into a solo install — so this class of mismatch fails at install time instead of surfacing mid-run.

### Changed

- **Autonomous mode: a missing dependency is a pause-anyway trigger.** A named skill, agent, script, or tracker adapter that is not installed now stops an autonomous run instead of being self-answered. Substituting a `general-purpose` agent for a purpose-built one is explicitly forbidden: an agent definition is a quality contract, so replacing it changes *what work was done*, not just how — which fails the reversibility test. Previously such a substitution passed the self-answer rule and was disclosed only as a line in the decisions log. See `rules/autonomous-mode.md`.

---

## [3.2.0] - 2026-07-25

Autonomous pipeline mode (`--autonomous` on `/implement` and `/story`, plus the `--rework` reject loop), the role roster for session orchestration, and fetch-on-demand harness updates.

### Added

- **Autonomous pipeline mode (`--autonomous`).** New per-run flag on `/implement` and `/story` that runs the entire pipeline (understand → plan → build → test → review → PR) with no human STOP checkpoints: the agent self-answers reversible decisions (logged to `tasks/stories/<id>/decisions-log.md` and surfaced verbatim in the PR under "Decisions made on your behalf") and pauses only on a contradiction, irreversible action, scope change, or the 3-failed-attempts rule. Implies `--auto`; the non-draft PR is the single human gate (never auto-merged). `/implement --rework <PR#>` re-enters a rejected PR — merging review comments with optional typed feedback, fixing on the same branch, and pushing. Convention in `rules/autonomous-mode.md`; sub-skills and agents inherit the mode with no flags of their own. Harness half of DevOS's launch-and-watch pipeline (the DevOS Bridge will spawn role sessions with this flag).
- **Role roster + crew agents (role-session orchestration).** New `harness-roles.json` installed into `.claude/`, declaring the pipeline as ordered, stage-scoped roles — **Navigator** (decide/define), **Shipwright** (build), **Lookout** (test), **Warden** (review), **Harbormaster** (ship) — each mapping to the pack's skills (solo: `/implement`; enterprise: `/story`) and to a new agent definition (`agents/navigator.md` … `harbormaster.md`). An external orchestrator (e.g. DevOS's Bridge, per its SPEC §3.1) reads the roster and spawns each stage as a fresh top-level session with that role identity; handoff between roles stays the harness's existing artifacts (`grill-summary.md`, `docs/`, `tasks/stories/`). Pack-specific templates live in `templates/harness-roles.{solo,enterprise}.json`; installer and updater keep the installed copy in sync.
- **`--source <dir>`** on `--check`/`--update` — reuse an already-materialized harness checkout instead of fetching again (used by the `/update-harness` skill to fetch once and apply).

### Changed

- **Fetch-on-demand updates — no more persistent clone.** `/update-harness` no longer requires a local `claude-code-harness` clone to sit next to your project. It reads a new `update` block in `.harness-manifest.json`, fetches the harness source on demand (a shallow clone to a temp dir, discarded afterward), applies the update, and cleans up. Nothing lingers in your project, nothing to gitignore, nothing to go stale.
- **Update channels.** The `update` block records a `channel`: `latest` (default — newest `main`), `pinned` (a version tag you opt into bumping), or `local` (a clone you point at, for harness development / offline). Set at install time or with `--update`: `--pin <version>`, `--latest`, `--local <path>`.
- **Manifest `schemaVersion` → 2.** The old `answers.harnessRepoPath` clone pointer is replaced by the `update` block. Existing installs migrate automatically on their first `--update` (the pointer is dropped, channel defaults to `latest`) — no manual action needed.

### Fixed

- **Safety hook: block all `git branch` force-delete spellings.** The `git-branch-D` rule in `hooks/safety-check.js` only matched the literal `-D` flag, so equivalent force-deletes via clustered or long flags (`-fD`, `-df`, `--delete --force`, `-d --force`, …) slipped through unguarded. The rule now catches a force-delete however it is written, with tests covering every variant and guarding safe deletes, branch listing, and tip-moves from false positives.

### Removed

- **`--harness-repo-path` flag** and the "Harness repo path" install prompt — superseded by the update channel flags above. `--skip-pull` is now a no-op (there is no clone to pull).

---

## [3.1.0] - 2026-07-17

New `/wayfinder` skill and five new tracker contract scripts across all four adapters.

### Added

- **`/wayfinder` skill** — plan an effort too big for one session as a **map** of **decision tickets** on the tracker: chart once (destination, tickets, fog of war), then resolve one ticket per session until the way to the destination is clear. Ticket types route to existing skills: `/research` (facts), `/prototype` (something to react to), `/grill-me` (human judgment). Mode-aware (local/tracker/both); adapted from the MIT-licensed `wayfinder` skill in [mattpocock/skills](https://github.com/mattpocock/skills), with tracker operations rewritten for the adapter layer so it works on GitHub, ADO, Todoist, and the local backend.
- **Tracker contract v3.1: 8 → 13 scripts.** Five wayfinding operations added to every adapter (`github`, `ado`, `todoist`, `local`):
  - `assign-issue.sh <ID> ["<assignee>"]` — claim an item (GitHub/ADO: native assignee; Todoist: `claimed` label; local: `assignee:` frontmatter)
  - `comment-issue.sh <ID> "<text>"` — add a comment (native everywhere; local appends a timestamped block)
  - `add-blocker.sh <ID> <BLOCKER_ID>` / `get-blockers.sh <ID>` — record and read blocking edges (ADO: native predecessor link; GitHub/Todoist: `Blocked by:` body line; local: `blocked_by:` frontmatter)
  - `create-sub-issue.sh <PARENT> "<title>" "<body>" "<label>"` — create a child item (now on all adapters, previously GitHub-only)
- **Wayfinder e2e suite** (`trackers/__tests__/wayfinder-e2e.test.js`) — full chart → claim → resolve → frontier-advance → finish lifecycle on the local backend with real files, plus a concurrent-session claim-exclusivity test.
- Conformance coverage for all five new scripts across all four adapters (arg validation, happy path, failure modes, contract presence).

### Changed

- `local/create-issue.sh` task frontmatter now includes `assignee: null` and `blocked_by: []`; `local/list-issues.sh` surfaces the assignee in its JSON output. Older task files without the fields keep working.
- `trackers/README.md` documents the 13-script contract and per-adapter wayfinding storage; `CONTRIBUTING.md` adapter instructions now point at the conformance suite.

### Fixed

- **Todoist adapter scripts were broken against the real `td` CLI** (found by live smoke testing, all verified end-to-end against a real Todoist account):
  - `close-issue.sh` used `td task close`, which doesn't exist → now `td task complete` (a close reason becomes a comment)
  - `add-label.sh` / `remove-label.sh` used nonexistent `--add-label` / `--remove-label` → now read-modify-write via `--labels` (which replaces the set)
  - `create-issue.sh` used `--label` → now `--labels`
  - Task refs are now passed as `id:xxx` — bare alphanumeric IDs are ambiguous with task names (e.g. `--parent` rejects them outright)
  - The `td` test stub now rejects the nonexistent flags so these can't regress

---

## [3.0.0] - 2026-07-15

Three tracker modes, a local file-based task backend, code-platform split, automated sync sweep, and mode-aware skills. Every consumer of task files now works in all three modes.

### MIGRATION — existing installs

The first `--update` after upgrading runs a one-time mode migration:

1. **Code-platform split** — PR review scripts (`get-pr-review-threads.sh`, `reply-pr-thread.sh`, `resolve-pr-thread.sh`) move from `trackers/active/` to `code-platform/active/`. The updater handles this automatically.
2. **Mode question** — "Where should your task list live?" is asked once. `--yes` defaults to **both** (preserves your existing tracker + adds a local `todo.md` mirror). The answer is recorded in the manifest.
3. **todo.md archive** — Your old hand-written `todo.md` is unconditionally renamed to `tasks/todo-manual-backup.md`. The next session start mentions the backup and suggests `/sync-tracker --import-backup` for item-by-item import.
4. **Tracked file detection** — If `tasks/issues/` or `tasks/todo.md` are still tracked by git, the updater prints the exact `git rm --cached` commands and a warning about team impact. It never modifies the git index itself.
5. **Gitignore block** — A managed, sentinel-delimited block is appended to `.gitignore` covering all per-developer task data.

### Tracker modes (new)

The harness now supports three modes for tracking work, chosen at install time:

- **Local** — tasks live as markdown files in `tasks/issues/`, no external accounts needed
- **Tracker** — an external tracker (GitHub Issues, ADO, Todoist) is the single source of truth
- **Both** — external tracker is canonical, plus a local `todo.md` mirror

Mode is stored in `.harness-manifest.json` (`tracker` + `trackerMirror` fields). One system is always canonical — never two masters.

### Code-platform split (new)

PR review thread operations now live in a separate `code-platform/` layer, independent of the task tracker:
- 3-script interface: `get-pr-review-threads.sh`, `reply-pr-thread.sh`, `resolve-pr-thread.sh`
- 3 backends: `github`, `azure-repos`, `none` (fails loudly)
- Installer asks "Where do your pull requests live?" — always interactive; `--yes` auto-detects from git remote URL
- Todoist's old no-op PR scripts deleted; the `none` backend replaces them

### Local backend (new)

Full 8-script tracker adapter in `trackers/local/`:
- One file per task: `tasks/issues/<id>.md` with YAML frontmatter
- Sequential integer IDs, atomic create with noclobber, files never deleted on close
- Shared `render-todo.sh` renderer produces `tasks/todo.md` grouped by label
- `todo-render-trigger.js` hook regenerates the dashboard on direct file edits

### Sync automation (new)

- **`tracker-sync.js` hook** — SessionStart: drift report (open items with merged-PR evidence), backup notice, mirror regeneration. SessionEnd: mechanical closure from explicit evidence only (merged PRs with closing keywords for tracker/both mode, `Task: N` trailers for local mode). Ambiguous evidence is never auto-acted on.
- **`pre-compact.js`** — breadcrumb now writes to `tasks/notes.md` instead of `todo.md`
- **`/sync-tracker` reworked** — mode-aware, with new `--import-backup [file]` mode for item-by-item import from `todo-manual-backup.md` or a retired `plan.md`

### Skill and agent migration

Every `todo.md` and tracker consumer is now mode-aware:
- **Pipeline core** — XML task plan lives in `tasks/stories/<id>/plan.md` (all modes), not `todo.md`
- **story-pr-agent** — closes tasks via `close-issue.sh` in every mode; PR body carries `Task: N` trailers (local) / `Closes #N` (GitHub) / `Fixes AB#N` (ADO)
- **`/implement`** — in local mode, offers to create a local task for ad-hoc work
- **`/to-todoist`** — refuses cleanly when tracker is not Todoist
- **`/to-issues`** — backend-aware: local mode prints task ID and file path
- **11 breadcrumb skills** — in-progress breadcrumb writes to `tasks/notes.md` universally
- **Session hooks** — `session-start-msg.js` and `session-router.js` have local/both/tracker branches
- **Solo `tasks/plan.md` retired** — `/plan` drafts go to `tasks/stories/current/plan.md`; the board is the generated `todo.md` in every pack

### Installer

- **Mode question** — "Where should your task list live?" with 3 natural-language options
- **Code-platform question** — "Where do your pull requests live?" — GitHub, Azure Repos, or none
- **Manifest extended** — new fields: `trackerMirror` (boolean), `codePlatform` (string); `tracker` gains value `'local'`
- **Managed gitignore block** — sentinel-delimited, idempotent, never edits rules outside the managed block
- **`--yes` defaults** — fresh: local + auto-detected code platform; update crossing: both
- **Update crossing** — one-time mode question, `todo.md` archive, tracked-file detection
- **Template packs** — enterprise gains `notes.md`; solo drops `plan.md`; `tracker-config.md` loses duplicate `Type:` line

### Test suite

- 341 tests, all passing (up from 133 in v2). New tests cover local backend conformance, hook behavior (todo-render-trigger, tracker-sync), mode derivation, gitignore idempotency, and update crossing.

---

## [Unreleased]

### New agents (1 added, 17 total)

- `chief-operator` — Main-session project operator. Researches, analyzes, makes decisions, and delegates implementation through handoff files and tracker tasks. Spawns subagents for information gathering with three-bucket model routing (Opus/Sonnet/Haiku). Maintains `operator-state.md` for cross-session continuity with staleness detection. Auto-detects bootstrap (new project) vs resume (ongoing). Launch with `claude --model claude-opus-4-8 --agent chief-operator`.

### New skills

- `/update-harness` — Check for and apply harness updates. Resolves target (project/global/both), checks for new versions, shows changelog excerpt, and applies updates with human confirmation. Supports `--global` and `--project` flags. Includes legacy backfill for pre-manifest installs.
- `/to-todoist` — Decompose planning artifacts into Todoist milestones and tasks. Milestones as uncompletable parent tasks, work items as prioritized subtasks with descriptions, acceptance criteria, and dependency notes. Supports `--project`, `--section`, and `--dry-run` flags. Reads defaults from `tasks/notes.md` Todoist section.

### Installer

- **Fully non-interactive installs** — New value flags make `--yes` truly zero-touch, so no placeholders are left behind for a manual `sed` pass: `--name`, `--project-name`, `--pack`, `--tracker`, `--prd-mode`, `--ado-project`/`--ado-repo`/`--ado-org-path`, `--todoist-project`, `--org`/`--lead-dev`/`--infra-person`/`--devops-person`/`--qa-person`, `--work-root`, and `--harness-repo-path`. Each also works in interactive mode (a supplied flag pre-fills its prompt). Enum flags are validated up front; a missing flag value fails fast. Run `--help` for the full list.
- **Actionable placeholder warnings** — When values are left at their defaults, the installer now prints the exact re-run command (e.g. `node install/install.js --yes --project <path> --name "..."`) instead of the previous dead-end "run again with correct values" text.
- **Git pre-flight check** — The non-git-repository warning is now a labelled pre-flight step that explains which features (worktree workflow, PR automation) need git and suggests `git init`.
- **Fixed: Todoist sentinel corruption** — `YOUR_TODOIST_PROJECT` is a literal sentinel in runtime code (`hooks/lib/project-state.js`, `trackers/todoist/*.sh`) used to detect an unfilled value, but the tree-wide substitution was rewriting it — so a Todoist install inverted those guards (the configured project was rejected) and a non-Todoist install tripped a false-positive "unresolved placeholder" warning. It is no longer substituted tree-wide (task templates are still filled via a separate pass), and the placeholder scan now ignores runtime sentinels.
- **Install manifest** (`.harness-manifest.json`) — Written on every install. Records schema version, harness version, install mode, workflow pack, tracker, PRD mode, all personalization answers, and the exact list of installed files. Enables safe updates and orphan detection.
- **`install.sh` is now a thin forwarder** — All install logic lives in `install.js`. The shell script checks for Node.js and forwards via `exec`.
- **`--check` mode** — Read-only version check. Emits JSON with `currentVersion`, `latestVersion`, `behind` (commits), `changelogExcerpt`, and `orphans[]`.
- **`--update` mode** — Apply updates: snapshot → pull → copy → substitute → orphan cleanup → settings reconciliation → verify → manifest bump. Keeps last 3 snapshots.
- **Settings reconciliation** — Surgically updates harness-owned hooks in `settings.json` while preserving user permissions, env vars, MCP config, and custom hooks byte-for-byte. Upgrades old installs (1 SessionStart hook → 3).
- **Legacy backfill** — Auto-detects workflow pack (from installed agents), tracker (from adapter script contents), and installed files for pre-manifest installs. Creates a valid manifest so future updates work silently.

### Tracker integration

- **`close-issue.sh` adapter script** — New 10th script in the tracker adapter interface. Closes/completes issues in GitHub (`gh issue close`), Todoist (`td task close`), and ADO (`az boards work-item update --fields System.State=Closed`). Supports optional reason/state argument per adapter.
- **`/sync-tracker` skill** — Reconciles merged PRs and completed work against open tracker items. Scans merged PRs, `todo.md`, and sprint files for delivery evidence, then closes delivered items via the adapter. Supports `--dry-run`.
- **Story PR agent tracker sync** — Phase 4 (`story-pr-agent`) now calls `close-issue.sh` after PR preparation, closing the source tracker item automatically. Best-effort: failures log a warning but don't block the PR.
- **Todoist tracker adapter** — Full 9-script adapter in `trackers/todoist/` implementing the same interface as GitHub and ADO. Resolves `td` CLI from `$TODOIST_CLI` or `$PATH`.
- **Tracker-agnostic session routing** — `session-router.js` and `project-state.js` now detect which tracker is active (GitHub, ADO, or Todoist) and route accordingly. Projects using Todoist get task-based guidance instead of issue-based.
- **Installer Todoist support** — Both solo and enterprise workflow packs now offer Todoist as a tracker option during installation.
- **`/implement` Todoist support** — Accepts Todoist task titles and IDs in addition to GitHub issue numbers. Fetches task context from the active tracker adapter.
- **`/grill-me` downstream routing** — Now recommends `/to-todoist` alongside `/to-issues` as a downstream skill.
- **`tracker-config.md` template** — Includes Todoist settings (`todoist_project`, `todoist_default_section`).

---

## [2.0.0] - 2026-05-06

Major expansion of the harness: adds DECIDE and DEFINE phase skills, extends drift detection to artifacts, adds reviewer agents, and introduces cross-project learnings. The harness now covers the full SDLC from decision validation through post-ship learning. Sources: James's AI-Augmented SDLC v1.1, Matt Pocock's 7-phase framework, GSD project patterns.

### New skills (13 added, 27 total)

- `/decision-brief` — Pre-PRD assumption pass with 4 inline phases, tiered evidence thresholds, and compliance owner sign-off gates for regulated data. Checkpoint resilience for crash recovery.
- `/grill-me` — Serial decision-tree interrogation of a plan or design until shared understanding.
- `/grill-with-docs` — Like /grill-me but anchored in CONTEXT.md and ADRs. Updates glossary, proposes ADRs sparingly.
- `/research` — Cache provenance-tagged ([VERIFIED]/[CITED]/[ASSUMED]) research findings in research.md for downstream agents.
- `/prd-critique` — 6 critique checks on a PRD (metric validity, NFR specificity, failure modes, assumption traceability, rollback plan, intent clarity).
- `/architect` — Interactive 8-section architecture design from a PRD. Cloud-agnostic with platform extensions. Mermaid diagrams, cost model, compliance gates.
- `/architect-critique` — 5 critique axes on an architecture doc (NFR fit, failure modes, cost stress-test, security posture, operability).
- `/to-issues` — Decompose a PRD into vertical-slice tracker issues with Given/When/Then acceptance criteria.
- `/prototype` — Throwaway prototyping with 1-3 candidate approaches, decision.md comparison, cleanup of losers.
- `/zoom-out` — High-level map of unfamiliar code (callers, dependencies, patterns, architecture context).
- `/improve-codebase-architecture` — Find shallow modules, apply the deletion test, propose deepening refactors. Requires CONTEXT.md.
- `/triage` — 5-state issue routing workflow (needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix) with bug/enhancement categorization.
- `/prd` upgraded to dual-mode output (file / tracker / both) with installer prompt.

### New agents (2 added, 16 total)

- `architect-reviewer-agent` — Adversarial architecture review (drift, NFR compliance, data-flow integrity). Runs in parallel during /story Phase 3.6.
- `security-reviewer-agent` — OWASP Top 10, PHI/PII pattern detection (SSNs, DOBs, member IDs), auth patterns, dependency vulns. Runs in parallel during /story Phase 3.6.

### Drift detection extended to artifacts

- 5 new invariants (7-11) in drift-check.js: NFR-not-in-arch, arch-service-not-in-work-items, work-item-section-mismatch, AC-not-tested, ADR-vs-architecture contradiction.
- New `hooks/lib/artifact-parsers.js` with lightweight parsers for NFRs, Mermaid components, section references, ADR tech choices.
- Soft warnings for gaps; hard block only for ADR contradictions (where an accepted ADR chose X but the architecture doc uses rejected Y).
- /sync-tasks updated to handle all 11 invariants with artifact-specific fix proposals.

### Agent hardening (GSD-sourced)

- Scope-reduction detection — prohibited language list ("simplified", "placeholder", "v1", etc.) in plan agents and evaluator.
- Planner authority limits — only 3 valid reasons to defer: context cost, missing info, dependency conflict.
- 4-level artifact verification in evaluator (existence, substantive, wired, data flow).
- Deviation rules 1-4 in executor (auto-fix for bugs/missing-critical/blocking; STOP for architectural changes).
- Optional `<read_first>` field on plan tasks for context files.
- Stall detection in plan revision loops.

### Conventions and infrastructure

- **CONTEXT.md + ADR convention** — domain glossary template and lightweight ADR format, installed via prompt.
- **Compliance Owner gate** — `compliance-owners.md` template with Privacy Officer and Security Lead roles. Enforced in /decision-brief, /architect, and /architect-critique.
- **Cross-phase task file convention** — DECIDE/DEFINE skills write to todo.md on start/end and flags-and-notes.md for blockers.
- **Gate taxonomy** — 4 gate types (pre-flight, revision, escalation, abort) documented in CONTRIBUTING.md.
- **Orchestrator file protection** — executor agent has explicit "never modify" list for tasks/, CLAUDE.md, .claude/, docs/.
- **Seeds section** in flags-and-notes.md for forward-looking ideas with trigger conditions.
- **Approach note** as formal PR artifact (work item, intent, linked assumptions, scope, conventions, gotchas, success check).
- **Agent-feedback tickets** — /improve-harness can emit structured tracker issues with `agent-feedback` label.
- **Cross-project learnings store** — /improve-harness writes to `~/.claude/learnings/` with content-hash dedup. Installer `--seed` flag populates new projects.
- **Tier-0 exceptions** — ADVISORY findings resolvable by Dev + Tech Lead without PM escalation. Logged in exceptions.md.
- **Tracker interface expanded** to 9 scripts: added `add-label.sh` and `remove-label.sh` to both ADO and GitHub adapters.

### Test suite

- 133 tests, all passing (up from 129 in v1). 23 new artifact drift tests.

---

## [1.0.0] - 2026-04-15

First public release. A supervised Claude Code workflow framework with two workflow packs (enterprise and solo), pluggable issue trackers, hardened hooks, and a self-improvement loop.

### Workflows

- **Enterprise pack** — sprint-based: `/sprint-plan`, `/story`, `/babysit-pr`, `/run-tasks`, `/sync-tasks`, `/pa`, `/deploy`. Designed for teams with formal sprints, code review cycles, and shared task files.
- **Solo pack** — issue-based: `/plan`, `/implement`. Lighter ceremony for individual developers.
- **Shared skills** — `/evaluate`, `/debug`, `/troubleshoot`, `/local-test`, `/ralph-prd`, `/skill-creator`, `/improve-harness`.
- **End-to-end story execution** (`/story <id>`): understand → plan → execute → evaluate → PR. Adversarial evaluator (different prompt than the executor) reviews build, tests, plan compliance, and security before PR.
- **3-attempt rule**: same error 3× triggers automatic escalation to `/debug` instead of infinite retry loops.

### Agents and model routing

- 14 specialized agents covering planning, execution, evaluation, acceptance testing, story/PR/sprint phases, debug, and troubleshoot.
- **Cost-aware model tiers**: Opus for planning/judging, Sonnet for coding, Haiku for data tasks.
- Handoff contracts between agents are markdown files (brief, plan, test-strategy, executor-state, evaluation, acceptance) — git-friendly, human-readable, durable.

### Pluggable issue trackers

- **Two adapters out of the box**: Azure DevOps (`az` CLI) and GitHub (`gh` CLI).
- 6-script contract per adapter: `get-issue`, `get-issue-children`, `get-pr-review-threads`, `reply-pr-thread`, `resolve-pr-thread`, `get-sprint-issues`.
- Shared bash libraries (`retry.sh` with exponential backoff, `auth-check.sh` with token-staleness detection).
- Adapter selected at install time; runtime calls hit `~/.claude/trackers/active/`. New adapters (Linear, Jira, …) drop in by implementing the same 6 scripts.

### Hardened Node hooks

Five stdin-driven hooks (Node ≥ 20, zero runtime deps), wired through `settings.json`:

- `safety-check.js` (PreToolUse) — denies destructive Bash and risky Write ops via 40+ rules. Split into `BASH_RULES` (rm/git/SQL/Azure/process-kill/credential leakage) and `WRITE_RULES` (PEM private keys, hardcoded secret heuristic, curl-with-creds in committed files). Docs paths (`*.md`/`*.mdx`/`*.rst`/`*.txt` and `docs/` dirs) are allowlisted to avoid false-positives on documentation. ACR build staging path is allowlisted for `rm -rf`.
- `drift-check.js` (PostToolUse) — 6 invariants across the 7 enterprise task files. Hard-blocks on `people.md ↔ flags-and-notes.md` cross-ref mismatches with auto-redirect to `/sync-tasks`. Soft warnings for status enum, branch naming, story brief presence. Extended invariants gated by `CLAUDE_HARNESS_DRIFT_LEVEL=full`.
- `session-log.js` (SessionEnd) — appends `tasks/sessions.jsonl`. Auto-rotates at 10 MB with async gzip; keeps the 5 most recent rotations.
- `pre-compact.js` (PreCompact) — appends a timestamp marker to `tasks/todo.md` and injects a context-save reminder before Claude's context window compacts.
- `catalog-trigger.js` (PostToolUse) — rebuilds `SKILLS_CATALOG.md` whenever a skill, agent, or command file is edited.

### Hook safety envelope

- Every hook is wrapped in `runHook(name, fn)` (in `hooks/lib/hook-io.js`) which provides:
  - **5-second timeout** — a hung hook can't block Claude (fail-open, exit 0).
  - **try/catch + uncaughtException + unhandledRejection handlers** — a crashed hook can't block Claude (fail-open, exit 0).
  - **Per-invocation metric** appended to `tasks/metrics.jsonl`: `{ts, hook, duration_ms, decision, rule?}`. Feeds `/improve-harness`.
  - **Errors logged to stderr as JSON** — `{error, hook, message}` — instead of swallowing silently.
- See [hooks/SECURITY.md](hooks/SECURITY.md) for the explicit threat model: oversight gate, **not** a sandbox. Bypassable by base64 encoding, variable indirection, `$IFS` tricks, MCP tool surfaces.

### Self-improvement loop

- `/improve-harness [days]` reads the last N days of `tasks/sessions.jsonl`, `tasks/lessons.md`, `tasks/flags-and-notes.md`, and every `tasks/stories/<id>/evaluation.md`. Detects 6 friction patterns with a strict ≥2 recurrence threshold (≥3 for re-attempts) so single anomalies don't turn into noisy proposals.
- Output: `tasks/improve-harness-<YYYY-MM-DD>.md` with concrete file:line edits to harness source. **Never auto-applied** — same supervised-agent principle as the rest of the harness.
- Idempotent via `<!-- last-retro: <date>/<session-id> -->` marker.

### Path-scoped rules

- `rules/code-style.md`, `rules/testing.md`, `rules/test-philosophy.md`, `rules/security.md`, `rules/documentation.md` — activated via path scoping in CLAUDE.md.
- Test philosophy is a first-class planning artefact: every plan must include a test strategy, every code change has matching `type="test"` tasks, every `<verify>` command runs the relevant tests.

### Test suite

- **129 tests total**, all passing. 95.5% line coverage on hook code.
  - 72 safety-check cases — every BASH_RULE entry, false-positives that must NOT fire (`confirm`, `firmly`, `git committed`), ACR/docs allowlists, secret-detection heuristic, out-of-scope tools.
  - 13 hook-io envelope cases — runHook timeout/exception/rejection (all fail-open), `readStdinJson` malformed-input handling, metric emission, log rotation thresholds and pruning.
  - 12 drift-check invariant cases — positive, negative, and placeholder-template fixtures for all 6 invariants.
  - 10 frontmatter parser cases — YAML edge cases (CRLF, comments, colons in values).
  - 3 session-log rotation cases including a real 10 MB rotation.
  - 19 tracker conformance cases — both adapters × arg validation, happy-path golden match, failure modes (404/auth/malformed), retry-and-succeed, contract presence.
- Run `npm test` (uses Node's built-in `node:test` — no runtime deps; `eslint` and `c8` are dev-only).

### Installer

- Interactive `bash install/install.sh` — global (`~/.claude/`) or per-project (`.claude/`).
- Picks workflow pack (enterprise/solo) and tracker adapter (ado/github) at install time.
- Replaces placeholders (`YOUR_NAME`, `YOUR_PROJECT_NAME`, `YOUR_ADO_*`, team roles) and generates `settings.json` with the correct hook paths for the host OS.
- Prerequisite checks (Node ≥ 20, `jq`, `az`/`gh` depending on adapter).
- `--dry-run` to preview, `--uninstall` (with timestamped backup), `--global`/`--project` for non-interactive use.
- Post-install verification asserts critical files present and dev-only artefacts (`package.json`, `node_modules/`, `__tests__/`, `coverage/`, `eslint.config.js`) did not leak into the install target.

### Documentation

- `README.md` — top-level overview and quickstart.
- `CONFIGURE.md` — full placeholder reference.
- `CONTRIBUTING.md` — extending skills, agents, hooks, trackers.
- `TROUBLESHOOTING.md` — common issues and fixes.
- `hooks/README.md` + `hooks/SECURITY.md` — hook protocol, test invocation, threat model.
- `trackers/README.md` + `trackers/__tests__/README.md` — adapter contract and conformance suite extension guide.

### Requirements

- Node.js ≥ 20
- Bash (Git Bash on Windows is fine)
- `jq`
- Adapter CLIs: `az` (with `azure-devops` extension) for ADO, or `gh` for GitHub
