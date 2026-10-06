# Live Progress Tracking — Harness Rule

This file teaches the harness how to use the built-in **`TodoWrite`** tool to give the user
live, in-session visibility into multi-step work — the auto-updating checklist that fills in,
ticks off item by item, and shows what the harness is about to do *before* it changes any code.

**Location:** `.claude/rules/progress-tracking.md` (installed alongside `.claude/skills/`).
**The checklist tool is `TodoWrite`, or `TaskCreate` / `TaskUpdate` / `TaskList` in sessions that
have the newer task tools.** Either one counts; "TodoWrite" in this file means whichever the session
has. **If a session has neither, the build skill stops at startup** and says how to fix it: Claude
Code leaves these tools out on newer models unless `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` is set (in the
`env` block of `~/.claude/settings.json`), and the setting takes effect only after a restart
(code.claude.com/docs/en/tools, "Task tool availability"). It is checked once, at the start, so it is
never discovered halfway through a run. The checklist is still a live mirror, not the source of
truth: the story plan, the saved state and the phase marker are.

**Referenced by:** the multi-step execution skills (`/implement`, `/tdd`,
`/troubleshoot`, `/babysit-pr`, `/deploy`). Each one points here for the convention below.

---

## Core principle — TodoWrite *mirrors* the plan; it is not a second plan

The harness already has a **durable** record of work:

- The `<tasks story="…">` XML plan in `tasks/stories/<id>/plan.md` — survives context loss, drives
  `/implement --resume`. It lives in the always-local story workspace, in every tracker mode.
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
- **Exactly one item `in_progress` at a time** for sequential steps. Mark the next item `in_progress`
  when you start it.
- **A plan task is `completed` only when it is done, not when its `<verify>` passes.** Done means its
  tests **and the review** have passed. When its verify passes, append "(verified)" to its name and
  leave it `in_progress`; mark it `completed` in the same pass that writes `✅` to its `<task>` line in
  the story plan, after the review. A review finding on one of its files puts it back to plain
  `in_progress`. `/implement` defines the statuses (`verified`, `done`, `reopened`) in its "State and
  progress" section. In a Feature, each story runner keeps its own story's statuses the same way, and
  the orchestrator's checklist holds one item per story.
- A fixed-step skill (`/deploy`, `/tdd`) has no review step: mark a step `completed` when it genuinely
  finishes.
- A failed/blocked task stays `in_progress` (not `completed`) until it's resolved or escalated.
- For parallel waves, the wave's tasks may all be `in_progress` together.

## When NOT to use it

- Single-step or trivial tasks — a one-item checklist is noise.
- Pure diagnostic/read-only flows that make no changes and produce no multi-step plan (e.g. `/debug`,
  `/plan`, `/sprint-plan`). `/troubleshoot` is the exception: track its investigation iterations.
- Inside single-purpose sub-agents — they do one focused job in their own context; the orchestrating
  skill (running in the main loop, where the user is watching) owns the checklist.

---

## One-line pattern for skills

> Seed a `TodoWrite` list mirroring the plan before the first change; keep one item `in_progress`;
> mark a task `completed` only once it is done (tests and review passed), alongside the `✅` in the
> story plan (`tasks/stories/<id>/plan.md`). The story plan stays the source of truth; never
> hand-write the generated `todo.md`.
