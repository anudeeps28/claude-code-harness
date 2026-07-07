# Architecture: Chief Operator Agent

**Status:** Draft
**Date:** 2026-07-07
**Source:** `grill-summary.md` (12 forks resolved)

---

## 1. What it is

A main-session project operator agent that ships with the harness. Launch:
`claude --model claude-opus-4-8 --agent chief-operator`. It reads project state,
researches, analyzes, makes decisions, and delegates implementation through
handoff files and tracker tasks. It never writes code.

**Analogy:** Project lead who writes well-scoped tickets with full context.
Engineers (other Claude sessions) build.

---

## 2. Component layout

```
┌──────────────────────────────────────────────────────┐
│  claude --model claude-opus-4-8 --agent chief-operator│
└──────────────────────┬───────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────┐
│              Chief Operator (Opus)                    │
│                                                      │
│  Reads:                    Writes:                   │
│  ├─ operator-state.md      ├─ operator-state.md      │
│  ├─ tasks/stories/*/       ├─ tasks/stories/<id>/    │
│  │   executor-state.md     │   brief.md, decisions   │
│  ├─ tasks/sessions.jsonl   ├─ tasks/notes.md         │
│  ├─ tasks/notes.md         ├─ tasks/lessons.md       │
│  ├─ tasks/lessons.md       ├─ tracker tasks          │
│  ├─ git status/log         │   (via trackers/active/)│
│  ├─ tracker (via adapters) └─ memory files           │
│  └─ memory files                                     │
│                                                      │
│  Spawns (fetch-only):      Delegates (async):        │
│  ├─ Explore agents         ├─ Handoff files          │
│  ├─ Research agents         │   in tasks/stories/    │
│  └─ Analysis agents        └─ Tracker tasks          │
│       (Haiku/Sonnet)           via trackers/active/  │
└──────────────────────────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   ┌────────────┐┌────────────┐┌────────────┐
   │ Session A  ││ Session B  ││ Session C  │
   │ /implement ││ /implement ││ /story     │
   │ #42        ││ #55        ││ #99        │
   └────────────┘└────────────┘└────────────┘
   User opens these separately. Each reads
   the handoff files the CO prepared.
```

---

## 3. Artifacts

### 3a. Agent definition (`agents/chief-operator.md`)

- Installed to `.claude/agents/chief-operator.md`
- Frontmatter: `model: opus`, `tools: [Read, Write, Bash, Agent, Grep, Glob]`
- Prompt: under 80 lines — Identity, Model routing table, Operating rules
- Substitution variables: `YOUR_NAME`, `YOUR_PROJECT_ROOT`, `YOUR_PROJECT_NAME`

### 3b. State file (`operator-state.md`)

- Location: `YOUR_PROJECT_ROOT/.claude/operator-state.md`
- Created by the CO on first run (bootstrap). Overwritten every session end.
- Staleness: compare file mtime vs latest `tasks/sessions.jsonl` entry.

Schema:

```markdown
<!-- operator-state | updated: YYYY-MM-DD -->

## Current
- [max 3] <description> — <status> → tasks/stories/<id>/executor-state.md

## Next
- [max 5] <description> — <reason for priority>

## Blockers
- [max 3] <description> — <what unblocks it>

## Open Threads
- [max 5] <description> — <last update>
```

Invariants:
- Never exceeds ~40 lines
- `Completed This Session` exists only during the active session; wiped on next start
- Items point to tracker tasks or `tasks/stories/<id>/` — never duplicate content
- History belongs in git log and tracker

### 3c. Handoff files

Written to `tasks/stories/<id>/` when delegating:

| File | Purpose | Consumed by |
|------|---------|-------------|
| `brief.md` | Pre-planning context, decisions, constraints | `/implement` Phase 1 |
| `decisions.md` | Key decisions with rationale | Planner agents |
| `context.md` | Research findings, codebase analysis | Planner agents |

Tracker tasks created via `bash trackers/active/create-issue.sh`.

---

## 4. Session flow

### Bootstrap (no `operator-state.md`)

1. Detect: no state file
2. Spawn Explore agent (Sonnet): map project structure, stack, open issues
3. Read tracker state via adapters
4. Synthesize and present: "Here's what I see. What are the priorities?"
5. Write first `operator-state.md`
6. Begin normal operation

### Resume (`operator-state.md` exists)

1. Read state file
2. Check staleness vs `sessions.jsonl`
3. If stale: read old state as hints, verify each item against git/tracker/files,
   prune stale items, rewrite. Brief user on changes.
4. If fresh: brief user on current state
5. Normal operation

### Session end

1. Overwrite `operator-state.md` with current snapshot
2. If harness improvements identified: tell user (never modify harness files)

---

## 5. Model routing

Hardcoded table in the CO prompt:

| Task type | Model | Rationale |
|-----------|-------|-----------|
| Architecture, debugging, plan critique | opus | Deep cross-file reasoning |
| Codebase exploration, file analysis | sonnet | Workhorse, 3x cheaper |
| Grep, file listing, simple checks | haiku | Mechanical, 10x cheaper |

The CO itself runs on Opus. All decisions stay in CO context.

---

## 6. Boundaries

### Writes
- `operator-state.md`
- `tasks/stories/<id>/` handoff files
- `tasks/notes.md`, `tasks/lessons.md`
- Memory files
- Tracker tasks (via adapters)

### Never touches
- Code files
- Agent definitions, skills, hooks, rules (flags improvements to user)
- `tasks/todo.md` (owned by implementation sessions)

### Never delegates
- Decisions — subagents fetch, CO decides
- Prioritization — CO owns the queue
- Handoff quality — CO writes all handoff files directly

---

## 7. Harness integration

| Component | Interaction |
|-----------|-------------|
| `session-router.js` | Still fires — CO can use its output |
| `session-context.js` | Injects learnings — CO reads as context |
| `session-log.js` | Logs session — CO reads `sessions.jsonl` for staleness |
| `pre-compact.js` | Fires on compaction — CO benefits from resume marker |
| `trackers/active/` | CO creates tasks; `/implement` and `/story` read them |
| `tasks/stories/<id>/` | CO writes handoffs; implementation skills read them |
| `chief-of-staff` agent | Separate agent — comms triage, not project ops |

No new hooks or infrastructure. The CO plugs into existing channels.

---

## 8. Installer integration

- Source: `agents/chief-operator.md`
- Installed to: `.claude/agents/chief-operator.md`
- Substitution: `YOUR_NAME`, `YOUR_PROJECT_ROOT`, `YOUR_PROJECT_NAME`
- No settings.json changes needed
- `operator-state.md` is not installed — created by the CO at first run

---

## Decision log

| Decision | Rationale |
|----------|-----------|
| Agent, not skill | Must shape session from first message |
| Opus-only for CO | Decision quality justifies cost; subagents use cheaper models |
| Separate state file | Operational state differs from task lists |
| Handoff via files + tracker | Async delegation through existing channels |
| Under 80 lines | Opus needs constraints, not procedures |
| Verify-and-rewrite for staleness | Preserves soft context that pure expiry loses |
| Coexists with chief-of-staff | Different domains, no merge |
