# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/). This project adheres to [Semantic Versioning](https://semver.org/).

---

## [Unreleased]

### Added

- **Roster declares `contextWindow`.** Both shipped rosters (`templates/harness-roles.solo.json`, `templates/harness-roles.enterprise.json`) now carry an optional-but-always-shipped per-role `contextWindow` (1,000,000, matching `claude-opus-5[1m]`). Role facts belong to the roster, not to the consumer: an orchestrator sizes its context-recycle check off the declared window instead of guessing from the model id, so adding a model's window is a settings edit rather than a code change (DevOS SPEC §3.1, *"Role definitions live in the harness, not the OS… harness + OS changes ship together"*). Previously the consumer kept a hardcoded model→window map, which silently mis-sized any model missing from it. Additive and backward-compatible — a reader that doesn't know the field ignores it, and an absent or invalid value falls back to model-derived sizing. `model` and `contextWindow` are only correct together, so the install test now asserts both, pinned to one another.
- **`rules/deferrals.md` — the ship test and defer-time registration.** New single-source-of-truth rule closing two independent holes in how the harness ships unfinished work. **(1) Severity.** Before any review finding may be skipped, skills now apply the *ship test*: with this item left undone, does the change behave incorrectly for its **real configured inputs** — the roster, config, env, model or endpoint the project actually declares, not the values its tests use? A Yes is a blocker, and no `ADVISORY` label, green test suite, or "the proper fix needs a schema change" converts it into a deferral (a green suite is not evidence — a fixture using a value the system never uses will pass over a broken path forever; and the effort of the *ideal* fix says nothing about the minimum fix). **(2) Memory.** A deferral is now a tracker item created at defer-time via `trackers/active/create-issue.sh`, cited in the PR by its id — a "Deferred / follow-ups" bullet with no id is a defect in the run. Prose in PR bodies, decisions logs, and notes files never resurfaces, so "documented" was never the same as "tracked". Wired into `/implement`, `/story`, and `/evaluate` at their fix-vs-skip decision points and hard rules; `rules/autonomous-mode.md` marks the ship test explicitly non-self-answerable (a Yes that cannot be fixed in-run is a contradiction pause-anyway trigger, not a logged decision).
- **`/sync-tracker` Step 6.5 — orphaned-deferral harvest.** Reconciliation now runs in both directions: delivered work should be *closed*, and deferred work should be *open*. The new step scans `tasks/notes.md`, `tasks/lessons.md`, `tasks/stories/*/{decisions-log,evaluation}.md`, and merged PR bodies for deferral language, drops any line already carrying a tracker id, and offers the survivors for registration. It proposes and never registers silently, and applies the ship test to each survivor first — a sweep is exactly where a mislabeled blocker would otherwise be laundered into a low-priority backlog task. Read-only under `--dry-run`.
- **`rules/phase-markers.md` — the `phase.md` phase-marker convention.** New single-source-of-truth rule defining `tasks/stories/<id>/phase.md`: a plain `key: value` file (`schemaVersion`, `phase`, `role`, `updated`, `skill`, `detail`) overwritten in full at every subagent boundary, written by `/implement`, `/story`, `/run-tasks`, and `/evaluate` (writing as the `reviewer` role). There is no `persona` key — `harness-roles.json` is authoritative for the phase→persona display mapping, so a consumer joins on `phase`/`role` and reads the display name from the roster rather than trusting a duplicated string in the marker. An external orchestrator (e.g. DevOS's Story State Reader) live-derives the current phase — planning, coding, testing, reviewing, shipping — without knowing harness internals. Independent of `executor-state.md`, which remains the durable resume state.

### Changed

- **Role roster collapses from five sessions to two (`schemaVersion` 1 → 2).** `harness-roles.json` now declares `pipeline: ["builder","reviewer"]`: a **builder** (understand → plan → code → test → fix → commit/push/draft the PR body — the proven `/implement` / `/story` flow) and a fresh, adversarial, report-only **reviewer**. The five nautical names — Navigator, Shipwright, Lookout, Warden, Harbormaster — survive only as `phases[]` display metadata on each role, not as separate sessions. Each role entry now carries `displayName`, `skills`, `agent`, `phases[]`, `model` (`claude-opus-5[1m]`), `effort` (builder `medium`, reviewer `high`), and `producesArtifacts` — the old `stages` field is removed entirely; DevOS's roster-reader rejects a non-1 `schemaVersion` before it ever gets to reading role fields, so nothing there consumed `.stages`. The roster now declares only what an orchestrator *spawns* — the two new roles name far fewer skills than the five old roles did, because the old `decide`/`define` stages and the skills that lived there (`grill-me`, `wayfinder`, `architect`, `plan`, `sprint-plan`, `decision-brief`, `tdd`, `local-test`, `deploy`, `babysit-pr`, `sync-tracker`, `improve-harness`) are intentionally no longer named by any role — that work stays human-driven upstream of the roster, it has not been dropped. **Upgrade the consumer in lockstep with this bump:** DevOS's `readRoster` returns `null` on a `schemaVersion` mismatch and never throws, so an un-upgraded consumer silently loses the roster for *every* project it reads, with no diagnosable error — a `schemaVersion` of `1` is no longer valid and must not be read by old parsing logic.
- **`agents/builder.md` and `agents/reviewer.md` replace the five role agents.** `agents/navigator.md`, `shipwright.md`, `lookout.md`, `warden.md`, and `harbormaster.md` are removed; existing installs drop them on `/update-harness`. `builder` covers the planning/coding/testing/shipping phases in one session; `reviewer` covers the reviewing phase only and never fixes, commits, pushes, or opens a PR.

### Fixed

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
