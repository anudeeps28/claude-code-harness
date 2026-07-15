# Live Progress Tracking — Harness Rule

This file teaches the harness how to use the built-in **`TodoWrite`** tool to give the user
live, in-session visibility into multi-step work — the auto-updating checklist that fills in,
ticks off item by item, and shows what the harness is about to do *before* it changes any code.

**Location:** `.claude/rules/progress-tracking.md` (installed alongside `.claude/skills/`).
**Referenced by:** the multi-step execution skills (`/story`, `/run-tasks`, `/implement`, `/tdd`,
`/troubleshoot`, `/babysit-pr`, `/deploy`). Each one points here for the convention below.

---

## Core principle — TodoWrite *mirrors* the plan; it is not a second plan

The harness already has a **durable** record of work:

- The `<tasks story="…">` XML plan in `tasks/stories/<id>/plan.md` — survives context loss, drives
  `/run-tasks`. It lives in the always-local story workspace, in every tracker mode.
- A skill's own fixed step list (e.g. `/deploy`'s steps, `/tdd`'s cycles).

`TodoWrite` is the **ephemeral, in-session mirror** of that durable record — nothing more.

- **The story plan (`tasks/stories/<id>/plan.md`) / the skill's step list is always the source of
  truth.** If the two ever disagree, the durable plan wins.
- Never invent todos that don't correspond to a real task/step in the plan.
- Never use `TodoWrite` *instead of* recording status in the durable plan — do both: the `✅` on the
  `<task>` line in `plan.md` is the durable record, the `completed` TodoWrite item is the live signal.
  Update them in the same pass. **Never hand-write `tasks/todo.md`** — it is a generated dashboard (D9),
  not the plan.

The point is twofold: the **user** sees what's happening, and the **harness** commits to a concrete
checklist *before* touching code — so it knows what it's supposed to do, in order.

---

## When to seed the list

Seed the `TodoWrite` list **as soon as the concrete task/step list exists and before the first code
change** — i.e. right after the wave/task plan is parsed (or, for fixed-step skills, at the start
of execution). Seeding it after work has begun defeats the purpose.

## How to maintain it

- **One TodoWrite item per task/step** in the plan — same names the plan uses, so the user can map them.
- **Exactly one item `in_progress` at a time.** Mark the next item `in_progress` when you start it.
- **Mark `completed` the moment its `<verify>` passes** (or the step genuinely finishes) — in the same
  pass where you write `✅` to the `<task>` line in the story plan. Don't batch completions to the end.
- A failed/blocked task stays `in_progress` (not `completed`) until it's resolved or escalated.
- For parallel waves, the wave's tasks may all be `in_progress` together; complete each as it returns.

## When NOT to use it

- Single-step or trivial tasks — a one-item checklist is noise.
- Pure diagnostic/read-only flows that make no changes and produce no multi-step plan (e.g. `/debug`,
  `/plan`, `/sprint-plan`). `/troubleshoot` is the exception: track its investigation iterations.
- Inside single-purpose sub-agents — they do one focused job in their own context; the orchestrating
  skill (running in the main loop, where the user is watching) owns the checklist.

---

## One-line pattern for skills

> Seed a `TodoWrite` list mirroring the plan before the first change; keep one item `in_progress`;
> mark `completed` alongside the `✅` in the story plan (`tasks/stories/<id>/plan.md`). The story plan
> stays the source of truth; never hand-write the generated `todo.md`.
