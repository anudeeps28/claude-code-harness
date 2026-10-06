# ADR-0002 — Stories run in sibling git worktrees, created by the orchestrator from the Feature branch

- **Status:** accepted (2026-10-06): built in F4 (`bin/worktree.js`), run in parallel in F5
- **Date:** 2026-10-05
- **Decided by:** Anudeep Sharma (grill Q8–Q9; ARCHITECTURE.md §1–§2)

## Context

A Feature's independent stories should run in parallel. [rules/wave-execution.md](../../rules/wave-execution.md) currently **forbids** worktrees for executor agents. That rule came from real failures: the agent's built-in `isolation: "worktree"` starts from the default branch and sees only committed state, while the build commits nothing until the PR. So later waves ran without the files earlier waves had written, and failed agents' work was stranded in hidden `.claude/worktrees/` folders.

Running parallel stories in one folder brings its own problems: shared build scratch (`node_modules/.cache`, `obj/`, `target/`), and per-story commits and reviews that can't be separated.

Claude Code facts this relies on (docs, sub-agents and worktrees): agents can start agents up to 3 layers deep; at most 20 agents run at once by default; and the built-in worktree option **cannot** start from a named branch.

## Decision

We will run **each story in its own git worktree**: a sibling folder of the home folder (`<repo>-f<fid>-s<sid>`), on its own branch (`story/<sid>-slug`). The Feature branch gets its own worktree as well (`<repo>-f<fid>`), so the home folder stays on main.

- **The orchestrator creates every worktree itself**, with `git worktree add <path> -b story/<sid>-slug feature/<fid>-slug`, and only **after every story it depends on has merged** into the Feature branch. Agents never use `isolation: "worktree"`.
- **A story commits on its own branch** before it's merged.
- Stories joined by a `/to-issues` overlap link never run in parallel.
- After a successful merge, the story's worktree is removed and its branch deleted (never forced). A stuck story's worktree is kept as evidence.
- A new named agent, `story-runner-agent`, works inside one worktree and starts the planner, executor and light-review agents there.
- `max-parallel-stories` defaults to 5. It's lowered automatically so that agents running at once stay ≤ 20.

The wave-execution ban on worktrees stays in force **for waves inside a story**. Waves still share their story's folder and use the existing overlap check.

## Consequences

- Parallel stories can't overwrite each other's files or build scratch. Each story has clean commits and its own review.
- Both causes of the old failure are removed: the base is the Feature branch with dependencies already merged, and the work is committed before it's handed on.
- Disk: about 1–3 GB per worktree with dependencies, so up to about 18 GB at 5 stories. A disk check is needed at startup.
- Each worktree needs its gitignored config copied and its restore commands run. That depends on the lessons/notes "Worktree setup" section being complete, and the startup check enforces it.
- `.claude/` is gitignored, so a worktree has no skills, agents or hooks of its own. Everything has to run from the home-folder session. That's why story runners are subagents and not separate sessions.
- `rules/wave-execution.md` and `rules/git-worktrees.md` need a section separating story worktrees (allowed, orchestrator-created) from wave isolation (still forbidden).

## Trade-offs considered

| Alternative | Why rejected |
|---|---|
| Stories one at a time in one folder | safe and simple, but no parallelism across independent stories |
| Parallel stories in one folder with a cross-story file-overlap check | build scratch still collides; per-story commits and reviews get mixed |
| The agent's built-in `isolation: "worktree"` | can only start from the default branch or HEAD, which is the exact cause of the original failure |
| Full clones per story | more disk; branches must be pushed and fetched between clones |
| Separate headless `claude -p` sessions per worktree | no skills, agents or hooks in a worktree (`.claude/` is gitignored), and nothing to watch them without a host |
