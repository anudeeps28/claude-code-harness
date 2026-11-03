# Agent Handoff — Harness Rule

This file is the **single source of truth** for how a build agent reports back to the session that
started it, and what that session does with the report.

**Location:** `rules/agent-handoff.md` (installed alongside `.claude/skills/`; the `.claude/` copy is
a symlink to this file).
**Referenced by:** `skills/implement/SKILL.md` and every agent that `/implement` starts, directly or
through `/debug` and `/coverage-audit` (the files in `agents/`).

---

## Why

The main session is one long conversation. Everything it reads is sent again on every later step, so
a session that re-reads what its agents already did runs out of room. Agents do the heavy work and
hand back a short result. A short result only helps if the session can act on it without checking it
all again, so every report starts with one line that says how the job went.

## The status line

Every agent's report starts with exactly one of these lines, and the brief says so:

- `STATUS: DONE`
- `STATUS: DONE_WITH_CONCERNS`
- `STATUS: BLOCKED`
- `STATUS: NEEDS_CONTEXT`

The status is about the agent's **job**, not the code. A reviewer that returns findings, or a test
that failed when it was meant to fail, is `STATUS: DONE`.

## What the main session does

Route on the status line before reading the rest of the report. An agent whose own file defines a
`RESULT:` block (`story-executor-agent`, `story-runner-agent`) is routed by that `RESULT:` under the
existing rules (`skills/implement/SKILL.md`, `rules/wave-execution.md`, `rules/autonomous-mode.md`);
its `STATUS:` line is only the first line of its report. The relaunch rows below apply to every other
agent.

| Status | What the main session does |
|---|---|
| `STATUS: DONE` | Check cheaply that what it names is real: the commit or file it names exists. Then use the result. |
| `STATUS: DONE_WITH_CONCERNS` | Read the concerns first. A concern about correctness or scope is dealt with before going on. An observation goes in the decisions log. |
| `STATUS: NEEDS_CONTEXT` | Give the agent what it asked for, from what the run has already read, and relaunch it. If only a person has it, ask (in an autonomous run, this is a pause-anyway trigger in `rules/autonomous-mode.md`). |
| `STATUS: BLOCKED` | When BLOCKED for missing context, relaunch it on the same model with the context added; when the job needs more reasoning, relaunch it fresh with `model: opus`, told what the first attempt tried. On a second BLOCKED, or when only a person can clear it, stop and ask. |

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

> Every agent's report starts with a `STATUS:` line (`DONE`, `DONE_WITH_CONCERNS`, `BLOCKED` or
> `NEEDS_CONTEXT`); route on it per `rules/agent-handoff.md`, treat a missing line as
> `DONE_WITH_CONCERNS`, never relaunch the same brief on the same model unchanged, and never re-read
> the agent's work.
