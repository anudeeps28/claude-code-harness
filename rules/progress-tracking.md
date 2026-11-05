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
`/babysit-pr`, `/deploy`). Each one points here for the convention below.

---

## Core principle — TodoWrite *mirrors* the plan; it is not a second plan

The harness already has a **durable** record of work:

- The story plan, `tasks/stories/<id>/plan.md` (one `## Story #<id>` section), and the saved state,
  `executor-state.md` — they survive context loss and drive `/implement --resume`. They live in the
  always-local story workspace, in every tracker mode.
- A skill's own fixed step list (e.g. `/deploy`'s steps, `/tdd`'s cycles).

`TodoWrite` is the **ephemeral, in-session mirror** of that durable record — nothing more.

- **The story plan (`tasks/stories/<id>/plan.md`) / the skill's step list is always the source of
  truth.** If the two ever disagree, the durable plan wins.
- Never invent todos that don't correspond to a real story or step in the plan.
- Never use `TodoWrite` *instead of* recording the position in the saved state — do both: the saved
  `step:` is the durable record, the `completed` TodoWrite item is the live signal. Update them in
  the same pass. **Never hand-write `tasks/todo.md`** — it is a generated dashboard (D9), not the plan.

The point is twofold: the **user** sees what's happening, and the **harness** commits to a concrete
checklist *before* touching code — so it knows what it's supposed to do, in order.

---

## When to seed the list

Seed the `TodoWrite` list **as soon as the concrete story/step list exists and before the first code
change** — i.e. right after the plan is approved (or, for fixed-step skills, at the start
of execution). Seeding it after work has begun defeats the purpose.

## How to maintain it

- **One TodoWrite item per story, plus the phases after it** (local verify, the review panel, the e2e
  gate, the PR) — same names the plan uses, so the user can map them. A standalone run has one story
  item; a Feature has one per story and then its panel, Prove it and PR.
- **Exactly one item `in_progress` at a time** for sequential steps. Mark the next item `in_progress`
  when you start it.
- **A story is `completed` only when it is done, not when its tests go green.** Done means the story's
  review **and the e2e gate** have passed. Until then its item stays `in_progress`; a review finding
  keeps it there. `/implement` defines the saved `step` and `round` in its "State and progress"
  section. In a Feature, the orchestrator marks a story's item `completed` when its commit is made and
  the Feature panel and Prove it are separate items after the stories.
- A fixed-step skill (`/deploy`, `/tdd`) has no review step: mark a step `completed` when it genuinely
  finishes.
- A failed/blocked story stays `in_progress` (not `completed`) until it's resolved or escalated.

## When NOT to use it

- Single-step or trivial tasks — a one-item checklist is noise.
- Pure diagnostic/read-only flows that make no changes and produce no multi-step plan (e.g. `/debug`,
  `/plan`, `/sprint-plan`).
- Inside single-purpose sub-agents — they do one focused job in their own context; the orchestrating
  skill (running in the main loop, where the user is watching) owns the checklist.

---

## One-line pattern for skills

> Seed a `TodoWrite` list mirroring the plan before the first change; keep one item `in_progress`;
> mark a story `completed` only once it is done (review and e2e gate passed), alongside its saved
> state (`tasks/stories/<id>/executor-state.md`). The story plan stays the source of truth; never
> hand-write the generated `todo.md`.
