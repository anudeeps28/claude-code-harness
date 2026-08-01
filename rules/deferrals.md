# Deferrals — Harness Rule

This file is the **single source of truth** for what "deferred" means in this harness: when a skill is
allowed to ship something unfinished, and where that unfinished thing has to live so it comes back on
its own.

**Location:** `rules/deferrals.md` (installed alongside `.claude/skills/`; the `.claude/` copy is a
symlink to this file).
**Referenced by:** `skills/implement/SKILL.md`, `skills/story/SKILL.md`, `skills/evaluate/SKILL.md`,
`skills/sync-tracker/SKILL.md`, `rules/autonomous-mode.md`.

---

## The two failures this rule exists to prevent

1. **Mislabeling** — a defect that makes the shipped change behave incorrectly *right now* gets written
   up as a "follow-up" or "known gap", and ships. The bookkeeping looks impeccable and the feature is
   broken.
2. **Evaporation** — a genuine deferral is recorded as prose in a PR body, a decisions log, or a notes
   file. Nothing re-reads those. When the last tracker item closes, the tracker looks empty and every
   deferred item silently ceases to exist.

The first is a severity failure and the second is a memory failure. They are independent, and both
have to be closed or "deferred" stays a synonym for "forgotten".

---

## The ship test (apply BEFORE writing the word "deferred")

Ask exactly one question:

> **With this item left undone, does the change we are about to ship behave incorrectly for its real,
> configured inputs?**

- **Yes → it is not a deferral. It is a blocker.** Fix it, or do not ship the change. There is no
  third option and no severity label that converts a Yes into a No.
- **No → it is a genuine deferral.** Register it (next section). Never leave it as prose alone.

Three clarifications settle most real cases:

- **"The tests pass" is not evidence of a No.** Tests can encode the defect — a fixture that uses a
  value the system never actually uses will go green over a broken path forever. Answer the question
  against the project's **real configured values** (the roster, config files, env, the model or
  endpoint actually declared), not against test inputs.
- **The effort of the *ideal* fix is irrelevant.** "Doing this properly needs a schema change" is a
  statement about the ideal fix, not about the minimum fix. If a one-line correction makes the shipped
  behavior right, the one-line correction is the blocker and the schema change is the deferral. Split
  them and treat each on its own answer to the ship test.
- **A review agent's `ADVISORY` label is an input, not a verdict.** The agents rank findings by
  confidence and severity; they do not know what the project has configured. The ship test is applied
  by the orchestrating skill, over the agent's label, on every finding it is about to skip.

Record the answer, not just the conclusion — see *What a deferral record must contain*.

---

## Registration — a deferral is a tracker item, not a sentence

**At the moment of deferring**, before the PR is opened, create the tracker item:

```bash
bash .claude/trackers/active/create-issue.sh "<title>" "<body>" "deferred"
```

The adapter is mode-agnostic — this is the same call in local, tracker, and both mode, so a deferral
lands in a place `/plan` and the `rules/next-task.md` live check already query. That is the whole
mechanism: **the open tracker item is the deferral; the prose is only its description.**

Then, and only then, write it in the PR body — **with the id it was registered under**:

```
- Model→window sizing moved into the roster schema — #123
```

A "Deferred / follow-ups" bullet with no tracker id is a defect in the run, not a record. If the
tracker call fails (adapter missing, auth expired, offline), that is a **missing dependency** — say so
explicitly in the PR body and to the human; do not silently downgrade the item back to prose.

---

## What a deferral record must contain

The tracker item's body carries three things, in this order:

1. **What is undone** — the concrete missing work, not the symptom.
2. **What it costs while undone** — the observable consequence, in behavior. "Silently uses a 200k
   default" is a description; "recycles context at 16% occupancy on the configured model" is a cost.
3. **The ship test answer and why** — the No, with the reason it is a No. This is what a future reader
   (or a later sweep) needs in order to re-check the judgement instead of re-deriving it.

Link back to the originating PR or story id so the context is recoverable.

---

## Orphan sweep

Deferrals recorded before this rule — or by a run that skipped it — live as prose in PR bodies,
`tasks/notes.md`, and `tasks/stories/*/{decisions-log,evaluation}.md`. `/sync-tracker` harvests them:
it scans those sinks for deferral language, drops any line already carrying a tracker id, and offers
the survivors for registration. The sweep **proposes; it never registers silently** — each survivor
gets the ship test applied by a human or the orchestrating skill before it becomes an item, because a
sweep is exactly where a mislabeled blocker would otherwise be laundered into a backlog task.

---

## Under autonomous mode

The fix-vs-skip decision on review findings is self-answered by the orchestrator
(`rules/autonomous-mode.md`). The ship test is **not** self-answerable away: a Yes means the change is
shipping broken, which fails the reversibility test, so it is fixed in-run — and if it cannot be fixed
in-run, it is a **pause-anyway trigger** (a contradiction between the goal and what the code does), not
a logged decision. A No is self-answerable: register the item, log the decision, carry on.

---

## One-line pattern for skills

> Before deferring anything, apply the ship test in `rules/deferrals.md` — if the shipped change
> behaves incorrectly for its real configured inputs without it, it is a blocker, not a deferral.
> Every surviving deferral is registered as a tracker item at defer-time and referenced in the PR by
> its id; a deferral bullet with no id is a defect in the run.
