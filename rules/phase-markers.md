# Phase Markers — Harness Rule

This file is the **single source of truth** for the `phase.md` marker contract: the plain-text file a
build or review skill writes at every subagent boundary so an external orchestrator (e.g. DevOS's
Story State Reader) can live-derive "what phase is this run in right now" without knowing harness
internals.

**Location:** `rules/phase-markers.md` (installed alongside `.claude/skills/`; the `.claude/` copy is a
symlink to this file).
**Referenced by:** `skills/implement/SKILL.md`, `skills/story/SKILL.md`, `skills/run-tasks/SKILL.md`,
`skills/evaluate/SKILL.md`.

---

## The contract

- **Sink:** `tasks/stories/<id>/phase.md` — one file per story. Create the story folder if it does not
  exist.
- **Write mode:** OVERWRITTEN in full on every transition — never appended. Each write replaces the
  entire file.
- **Format:** plain `key: value` lines, one per line. No YAML front-matter, no `---` fences, no other
  structure. **Key order is not significant** — consumers parse per key, not positionally. Writers
  should emit the order below for readability, but a consumer must never depend on it.

### Keys

- **`schemaVersion`** — the marker format version. Currently `1`. A consumer that does not recognize
  the value must treat the file as unreadable and retain its previous state rather than guess.
- **`phase`** — exactly one of five lowercase ids: `planning`, `coding`, `testing`, `reviewing`,
  `shipping`. For example, the planning phase writes `phase: planning`.
- **`role`** — which session wrote it: `builder` or `reviewer` (the two roles in `harness-roles.json`).
  This is the writer's identity, and it is required: the same story is worked by two sessions, so
  `phase: reviewing` written by the builder (its own in-session review) and by the reviewer session
  mean different things to a consumer.
- **`updated`** — ISO-8601 UTC timestamp, e.g. `2026-07-31T18:56:35Z`. **Required on every write** —
  staleness is derived from it (see *Terminal state and staleness*).
- **`skill`** — the skill that owns the run: `implement`, `story`, `run-tasks`, or `evaluate`.
- **`detail`** — one short **single-line** free-text description of the concrete step, e.g.
  `Phase 1c — implement-planner-agent`. See *Writing `detail` safely* — this is the only free-text
  field and the only one that can break the contract.

**The persona is NOT in the marker.** `harness-roles.json` is authoritative for the phase→persona
display mapping (`roles.*.phases[].displayName`: planning→Navigator, coding→Shipwright,
testing→Lookout, reviewing→Warden, shipping→Harbormaster). A consumer joins on `phase` and reads the
name from the roster, so renaming a persona really is a roster data edit and nothing else. Never
duplicate the persona string into the marker — that duplication is exactly the drift this contract
exists to prevent.

### Example

```
schemaVersion: 1
phase: coding
role: builder
updated: 2026-07-31T19:03:25Z
skill: implement
detail: Phase 2 Wave 1/3 — story-executor-agent (tasks 1, 2, 3)
```

---

## When to write

Write at **every subagent boundary** — immediately BEFORE spawning the agent(s) for that phase, not
after. Rewriting the same `phase` value with an updated `detail` (e.g. moving between waves within
coding) is expected and fine.

The marker is written in **every** run mode, interactive and autonomous alike. It is not gated on
`--autonomous`.

**The sequence is not monotonic.** A run may revisit an earlier phase — `/story` runs its goal gate
(`testing`) *after* its review phase (`reviewing`), and any skill may return to `coding` to fix what
testing found. A consumer must render `phase` as *current state*, never as monotonic progress along
the roster's `phases[]` order.

---

## Terminal state and staleness

There is no `done` phase id. `shipping` is the last phase a run writes, and it stays on disk after the
run ends — so **a consumer must not infer "in flight" from the presence of the file**. Freshness comes
from `updated`: a marker whose `updated` is older than the consumer's own liveness signal (e.g. no
active session for that project) describes a finished or abandoned run, not a running one.

---

## Writing `detail` safely

`detail` is the only free-text field, and a marker is machine-read by an external orchestrator that may
enforce gates on it. A writer that interpolates untrusted text (a tracker issue title, a branch name, a
task name from a public repo) into `detail` can otherwise forge the file's meaning. Writers **must**:

- collapse or strip every CR and LF — `detail` is exactly one line, always;
- strip C0 control characters and ESC (no ANSI sequences — consumers may render this in a terminal);
- cap the value (200 characters is plenty); truncate rather than wrap;
- never let interpolated text begin a new `key: value` pair.

Consumers **must** parse defensively to match: **first occurrence of a key wins**, unknown keys are
ignored (that is the forward-compatibility guarantee — a future `schemaVersion` may add keys), and a
file that is malformed, missing `phase`, or carries an unrecognized `schemaVersion` leaves the
previously known state untouched rather than throwing.

Every value in this file — like every value in `harness-roles.json` — is **argv data, never shell
text**. A consumer that spawns a process from these values must pass them as an argument array, never
interpolate them into a shell string.

---

## Relationship to `executor-state.md`

`phase.md` and `executor-state.md` are **independent contracts**. `phase.md` is the phase marker
described here. `executor-state.md` remains the durable execution/resume state (including `run-mode:
autonomous`, see `rules/autonomous-mode.md`). Do not merge them — they answer different questions
("what phase are we in right now" vs. "how do I resume this run").

---

## One-line pattern for skills

> At every phase boundary, write `tasks/stories/<id>/phase.md` per `rules/phase-markers.md` — overwrite
> in full with the six plain `key: value` lines (`schemaVersion`, `phase`, `role`, `updated`, `skill`,
> `detail`), before spawning that phase's agent. This happens in every run mode, not just autonomous.
