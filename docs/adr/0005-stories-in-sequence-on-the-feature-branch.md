# ADR-0005 — Stories are built one after another on the Feature branch

- **Status:** accepted (2026-11-03): built in F72
- **Date:** 2026-11-03
- **Decided by:** Anudeep Sharma (F72 plan gate)
- **Supersedes:** [ADR-0002](0002-story-worktrees.md) (a worktree per story) and [ADR-0003](0003-orchestrator-only-merger.md) (merge each story, tested, before commit)

## Context

ADR-0002 and ADR-0003 ran a Feature's independent stories in parallel, each in its own worktree with
its own runner, and merged each one into the Feature branch after a test. It worked, but it cost too
much. A real Feature run spent 70 to 90 agents and used a 5-hour usage window in about an hour.
Most of that was fixed cost per story (a runner, a planner, executors, two reviewers, retries), paid
once per story, plus the same again for the Feature panel.

The Software Factory's `work-feature` builds stories one after another on one branch, with one commit
per story, and it has been the cheaper and steadier model. The harness had drifted from it, so this
decision also restores parity with the Software Factory.

## Decision

We will build a Feature's stories **one after another, in plan order, in the one Feature worktree, on
the Feature branch**. There are no story worktrees, no story branches, no story runner and no merge
step.

- **One commit per story**, with the trailer `Story: #<sid>`. A story is committed only when its scoped
  tests are green on the final state.
- **The main session does the coordinating**, on Sonnet. `story-builder` writes the tests, then the code;
  `suite-runner` runs the suite and shows red, then green; `story-reviewer` reviews. That is about six
  agents per story, plus fix rounds. Opus is kept for the jobs that need judgement.
- **Parallel only across Features.** Two Features side by side, each in its own Feature worktree, is
  planned (story #73) and not built yet. Stories inside a Feature never overlap.
- **Resume reads the `Story:` commits.** A story with its commit is done and never redone.
- **The sequence is proven** by `feature-state.js sequence`, which reads the Feature's progress
  log and reports any two stories that were in flight at the same time.
- The wave-execution ban on `isolation: "worktree"` stays. A Feature's stories have no waves and no
  executors; the wave rules apply to standalone single-story runs only. The Feature worktree still gets
  the branch check, and restore-before-retry still applies to a failed job's files.

## Consequences

- **No per-story isolation.** A story's half-done edits sit in the same folder as the next story's. The
  fix is the discipline: commit a story only on green, stage by path, and check the branch before each
  story.
- **A stuck story holds only its dependents.** Stories that do not depend on it are still built and
  committed, one at a time. The run stops for a person when only held stories remain.
- **Fewer agents, and an expected lower usage rate.** The per-story runner, the per-story planner and the
  per-merge test are gone. The measured numbers come from the run report once a Demo has run
  (ARCHITECTURE.md §3).
- **A slower wall clock** for a Feature of independent stories, because they no longer overlap. This is
  the price, accepted for the token cost.
- The disk, restore and config-copy cost of many worktrees is gone: one Feature worktree.
- `rules/wave-execution.md` and `rules/git-worktrees.md` lose the story-worktree text.
- ADR-0004 (work folder and state folder) is unchanged: the builders still get both.

## Trade-offs considered

| Alternative | Why rejected |
|---|---|
| Keep ADR-0002 and lower the number of parallel stories | the fixed cost per story (runner, planner, reviewers) stays; only the rate changes, not the total |
| Stories in parallel in one folder | build scratch collides and the commits and reviews get mixed |
| Squash all stories into one commit | loses the per-story history that resume depends on |
| Stay with the old model for large Features only | two build paths to keep correct, for a saving we can get by one |
