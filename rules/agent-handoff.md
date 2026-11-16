# Agent Handoff — Harness Rule

This file is the **single source of truth** for how a build agent reports back to the session that
started it, and what that session does with the report.

**Location:** `rules/agent-handoff.md` (installed alongside `.claude/skills/`; the `.claude/` copy is
a symlink to this file).
**Referenced by:** `skills/implement/SKILL.md`, `skills/sprint-plan/SKILL.md`, `skills/babysit-pr/SKILL.md`
and every agent an orchestrator starts: the agents `/implement` starts, directly or through `/debug` and
`/coverage-audit`, and those `/sprint-plan` and `/babysit-pr` start (the files in `agents/`).

---

## Why

The main session is one long conversation. Everything it reads is sent again on every later step, so
a session that re-reads what its agents already did runs out of room. Agents do the heavy work and
hand back a short result. A short result only helps if the session can act on it without checking it
all again, so every report starts with one line that says how the job went.

## The status line

Every agent an orchestrator starts reports with exactly one of these lines as its first line, and the brief says so:

- `STATUS: DONE`
- `STATUS: DONE_WITH_CONCERNS`
- `STATUS: BLOCKED`
- `STATUS: NEEDS_CONTEXT`

This applies to the agents an orchestrator starts. An agent a person launches reports to no
orchestrator, so it is the exception: it has `owner: person` and writes `none (person-launched)` in its
Interface Outputs instead of a `STATUS:` line.

The status is about the agent's **job**, not the code. A reviewer that returns findings, or a test
that failed when it was meant to fail, is `STATUS: DONE`.

## What the main session does

Route on the status line before reading the rest of the report. The rows below apply to every agent
(`skills/implement/SKILL.md`, `rules/autonomous-mode.md`).

| Status | What the main session does |
|---|---|
| `STATUS: DONE` | Check cheaply that what it names is real: the commit or file it names exists. Then use the result. |
| `STATUS: DONE_WITH_CONCERNS` | Read the concerns first. A concern about correctness or scope is dealt with before going on. An observation goes in the decisions log. |
| `STATUS: NEEDS_CONTEXT` | Give the agent what it asked for, from what the run has already read, and relaunch it. If only a person has it, ask (in an autonomous run, this is a pause-anyway trigger in `rules/autonomous-mode.md`). |
| `STATUS: BLOCKED` | When BLOCKED for missing context, relaunch it on the same model with the context added; when the job needs more reasoning, relaunch it fresh with `model: opus`, told what the first attempt tried. On a second BLOCKED, or when only a person can clear it, stop and ask. |

## A person agent

An agent with `owner: person` (`build-session`, `review-session`, `chief-operator`) is launched by a person, or
spawned by an external orchestrator as a fresh top-level session for a role. It reports no `STATUS:` line
(its Interface says "none (person-launched)"). An external orchestrator that spawns one routes on what it
leaves behind (its story files and its phase marker, `rules/phase-markers.md`), not on the table above.

## No status line

A report with no status line counts as `STATUS: DONE_WITH_CONCERNS`. The missing line is itself the
concern: read the report with care before relying on it.

## Never the same brief twice

Never relaunch the same brief on the same model unchanged. If the first attempt failed, something has
to change: the context, the model, or the size of the job.

## Never re-read

The main session never re-reads an agent's logs or transcript, never re-runs its commands and never
opens the files it wrote to see for itself. If it needs more, it asks one narrower question: a new
agent call naming the one test or criterion, or a read of the few lines one finding points at.

---

## One-line pattern for skills

> Every agent an orchestrator starts reports with a `STATUS:` line (`DONE`, `DONE_WITH_CONCERNS`, `BLOCKED` or
> `NEEDS_CONTEXT`); route on it per `rules/agent-handoff.md`, treat a missing line as
> `DONE_WITH_CONCERNS`, never relaunch the same brief on the same model unchanged, and never re-read
> the agent's work.
