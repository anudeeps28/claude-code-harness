# Changelog

All notable changes to this project will be documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/). This project adheres to [Semantic Versioning](https://semver.org/).

---

## [1.0.0] - 2026-04-15

First public release. A supervised Claude Code workflow framework with two workflow packs (enterprise and solo), pluggable issue trackers, hardened hooks, and a self-improvement loop.

### Workflows

- **Enterprise pack** — sprint-based: `/sprint-plan`, `/story`, `/babysit-pr`, `/run-tasks`, `/sync-tasks`, `/pa`, `/deploy`. Designed for teams with formal sprints, code review cycles, and shared task files.
- **Solo pack** — issue-based: `/plan`, `/implement`. Lighter ceremony for individual developers.
- **Shared skills** — `/evaluate`, `/debug`, `/troubleshoot`, `/local-test`, `/ralph-prd`, `/skill-creator`, `/retro`.
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
  - **Per-invocation metric** appended to `tasks/metrics.jsonl`: `{ts, hook, duration_ms, decision, rule?}`. Feeds `/retro`.
  - **Errors logged to stderr as JSON** — `{error, hook, message}` — instead of swallowing silently.
- See [hooks/SECURITY.md](hooks/SECURITY.md) for the explicit threat model: oversight gate, **not** a sandbox. Bypassable by base64 encoding, variable indirection, `$IFS` tricks, MCP tool surfaces.

### Self-improvement loop

- `/retro [days]` reads the last N days of `tasks/sessions.jsonl`, `tasks/lessons.md`, `tasks/flags-and-notes.md`, and every `tasks/stories/<id>/evaluation.md`. Detects 6 friction patterns with a strict ≥2 recurrence threshold (≥3 for re-attempts) so single anomalies don't turn into noisy proposals.
- Output: `tasks/retro-<YYYY-MM-DD>.md` with concrete file:line edits to harness source. **Never auto-applied** — same supervised-agent principle as the rest of the harness.
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
