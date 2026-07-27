# Autonomous Mode — Inherited Convention (Harness Rule)

This file is the **single source of truth** for how autonomous mode behaves across the harness. The
`--autonomous` flag is declared on the **orchestrator skills only** (`/implement`, and — as sibling
work — `/story`). Every sub-skill and agent an orchestrator invokes **inherits** the mode; sub-skills
have **no `--autonomous` flag of their own** (grill decision, fork 6).

**Explicit autonomous entry points.** Autonomy always begins at an *explicit* signal (never assumed —
see "How the mode is inherited" below). There are two kinds: `--autonomous` on an orchestrator (the
forward flow), and `--rework <PR#>` on `/implement` (the reject-loop that re-enters an open PR). Both
are direct, human-typed flags whose presence *is* the signal, so both run under the self-answer rule
without contradicting "autonomy is only ever inherited from a signal" — the flag itself is that signal.
`--rework` is **not** a second `--autonomous`-style flag on sub-skills; it is a mode selector on the
orchestrator that happens to imply autonomous semantics. A rework run is keyed by PR number and has no
story workspace, so its decisions log stays inline (see the decisions-log section).

**Location:** `rules/autonomous-mode.md` (installed alongside `.claude/skills/`; the `.claude/` copy
is a symlink to this file).
**Referenced by:** `skills/implement/SKILL.md`, `skills/story/SKILL.md`, `skills/run-tasks/SKILL.md`,
`skills/tdd/SKILL.md`, `skills/debug/SKILL.md`, `skills/local-test/SKILL.md`.

---

## What autonomous mode is

An autonomous run executes the **entire** flow with **no human STOP checkpoints**. The PR is the
single human gate. The mode changes *only whether the flow pauses* — it changes nothing about *what
work is done*: every phase, the goal definition, the e2e gate, local tests, and all safety machinery
still run.

---

## The self-answer rule (the core of the mode)

At every point where the flow would normally STOP and wait for a human:

- If the decision is **reversible** AND there is a clear recommended option → **take the recommended
  option, do not wait**, and append one line to the **decisions log** (below).
- Otherwise → **pause and ask.** This is the only thing that stops an autonomous run mid-flight.

## Pause-anyway triggers

An autonomous run stops and asks the human on any of these, regardless of the self-answer rule:

- **Contradiction** — the task, brief, or code conflict in a way you cannot reconcile with a
  recommendation.
- **Irreversible action** — anything destructive or hard to undo (deleting data, force-push, history
  rewrite, dropping a table, etc.). Committing and pushing your *own* branch and opening a PR are
  reversible and non-destructive; force-push is not.
- **Scope change** — the work turns out materially larger or different than the approved brief/goal.
- **3-failed-attempts** — the 3-attempt rule fires (route to `/debug`, which itself runs inherited-
  autonomous; see "How `/debug` behaves" below).
- **Missing dependency** — a skill, agent, script, or tracker adapter the flow names by identity is
  not installed. **Never substitute a replacement.** A named agent definition *is* a quality contract
  (its system prompt encodes the planning structure, executor discipline, or review checklist the
  phase depends on); swapping in a `general-purpose` agent with an improvised prompt silently changes
  *what work was done*, not just how it was done — so it fails the reversibility test no matter how
  close the substitute looks. Same for a missing skill or tracker script: stop and report the exact
  missing identity and the phase that needed it. This is a harness defect, not a decision — route it
  to `/improve-harness` once unblocked.

A task **FAIL or BLOCKED** result also halts the run — that is a genuine block, not a checkpoint, and
`--auto`'s "pause on failure" behavior is unchanged. `--autonomous` implies `--auto`.

---

## The decisions log

Keep a running list of every self-answered decision. **Sink:** append to
`tasks/stories/<id>/decisions-log.md` (create it if absent) — one line per decision:

```
- <question> → <chosen option> (reversible; <one-line why>)
```

Both the orchestrator and every inherited sub-skill/agent append to the **same** file. The
orchestrator's PR step renders it verbatim under a **"Decisions made on your behalf"** section, so the
reviewer sees every reversible call made without them. If a run has no story workspace (see below),
keep the log inline in the conversation and hand it to the PR step directly.

---

## How the mode is inherited (the mechanism)

A sub-skill or agent is a prompt, not code — it "inherits" the mode by **detecting a signal**. Two
signals, checked in this order:

1. **Invocation context (primary).** When an autonomous orchestrator invokes a sub-skill or spawns an
   agent, it states in the invocation: *"This is an autonomous run — self-answer your checkpoints per
   `rules/autonomous-mode.md` and append decisions to `tasks/stories/<id>/decisions-log.md`."* The
   sub-skill honors that.
2. **Durable marker (for standalone resume).** An autonomous orchestrator writes `run-mode:
   autonomous` into `tasks/stories/<id>/executor-state.md`. A skill invoked **standalone** against an
   existing story (e.g. `/run-tasks <id>` after a crash) reads that marker and inherits the mode even
   though no live orchestrator is present.

**Default = interactive.** A skill invoked directly by a human with **neither** signal present runs
with all its normal STOP checkpoints. Autonomy is never assumed — it is only ever triggered by an
explicit signal. Alongside the two inheritance signals above, a **human-typed autonomous entry flag is
itself an explicit signal**: `--autonomous` on an orchestrator, or `--rework <PR#>` on `/implement`,
each turns that same run autonomous directly (no upstream orchestrator required) — this is consistent
with "never assumed," because the flag the human typed *is* the signal. Skills that do not operate on a
story workspace (`/tdd`, `/debug` when run standalone) can only inherit via signal 1; run directly by a
human with no flag they stay interactive, which is correct.

---

## No-op skills and agents

Some invoked components have **no human checkpoints** and therefore need no autonomous behavior — the
mode passes through them unchanged:

- **`/local-test`** — pure verify-and-report; always reports its result back to the caller.
- **Report-only review agents** — `evaluator-agent`, `acceptance-test-agent`,
  `architect-reviewer-agent`, `security-reviewer-agent`. They return findings; they never pause for a
  human. The **fix-vs-skip decision on their findings** lives in the orchestrator and is self-answered
  there (a finding at/above the confidence threshold → fix and log; below → skip and log).

These are documented as no-ops so it is explicit that "propagation" reached them and there was
nothing to change.

---

## How `/debug` behaves under inherited autonomy

`/debug` is the destination of the 3-attempt rule, so its inherited behavior is deliberate:

- It **self-drives** the diagnosis: build the deterministic feedback loop, then self-select and test
  hypotheses **one at a time**, reverting on failure. Each hypothesis test is reversible *because* the
  feedback loop is deterministic, so it is self-answerable.
- It **pauses (genuine block)** only when it cannot build a deterministic signal, or when all
  hypotheses are exhausted (its 3-failed-hypotheses escalation).

This preserves "pause only when genuinely blocked": the orchestrator's 3-attempt → `/debug` route
tries a deterministic diagnosis first, and escalates to the human only if `/debug` itself cannot
resolve it.

---

## One-line pattern for skills

> This skill has no `--autonomous` flag. When it detects an inherited autonomous run (invocation
> context, or `run-mode: autonomous` in the story's `executor-state.md`), it self-answers its own
> STOP checkpoints per the self-answer rule above, logs each decision to the story's
> `decisions-log.md`, and pauses only on a pause-anyway trigger. With neither signal it runs
> interactively, exactly as before.
