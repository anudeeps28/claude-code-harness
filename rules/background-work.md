# Background Work — Harness Rule

This file is the **single source of truth** for what a skill must do about work it started in the
background before it ends its turn.

**Location:** `rules/background-work.md` (installed alongside `.claude/skills/`; the `.claude/` copy is
a symlink to this file).
**Referenced by:** `skills/implement/SKILL.md`, `agents/story-runner-agent.md`.

---

## The rule

**Never write a final summary, a STOP checkpoint, or otherwise end the turn while a background agent
or background command that this run started is still running.** Wait until every one of them has
reported, then write.

This covers every kind of background work the build skills start:

- a wave's `story-executor-agent`s;
- the review agents in Phase 3, when they are spawned in the background;
- a long test or build command run in the background;
- anything else launched with `run_in_background`.

## Why

A turn that ends early reports work that has not finished. Three things go wrong, all seen in real
runs:

1. **The summary is wrong.** It describes a wave or a review as done while an agent is still editing
   files, so the person approves something that is still changing.
2. **The STOP is unsafe.** The person answers a checkpoint and the next step starts while the last one
   is still writing to the same working directory, which is the clobber the wave rules exist to
   prevent (`rules/wave-execution.md`).
3. **The result is lost.** A background agent that finishes after the turn has ended reports into a
   conversation that has moved on, and its result, including a FAIL, is easy to miss.

Before this rule, "wait for all to complete" was written only inside the wave steps, so it did not
cover a review panel or a background test run.

## How to wait

You are told when a background agent or command finishes; there is nothing to poll. Do not sleep, do
not loop checking status, and do not write a "still waiting" summary that ends the turn. If you have
nothing else to do while you wait, say in one line what you are waiting for and wait.

If a background job seems stuck, check its output or its `phase.md` (see `rules/phase-markers.md` on
freshness). A job that is truly stuck is a failure to report, not a reason to end the turn: say which
one, what it last did, and stop the run as a failure.

## The one exception

A **deliberately detached long job the person was told about**: for example, a deploy or a full
regression run that you started on purpose, told the person you were leaving running, and told them
how to check on it. Name it in your summary as still running, with how to see its result. Anything
you did not explicitly hand over this way is covered by the rule.

---

## One-line pattern for skills

> Never end the turn, write a summary, or STOP while a background agent or command this run started
> is still running — wait for each to report (`rules/background-work.md`). The only exception is a
> long job you deliberately left running and told the person about.
