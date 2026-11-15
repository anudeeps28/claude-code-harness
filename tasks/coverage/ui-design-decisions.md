# Coverage — docs/ui-design/DECISIONS.md
Source: docs/ui-design/DECISIONS.md
Status: open

Story numbers are the plan's (S1–S61); the Todoist ids follow in brackets. Created 2026-11-14 in
Todoist project claude-code-harness (id:6hvg55xg9FxxH4X2), section "Harness app".

Features: F1 6j2VQFFxCXjCvvvR · F2 6j2VQGR4Wq42V4g2 · F3 6j2VQHhfHprvvhC2 · F4 6j2VQM8pQJWxJ7x2 ·
F5 6j2VQPRQQ8Xff9r2 · F6 6j2VQQh68qrqGjfR · F7 6j2VQV6Ch5h3F822 · F8 6j2VQW4WqqJ8jvp2 ·
F9 6j2VQX9XJjFHJGH2 · F10 6j2VQcG32PqGcRHR · F11 6j2VQfjxQW9rpHjR · F12 6j2VQh2gC378fXC2 ·
F13 6j2VQj7wVmmf5Mq2 · F14 6j2VQmJ8Qxv2MRP2

| Id | Requirement | Mapped to | Audit |
|---|---|---|---|
| D1.1 | **Electron** (one app for Windows and Mac) | story 21 (#6j2VRR7FwxjhFjq2) AC1 | |
| D1.2 | Native WinUI 3 / SwiftUI apps may follow later | Out of scope — a later product decision, not v1 | |
| D2.1 | **One shared local background worker (Node)** holding all logic: reads/watches `tasks/`, scheduler and queue, PR watcher, starts and talks to runs | story 17 (#6j2VRJ8QCj68Wp8R) AC1 | |
| D3.1 | The Electron app holds no logic and talks to the worker only over the worker's localhost API (bound to 127.0.0.1). No Electron-only shortcuts | story 21 (#6j2VRR7FwxjhFjq2) AC2 | |
| D4.1 | Unchanged. Only Mac wording gets Windows equivalents on Windows (⌘K → Ctrl+K, "this Mac" → "this PC"). Exact token values from `tokens.css` | story 21 (#6j2VRR7FwxjhFjq2) AC3 | |
| D5.1 | **The worker starts and owns each Claude Code run** and streams it live (text, tool calls, agent, questions) | story 26 (#6j2VRcwVggGWRcHR) AC1 | |
| D5.2 | Runs started in a terminal still show on the board from their files, read-only | story 18 (#6j2VRMGGcpC6g422) AC3 | |
| D6.1 | **An agent-adapter boundary in the worker from day one** (one adapter per tool, translating its output to one common event format the app shows). **Ship with a Claude Code adapter only.** | story 26 (#6j2VRcwVggGWRcHR) AC2 | |
| D6.2 | Codex / Gemini CLI later = a new adapter. Making the harness's own workflow multi-tool is a separate, later decision | Out of scope — later adapters and a later decision | |
| D7.1 | **One machine-wide "Up next" list in the worker's own folder.** It holds only waiting features (parked ones stay in it, unnumbered); a feature is removed the moment it starts. What is running is read from each feature's own state files, not this list. | story 28 (#6j2VRh5Jr3ChMJM2) AC1 | |
| D7.2 | Up to 5 slots (setting). A feature starts when: a slot is free, its plan is approved, and **every feature it depends on has its PR merged**; it pulls the latest main first. | story 28 (#6j2VRh5Jr3ChMJM2) AC2 | |
| D8.1 | **The harness's own local tracker (`tasks/issues/<id>.md`) is the app's built-in tracker and source of truth.** | story 18 (#6j2VRMGGcpC6g422) AC2 | |
| D8.2 | External trackers (GitHub, Todoist, ADO) become an optional sync add-on later, never required. | Out of scope — later add-on | |
| D8.3 | Local files only for now: no database, no hosting; task files stay out of git. | story 17 (#6j2VRJ8QCj68Wp8R) AC3 | |
| D8.4 | Phone sync decided later; the worker owns the data so sync can be added without a rebuild | Out of scope — phone sync is decided later | |
| D9.1 | Read from each task file's `blocked_by:` line (already written by `/plan-features` via `add-blocker.sh`). The worker checks each blocker's PR is merged before starting the feature | story 28 (#6j2VRh5Jr3ChMJM2) AC3 | |
| D10.1 | **The worker saves each run's live steps to `tasks/features/<fid>/steps.jsonl`** (one record per step: agent, tool, input, trimmed result, files changed, thinking), in our own format so every adapter writes the same. | story 27 (#6j2VRfxPc5RRR6W2) AC1 | |
| D10.2 | Step files are deleted after **90 days by default** (setting: 30 d / 90 d / 1 y / forever), checked at app start. Feature summaries (Completed list, stories, commits, PR, dates) are kept forever | story 27 (#6j2VRfxPc5RRR6W2) AC2 | |
| D11.1 | **`/implement` writes every question it asks (plan gate and pauses) to `tasks/features/<fid>/questions.json`**: text, 2+ options, the recommended one, and per option a detail block (what it means, pros, cons, when to pick / not pick). | story 2 (#6j2VQq7VwVQjMhVR) AC1 | |
| D11.2 | Not Claude Code's built-in ask-the-user tool (4-question cap, may not work headless). | story 2 (#6j2VQq7VwVQjMhVR) AC2 | |
| D11.3 | The app renders cards from the file; an answer is saved to the file and passed to the run as a message. | story 32 (#6j2VjHHXPjJMgQG2) AC2 | |
| D11.4 | Answers are also written to the plan and decisions log (kept forever); the file follows the step-file retention | story 3 (#6j2VQr5PCV64PGx2) AC2 | |
| D12.1 | Hovering, focusing or clicking an answer option opens a panel on the right with that option's detail (meaning, pros, cons, when to pick). Mock: `additions/option-detail.html` (plan gate: the right column becomes "About this answer"; board card: the panel opens beside the card; clicking an answer still answers in one click; no animation on show). | story 32 (#6j2VjHHXPjJMgQG2) AC1 | |
| D13.1 | **The worker polls each open PR every 5 min with plain code (no AI)**: checks, new review comments, merged. | story 39 (#6j2VjX769GmPfjMR) AC1 | |
| D13.2 | New comments → it starts a Claude Code run in the feature's worktree that fixes them test-first and pushes, **without asking**; anything that is not a clear fix (a reviewer question, a disagreement) becomes a "Needs you" card. | story 41 (#6j2Vjcwrg52MfHG2) AC1 | |
| D13.3 | Merged → Merged column, worktree cleaned up, Completed a day later. | story 42 (#6j2Vjfg94WvR8Fw2) AC1 | |
| D13.4 | Open PRs are stored with the feature, so it survives restarts. | story 39 (#6j2VjX769GmPfjMR) AC2 | |
| D13.5 | **GitHub first**; other hosts later as adapters. Borrow logic from the factory's `reference/pr-watch.md` | story 39 (#6j2VjX769GmPfjMR) AC3 | |
| D14.1 | **Code-only, at a step boundary.** Pause → the card shows "Pausing · finishing <step> first" at once; the worker watches the run's progress file and, the moment the step-finished line appears, ends the Claude process itself (no AI obeys a message). | story 29 (#6j2Vj97wM9MgP5PR) AC1 | |
| D14.2 | **"Stop now"** is on the card from the start: ends it immediately, and resume redoes that step. | story 29 (#6j2Vj97wM9MgP5PR) AC2 | |
| D14.3 | Resume = the worker restarts `/implement --resume <fid>`. | story 29 (#6j2Vj97wM9MgP5PR) AC3 | |
| D14.4 | Park = pause + free the slot; the feature returns to Up next unnumbered ("Parked by you"), worktree untouched; un-park re-queues it | story 29 (#6j2Vj97wM9MgP5PR) AC4 | |
| D15.1 | **AI does the work and the judgment** (code, fixes, plans, questions). **Code does the bookkeeping**: state changes, timing, starting/stopping, checks. When the AI must record something it does so through a script that validates it, and the worker double-checks against independent evidence (git, GitHub, process state). | story 1 (#6j2VQp9V5G4ccXq2) AC1 | |
| D15.2 | (1) questions are written through a validating script; the worker also detects a run waiting for input (turn ended, no answer) and shows a "Waiting on you" card with the last message even without the file; | story 30 (#6j2VjCQ6VxJ3M6gR) AC1 | |
| D15.3 | (2) pause/progress also watch `feature-state.md`, plus a watchdog for a run silent too long; | story 30 (#6j2VjCQ6VxJ3M6gR) AC2 | |
| D15.4 | (3) the PR is found by asking GitHub for the feature branch's PR, not from the log; | story 39 (#6j2VjX769GmPfjMR) AC4 | |
| D15.5 | (4) after each comment-fix run the worker checks GitHub for unresolved threads and turns any left into cards | story 41 (#6j2Vjcwrg52MfHG2) AC2 | |
| D16.1 | Planning run (AI) writes the plan and questions, sets `gate-shown: yes` and waits → the worker ends that session (no slot is held while a plan waits) and shows the Plan gate card. | story 31 (#6j2VjG4g28qV4rH2) AC1 | |
| D16.2 | Answers are written to the questions file by the worker; **Approve and build** is enabled only when code confirms all are answered. | story 31 (#6j2VjG4g28qV4rH2) AC2 | |
| D16.3 | On approve, **the worker performs the approval step itself** with existing scripts: `plan-approved: yes` via `feature-state.js`, answers into the plan and decisions log, tracker card to in-progress, `run-started` progress line; the feature joins Up next. | story 3 (#6j2VQr5PCV64PGx2) AC1 | |
| D16.4 | A slot frees → `/implement --resume <fid>` reads the approval from disk and builds. The worker never resumes a feature at the gate without the click. | story 31 (#6j2VjG4g28qV4rH2) AC3 | |
| D16.5 | Terminal runs keep today's behaviour (a resume after the gate is the approval) | story 3 (#6j2VQr5PCV64PGx2) AC3 | |
| D17.1 | Plan version: the worker keeps numbered copies (`plan.v<n>.md`) each time the plan changes after the gate is shown (code). | story 20 (#6j2VRQHCh84G4jmR) AC2 | |
| D17.2 | Coverage table: the planner saves it into the plan; `source-lines.js` checks every spec line is listed. | story 4 (#6j2VQvgJmRRPvVr2) AC1 | |
| D17.3 | Tests passed: the orchestrator saves suite-runner counts per story via `feature-state.js` (e.g. `tests=18/18`). | story 4 (#6j2VQvgJmRRPvVr2) AC2 | |
| D17.4 | Context used: read by the worker from Claude Code's token counts (code). | story 30 (#6j2VjCQ6VxJ3M6gR) AC3 | |
| D17.5 | Panel checks: each check writes a one-line status through a script beside its findings. | story 4 (#6j2VQvgJmRRPvVr2) AC3 | |
| D17.6 | Branch, started, titles, commits: already saved | story 20 (#6j2VRQHCh84G4jmR) AC1 | |
| D18.1 | Vision: features, order and status from the built-in tracker; the vision sentence from `tasks/vision.md` per repo (written by the user or drafted by `/plan-features`; room for milestones later); read-only in v1. | story 53 (#6j2VjwWRQ4V7mpX2) AC1 | |
| D18.2 | Completed: on merge the worker closes the feature's tracker item and writes PR number, merge date and story count into it; Completed lists closed features merged over a day ago. The tracker is the one permanent record | story 42 (#6j2Vjfg94WvR8Fw2) AC2 | |
| D19.1 | Projects list in `~/.harness/projects.json`. | story 17 (#6j2VRJ8QCj68Wp8R) AC2 | |
| D19.2 | **"Add a repo" becomes "New project"** with three choices: **brand-new project** (empty folder, git init), **existing folder** on this machine, **clone from a GitHub URL**. New and cloned projects go in a default projects folder (setting). | story 54 (#6j2VjxGvhP8vM3PR) AC1 | |
| D19.3 | Then the worker checks for the harness; if missing, the app says what it will add (`.claude/`, `tasks/`) and installs it on the user's OK with the existing installer, tracker set to built-in. | story 55 (#6j2Vjxx67G88vcmR) AC1 | |
| D19.4 | A repo whose harness is older than the app's is offered an update (`/update-harness`, run for the user). | story 55 (#6j2Vjxx67G88vcmR) AC2 | |
| D19.5 | **Mock needed before build** | Out of scope — done: design v2 has the New project mock | |
| D20.1 | The harness ships inside the app. The app checks for updates on a schedule (daily by default; setting: daily / weekly) and shows a notice with **what's new**, **Update now** / **Later**. | story 60 (#6j2Vm65xQ8gMwQ42) AC1 | |
| D20.2 | Updating the app brings the new harness; each project is then offered the harness update with the user's OK, because it changes files in their repo. | story 60 (#6j2Vm65xQ8gMwQ42) AC2 | |
| D20.3 | **Mock needed before build** | Out of scope — done: design v2 has the update notice mock | |
| D21.1 | **Direct message**: passed into the live session; shows "Sent · read at its next step", then "Read" when the worker sees it enter the run (code). | story 35 (#6j2VjPpVqQP44WrR) AC1 | |
| D21.2 | When no session is running (plan gate, paused, parked), the worker briefly reopens the same session with `claude --resume` to reply, then closes it; chat-only sessions take no build slot; plan changes bump the plan version. | story 35 (#6j2VjPpVqQP44WrR) AC2 | |
| D21.3 | Messages and replies are saved in the step history (90-day rule). | story 35 (#6j2VjPpVqQP44WrR) AC3 | |
| D21.4 | The "Supervised" label in the composer (DESIGN.md §4.3) is dropped | story 24 (#6j2VRX4JVGrRFvMR) AC4 | |
| D22.1 | **A separate, read-only Claude session per feature that answers at once while the build keeps running.** Starts with the plan, saved state, recent step history and current diff; may read repo files; read-only tools enforced by code at launch. | story 36 (#6j2VjR9rhvXRxfFR) AC1 | |
| D22.2 | Back-and-forth as long as wanted; kept per feature. | story 36 (#6j2VjR9rhvXRxfFR) AC2 | |
| D22.3 | **"Send to the run"**: it drafts the agreed instruction, the user sees and can edit the exact text, then it is delivered to the build run at its next step (tracked as in #21). | story 38 (#6j2VjWC4GcFMV5p2) AC1 | |
| D22.4 | Composer: side chat is the default, direct message is the second mode. | Out of scope — replaced by "Design version 2": the composer messages the run by default (story 37 AC1) | |
| D22.5 | No build slot. | story 36 (#6j2VjR9rhvXRxfFR) AC3 | |
| D22.6 | **Mock needed before build** | Out of scope — done: design v2 has the side chat mock | |
| D23.1 | Saved by the worker per feature when the Dig deeper drawer closes (worker's own folder); per machine now | story 44 (#6j2Vjgq7Wqqwm6hR) AC2 | |
| D23.2 | synced with phone later | Out of scope — phone sync is decided later | |
| D24.1 | **New feature opens its own planning view as a full page (not a modal), entered with a smooth transition**: plain-English description + project → **Plan this** starts a planning session (no build slot; up to 2 at once, setting). | story 48 (#6j2VjmcFP248wJrR) AC1 | |
| D24.2 | The session picks **grill-with-docs** if `CONTEXT.md` exists, else **grill-me** (code). | story 47 (#6j2Vjm9cFg52GR82) AC1 | |
| D24.3 | It sizes the idea first: one sitting → grill through, one question at a time as cards with the option detail panel; | story 49 (#6j2Vjp5p29f5h5h2) AC1 | |
| D24.4 | too big → it proposes **wayfinder** and, on OK, switches to a **map** of decision tickets resolved one per session ("Work the next ticket", also from Vision & roadmap). | story 51 (#6j2VjrXC97Xvmxr2) AC1 | |
| D24.5 | A live summary builds in a right-hand sidebar. | story 49 (#6j2Vjp5p29f5h5h2) AC2 | |
| D24.6 | When settled, the summary goes to **`/plan-features`**, which proposes features/stories with `blocked_by:` links; nothing is created until the user approves; the features then join Up next and each gets its own `/implement` plan gate. | story 50 (#6j2Vjq8pmWMXGrwR) AC1 | |
| D24.7 | A pasted issue number skips straight to that feature's plan gate. | story 50 (#6j2Vjq8pmWMXGrwR) AC2 | |
| D24.8 | Never grill and wayfinder at once. | story 51 (#6j2VjrXC97Xvmxr2) AC2 | |
| D24.9 | **Design to be done in Claude Design** (see `DESIGN-CHANGES.md`) | Out of scope — done: design v2 | |
| D25.0 | Agreed one by one; see the section "Decision 25 items" below | Out of scope — heading; its items are rows 25.1–25.15 | |
| 25.1a | Each project records its review bot, if any (auto-detected from the first bot comment on its PRs; editable in project settings); one small adapter per known bot knows its "done" signal (CodeRabbit first). | story 40 (#6j2Vjc9jW93mWJf2) AC1 | |
| 25.1b | No bot, or no clear signal, and for human comments: wait for **quiet** (no new comments for 10 min, setting). | story 40 (#6j2Vjc9jW93mWJf2) AC2 | |
| 25.1c | Always: fix everything, then **one push**; close every unfixed thread with a short reason ("bot misread X" / "moved to #42"); questions or disagreements become a card; the worker then confirms nothing is left open (#15). | story 41 (#6j2Vjcwrg52MfHG2) AC3 | |
| 25.1d | No reviews at all: wait for checks and the user's merge. | story 39 (#6j2VjX769GmPfjMR) AC5 | |
| 25.2a | The worker, on merge: marks the feature and its stories done in the tracker (code); | story 42 (#6j2Vjfg94WvR8Fw2) AC3 | |
| 25.2b | turns stories that did not land into a **follow-up feature** linked to the original, which waits for its own plan approval; | story 42 (#6j2Vjfg94WvR8Fw2) AC4 | |
| 25.2c | removes the worktree only after checking nothing is uncommitted or unpushed, never with force, and tells the user if it can't. | story 42 (#6j2Vjfg94WvR8Fw2) AC5 | |
| 25.3 | Just before opening the PR: merge latest main into the feature branch (merge, no rebase); resolve clashes; if anything came in, re-run the feature's tests; confirm the branch is 0 behind; then open the PR. A hard clash (two features changed the same thing differently) is not guessed: it becomes a "Needs you" card. | story 6 (#6j2VQxWmqhjFC5CR) AC1 | |
| 25.4 | One `story-reviewer` run in its existing **Cross-story** mode reads every story's criteria together against the feature's scope and reports duplicates, gaps and criteria nobody could check. Runs once in the final review panel; findings are fixed like any other. | story 11 (#6j2VR7MfH6Rq33pR) AC1 | |
| 25.5a | Each project keeps a **self-check file, `docs/self-check.md`, committed to git** (one per project, "code in this project always…"), seeded with a short general list (negative case per criterion; bad input gives a clear error, not a crash; comments/docs claim nothing the code doesn't do; tests isolated and order-independent; the test rules hold). | story 7 (#6j2VR2GQW5RG8M32) AC1 | |
| 25.5b | The builder checks its own diff against it before handing back and fixes what it finds (reviews still review everything). | story 7 (#6j2VR2GQW5RG8M32) AC2 | |
| 25.5c | It grows through the docs step (item 7): a kind of review finding repeated in 2+ stories → a proposed new line, added only on the user's OK. | story 14 (#6j2VRF8JMVVm2qW2) AC3 | |
| 25.5d | **Neighbour tests** (existing tests next to the change) are named by the builder and run at the end of each story. | story 7 (#6j2VR2GQW5RG8M32) AC3 | |
| 25.6a | (a) Tests that cannot run on this machine are reported **"did not run"** with the reason, never "passed". | story 9 (#6j2VR4rpGGvvPPgR) AC1 | |
| 25.6b | (b) **Every project has house rules: `docs/definition-of-done.md`, committed to git and named by the project's `CLAUDE.md`** (what every finished feature includes, e.g. README, changelog, no new warnings, new settings in the example config). | story 13 (#6j2VRC6mCq49F8mR) AC1 | |
| 25.6c | New project / install / update drafts a starter list fitted to the project for the user to approve. | story 56 (#6j2Vm2gPCf9HHq52) AC1 | |
| 25.6d | The builder gets it as a checklist; **before the PR a reviewer walks it line by line**: met (where) / not applicable (why) / outstanding. Small outstanding items are fixed in-run; bigger ones go to "Not done", registered as tracker items per `rules/deferrals.md`. | story 13 (#6j2VRC6mCq49F8mR) AC2 | |
| 25.6e | The docs step (item 7) proposes new house rules (something new needs a rule, or a problem repeats across features); added only on the user's OK. | story 14 (#6j2VRF8JMVVm2qW2) AC4 | |
| 25.6f | (c) The PR body opens with a **"Not done"** section. | story 13 (#6j2VRC6mCq49F8mR) AC3 | |
| 25.7a | **Lean `CLAUDE.md`**: it only points to `docs/rules.md` (the project's own rules), `docs/branding.md`, `docs/definition-of-done.md` (item 6) and `docs/self-check.md` (item 5), all in git. The docs step edits those files, never `CLAUDE.md` beyond adding a pointer. | story 14 (#6j2VRF8JMVVm2qW2) AC1 | |
| 25.7b | **Docs step** (before the PR, own commit): updates README / `docs/` / setup instructions to match what was built; proposes new house-rules and self-check lines from this feature's findings (user's OK each); adds a lesson only when no test or rule already catches the trap. | story 14 (#6j2VRF8JMVVm2qW2) AC2 | |
| 25.7c | **Rules review once per feature**: per-story reviews keep "does it work?" (Correctness); the per-story Rules-and-quality review is replaced by one whole-feature review against `docs/rules.md` and `docs/branding.md`. | story 14 (#6j2VRF8JMVVm2qW2) AC5 | |
| 25.7d | **Port the factory's `/branding` skill**: reads the existing UI (colours, fonts, styles, components, screens) and grills the user; writes checkable rules, not adjectives; converts an existing brand guide; may include screenshots of current screens. | story 16 (#6j2VRH7X8xxf9gj2) AC1 | |
| 25.7e | Offered at New project or the first feature that changes something users see, when the project has a UI and no branding file. Projects without a UI are not asked. | story 57 (#6j2Vm3G2rH4PxfM2) AC1 | |
| 25.8a | Before counting a red test as this feature's failure: run it alone (passes → flaky or machine busy); run it on `main` in a scratch copy (fails → already broken); timeout-only failure → re-run alone with a longer limit. | story 8 (#6j2VR38QPm6PH6GR) AC1 | |
| 25.8b | Then: caused by this feature → fix as normal; flaky/already broken and small → fix in its own commit; bigger → registered as a tracker item and noted in the PR, never allowed to swallow the feature (`rules/autonomous-mode.md` scope, `rules/deferrals.md`). | story 8 (#6j2VR38QPm6PH6GR) AC2 | |
| 25.8c | The step history records each suite's duration. | story 8 (#6j2VR38QPm6PH6GR) AC3 | |
| 25.8d | (Items 5 and 6) House rules vs self-check: house rules = what a finished **feature** includes, checked once per feature before the PR; self-check = mistakes the **code** must avoid, checked by the builder every story. Both grow only through the docs step with the user's OK. | story 14 (#6j2VRF8JMVVm2qW2) AC6 | |
| 25.9a | The final panel runs 4 reviews instead of 8 when the whole feature changed **under 300 code lines** and touched **nothing sensitive**. | story 10 (#6j2VR668rhjQ9P92) AC1 | |
| 25.9b | A **script decides, not the AI** (decision 15): it counts changed code lines and matches changed file paths (`auth`, `login`, `permission`, `payment`, `billing`, `secret`, `migration`, …) and changed lines (`password`, `token`, `apiKey`, `DROP TABLE`, …) against a per-project list seeded with a starting set that the user can extend. Any match or 300+ lines → full panel. | story 10 (#6j2VR668rhjQ9P92) AC2 | |
| 25.9c | The script's verdict and reason are saved so the screen can show why a feature got the lighter panel. | story 10 (#6j2VR668rhjQ9P92) AC3 | |
| 25.10a | Each check keeps its proof: a screen recording of the app window (Playwright; no webcam or microphone), the request/response for an API, or the test output. Named `AC<n>-story<s>-<kind>.<ext>`, stored in `tasks/features/<fid>/evidence/`, gitignored, never uploaded, deleted on the step-history retention schedule (summary lines kept forever). | story 15 (#6j2VRG4HcHG7M9PR) AC1 | |
| 25.10b | A **script** confirms every "met" has a non-empty proof file, and a "met" without one doesn't count. A sign-off check shows "signed off by you" instead of a file. | story 15 (#6j2VRG4HcHG7M9PR) AC2 | |
| 25.10c | Dig deeper shows a player or viewer per check. | story 46 (#6j2Vjjcp6hP858j2) AC1 | |
| 25.11 | After fixing panel findings, one pass checks only those findings and marks each **GONE** or **STILL THERE**; it does not hunt for new ones. If the fix touched anything the item 9 script calls sensitive, the security review re-runs in full (code decides). Replaces re-running the whole panel until clean. | story 12 (#6j2VR8q86WQp7Rp2) AC1 | |
| 25.12 | Instead the plan gate gets an **Accept all recommended** button that fills every unanswered question with its recommended answer; the user still sees each and presses Approve. | story 33 (#6j2VjJHh8qJjhQw2) AC2 | |
| 25.13 | story-reviewer's Cross-story mode also runs on the plan **before the plan gate** (plan only, no code): duplicates and untestable checks are fixed in the plan; a gap that needs a choice becomes a gate question. It still runs again in the final panel to catch drift. | story 11 (#6j2VR7MfH6Rq33pR) AC2 | |
| 25.14a | After each story's commit, push the feature branch (one branch per feature, one commit per story, **no story branches**). Backup only, and `main` is untouched until the PR merges. Never force-push: fixes are new commits and catching up with main is a merge (item 3). | story 5 (#6j2VQwhfrHJfqMm2) AC1 | |
| 25.14b | Knock-on: the session-start cleanup in `rules/git-worktrees.md` decides "merged" from **the PR being merged on GitHub**, not from the branch being gone from origin; the Feature live check stays. | story 5 (#6j2VQwhfrHJfqMm2) AC2 | |
| 25.15 | **Stories within a feature stay one at a time** for v1; parallelism is across features (5 slots). Story-level parallel (own folder and branch per independent story, merged back into the feature branch) is revisited only if a single feature proves too slow in real use. | Out of scope — no change: stories already run one at a time | |
| 25.NB | **Not brought over from work-feature:** proceeding on ambiguity (we ask at the plan gate); dropping the per-story review; auto-merge (the user always merges); PR watching inside the AI session (the worker does it, decision 13); writing tests after the code for coverage (we stay test-first). | Out of scope — decided not to bring over | |
| V2.1 | **Composer default changes decision 22:** typing in the composer **messages the run by default**; side chat opens from its own button beside Send, as v2 shows. | story 37 (#6j2VjVQcP6W8gRHR) AC1 | |
| V2.2 | **No "proof removed" note anywhere.** Retention is shown only in Settings. | story 43 (#6j2VjgFxQRv7WwxR) AC3 | |
| V2.3 | one approve message ("Approved. It starts on its own when a slot frees up."); | story 33 (#6j2VjJHh8qJjhQw2) AC4 | |
| V2.4 | the proposed features can still be changed by talking to the planner before **Create these**; | story 50 (#6j2Vjq8pmWMXGrwR) AC3 | |
| V2.5 | "Not done" also lists unmet house-rule items; | story 13 (#6j2VRC6mCq49F8mR) AC4 | |
| V2.6 | the New project install screen lists every file it adds (`.claude/`, `tasks/`, the `docs/` house rules, self-check and branding files, the CLAUDE.md pointer); | story 55 (#6j2Vjxx67G88vcmR) AC3 | |
| V2.7 | board and Focus answer buttons get `aria-pressed`; | story 32 (#6j2VjHHXPjJMgQG2) AC3 | |
| V2.8 | v1 details the prototype still has (Plan v4 bar, comment on a plan line, "Writing the plan" | story 33 (#6j2VjJHh8qJjhQw2) AC5 | |
| V2.9 | chat change chips, peek composer wording | story 24 (#6j2VRX4JVGrRFvMR) AC5 | |
| V2.10 | faded Merged cards) are kept; | story 22 (#6j2VRV43PRxxjf5R) AC4 | |
| V2.11 | prototype-only controls (Simulate the merge, Mac/Windows toggle) are dropped; | story 21 (#6j2VRR7FwxjhFjq2) AC4 | |
| V2.12 | principle "asks every question at once at the plan gate, then straight to the PR" still holds. | story 33 (#6j2VjJHh8qJjhQw2) AC6 | |
| V2.13 | Completed rows expand to show each feature's checks; | story 43 (#6j2VjgFxQRv7WwxR) AC2 | |
| V2.14 | new card labels ("Planning · sizing it up", "Planning · features ready to create" | story 48 (#6j2VjmcFP248wJrR) AC3 | |
| V2.15 | "Resumes at the next free slot"); | story 34 (#6j2VjMc3RxhhHRw2) AC3 | |
| V2.16 | the side chat opening animation. | story 37 (#6j2VjVQcP6W8gRHR) AC2 | |
| V2.17 | **v2 DATA.md's build notes are ignored where they differ from this file:** where logic runs, the Agent SDK, `depends-on:`, `control.json`, receipts written by the AI, reading the Claude transcript, settings location, house-rule/brand/proof file paths, rebasing, the light-panel rule, and the PR quiet-time-only rule. | Out of scope — an instruction to planning, applied throughout (no story builds the ignored notes) | |
| V2.18 | the planning-view files (`session.json`, `map.json`, `summary.json`, `proposal.json`) and the script that checks them; | story 47 (#6j2Vjm9cFg52GR82) AC2 | |
| V2.19 | the formats of the inbox, receipts | story 35 (#6j2VjPpVqQP44WrR) AC4 | |
| V2.20 | and side chat files; | story 36 (#6j2VjR9rhvXRxfFR) AC4 | |
| V2.21 | where per-project settings live; | story 10 (#6j2VR668rhjQ9P92) AC4 | |
| V2.22 | which 4 of the 8 reviews the light panel runs; | story 10 (#6j2VR668rhjQ9P92) AC5 | |
| V2.23 | the "branding offer skipped" flag. | story 57 (#6j2Vm3G2rH4PxfM2) AC2 | |
| OC1 | **Recommended: spawn the user's own installed, unmodified `claude` CLI** (`-p`, `stream-json` in and out, `--verbose --include-partial-messages`, `--forward-subagent-text`; resume with `--resume <id>`; never `--bare`). | story 26 (#6j2VRcwVggGWRcHR) AC3 | |
| OC2 | The app must never read, store or proxy their credentials, and never pay for or resell their usage. | story 26 (#6j2VRcwVggGWRcHR) AC4 | |
| OC3 | The Agent SDK may **not** use claude.ai subscription logins in a third-party product without Anthropic's approval: API key or cloud provider only. | Out of scope — a constraint met by OC1 (the CLI route); no story uses the Agent SDK | |
| OC4 | re-read the terms before launch, and the adapter also accepts the user's own API key as a fallback. | story 26 (#6j2VRcwVggGWRcHR) AC5 | |
| OC5 | Still to settle while building: the exact stdin message format; reported "Agent SDK credit" billing change (unconfirmed). | story 26 (#6j2VRcwVggGWRcHR) AC6 | |
| OC6 | Naming: the product must not use "Claude Code" or Anthropic names/logos in its name; "runs Claude Code" in plain text is fine. | story 21 (#6j2VRR7FwxjhFjq2) AC5 | |
