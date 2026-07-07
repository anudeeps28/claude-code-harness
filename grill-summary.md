# Grill Summary: Chief Operator agent

**Date:** 2026-07-07
**Status:** Shared understanding reached — 12 forks resolved

---

## What we're building

A main-session project operator agent (`chief-operator`) that ships with the harness. Users launch it with `claude --model claude-opus-4-8 --agent chief-operator`. It reads project state, makes decisions, researches, analyzes, delegates implementation through handoff files and tracker tasks, and writes session handoffs — but never implements anything itself. It's the project lead: it thinks, delegates, and tracks; engineers (other sessions) build.

---

## Resolved forks

| # | Question | Decision | Key tradeoff |
|---|----------|----------|--------------|
| 1 | What does the CO do that slash commands don't? | Autonomous decision-making orchestrator — reads state, picks next action, delegates, manages phase transitions | User gives up direct control of sequencing in exchange for not having to be the scheduler |
| 2 | Agent or skill? | Agent (`--agent chief-operator`), replaces system prompt for the entire session | Can't invoke skills directly; carries own routing logic instead of piggybacking on skill entry points |
| 3 | Model routing for subagents | Three-bucket hardcoded table: Opus (architecture, complex debugging, plan critique), Sonnet (implementation, refactoring, test writing), Haiku (lookups, grep, formatting). CO itself runs on Opus | Simple and predictable vs. per-task judgment calls |
| 4 | Cross-session memory | Dedicated `operator-state.md` (isolated from `tasks/todo.md`) for operational state + existing auto-memory system for facts. State file has fixed sections: Current (max 3), Next (max 5), Blockers (max 3), Open Threads (max 5), Completed This Session (wiped on next start). Points to `tasks/stories/<id>/executor-state.md` for detail, never duplicates it | Two persistence channels; state file is a whiteboard not a filing cabinet |
| 5 | Staleness handling | Hybrid: timestamp-triggered verify-and-rewrite. Checks `sessions.jsonl` to count sessions since last CO update. If stale, reads old state as a hint, verifies each item against git/tracker/codebase reality, prunes stale items, rewrites. Never deletes-and-rebuilds — soft context (priorities, reasoning) survives verification | First-session-back costs a few seconds of tool calls for verification |
| 6 | What can the CO modify? | State and notes only: `operator-state.md`, memory files, `tasks/notes.md`, `tasks/lessons.md`, `tasks/stories/<id>/` handoff artifacts. Never touches agent definitions, skills, hooks, or rules. Flags harness improvements to the user for manual action | CO can't self-improve without user intervention; prevents shipped agent from breaking user's harness |
| 7 | Who is the CO for? | Ships with the harness as a general-purpose agent. Uses `YOUR_NAME`, `YOUR_PROJECT_ROOT`, `YOUR_PROJECT_NAME` substitution variables. Project-agnostic in source, project-specific after install | Must stay generic enough for any project while being useful out of the box |
| 8 | How does it delegate implementation? | Writes handoff files (`tasks/stories/<id>/brief.md`, decision docs, context) and creates tracker tasks via `trackers/active/` adapter scripts. User picks up work in separate sessions using `/implement` or `/story`, which already read those artifacts | Async handoff through existing harness channels, not real-time dispatch or copy-paste commands |
| 9 | Inline vs. subagent boundary | CO does all reasoning, decision-making, and synthesis itself. Spawns subagents only for information gathering (deep codebase exploration, reading many files, web research, running checks). Subagents return structured summaries; CO interprets and decides. Decisions never leave the CO's context | CO context carries all reasoning weight; subagents are fetch-workers only |
| 10 | New project vs. ongoing | Auto-detect via `operator-state.md` presence. Missing → bootstrap mode: spawn Explore agent to map project, write first state file, ask user for priorities. Present + not stale → resume mode: read state, verify against reality, brief user. No manual mode switching | File presence is the only signal; no flags or first-message conventions needed |
| 11 | Prompt length | Under 80 lines total. Three sections: Identity (~10 lines), Model routing table (~10 lines), Operating rules (~40 lines). No examples, no templates, no phase scripts. Trusts Opus to interpret constraints without hand-holding | Maximally concise; relies on model capability rather than procedural guardrails |
| 12 | Relationship to chief-of-staff | Coexist as separate agents. `chief-operator` = project orchestrator, `chief-of-staff` = communication triage. Different names, different jobs, clear description lines in frontmatter | Users must learn two "chief" agents; naming is distinct enough to avoid confusion |

---

## Cross-cutting principles

- **Never implements:** The CO reads, analyzes, decides, and delegates. It never writes code, edits implementation files, or runs builds. Implementation happens in other sessions via `/implement` or `/story`.
- **Delegates through existing channels:** Handoff files in `tasks/stories/<id>/` and tracker tasks via adapter scripts — not copy-paste commands or in-process subagents doing implementation.
- **State is a whiteboard, not a filing cabinet:** `operator-state.md` is overwritten every session end, capped by item limits, and verified against reality on resume. History belongs in git log and the tracker.
- **Decisions stay in the CO:** Subagents fetch information; the CO synthesizes and decides. No delegation of judgment.
- **Ships with the harness:** Uses substitution variables, installs alongside other agents, works for any project.

---

## Scope boundaries

**In scope:**
- `chief-operator.md` agent definition (~80 lines)
- `operator-state.md` state file format with fixed sections and item caps
- Bootstrap mode (new project) and resume mode (ongoing project)
- Three-bucket model routing table for subagents
- Delegation via handoff files + tracker tasks
- Staleness detection and verify-and-rewrite protocol
- Session-end state snapshot

**Out of scope:**
- **Direct implementation** — the CO never writes code or edits implementation files
- **Skill invocation** — agents can't call skills; the CO carries its own routing logic
- **Harness self-modification** — the CO flags improvements but never edits skills, agents, hooks, or rules
- **Merging with chief-of-staff** — they remain separate agents
- **Phase scripts or step-by-step procedures** — the CO operates by rules and constraints, not a runbook

---

## Open items

- Exact `operator-state.md` section format — pin down during implementation (the cap numbers are set: 3/5/3/5)
- Whether the CO's tool access list should be explicit in frontmatter (`Read`, `Bash`, `Agent`, `Write`) or use wildcard with prompt-level constraints
- How the CO detects which tracker adapters are available on first bootstrap (manifest read vs. directory scan)

---

## Recommended next steps

- `/architect` — design the `chief-operator.md` agent prompt, the `operator-state.md` schema, and the bootstrap/resume flow from this shared understanding
- `/to-issues` — break this into implementable GitHub issues (agent prompt, state file format, bootstrap mode, resume mode, staleness protocol, installer integration, docs)
