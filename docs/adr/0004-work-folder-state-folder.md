# ADR-0004 — Every build agent receives a separate work folder and state folder

- **Status:** proposed
- **Date:** 2026-10-05
- **Decided by:** Anudeep Sharma (ARCHITECTURE.md §2 #4, §4)

## Context

Every build agent is written around one folder, `YOUR_PROJECT_ROOT`, which the installer replaces with a single absolute path:
- [agents/story-executor-agent.md](../../agents/story-executor-agent.md) runs `cd YOUR_PROJECT_ROOT`, takes its verify lock at `tasks/.verify.lock` under that root, and says it "may NOT access files outside `YOUR_PROJECT_ROOT`".
- [agents/implement-planner-agent.md](../../agents/implement-planner-agent.md) always uses `YOUR_PROJECT_ROOT/...`.
- The review agents run `git diff HEAD~1..HEAD` in whatever folder they start in.
- [skills/implement/SKILL.md](../../skills/implement/SKILL.md) and [skills/run-tasks/SKILL.md](../../skills/run-tasks/SKILL.md) mix paths anchored to `YOUR_PROJECT_ROOT/tasks/...` with bare `tasks/...` paths that resolve against the current folder.

With stories in worktrees (ADR-0002), code lives in the worktree, while all state must stay in the home folder's `tasks/`. That keeps one source of truth for resume, as [rules/git-worktrees.md](../../rules/git-worktrees.md) already says, and `.claude/` doesn't exist in a worktree anyway. Under the current contract, an executor in a worktree would either break its own rule or write its state into the wrong `tasks/`.

## Decision

We will give **every build agent two explicit paths** in its invocation, replacing the single `YOUR_PROJECT_ROOT`:
- **Work folder:** where code is read, edited, built, tested and committed (the story's worktree, or the home folder for a run with no worktree).
- **State folder:** the home folder's `tasks/`, always an absolute path, where `tasks/stories/<sid>/` and `tasks/features/<fid>/` live.

Reviewers also receive the **base ref** to diff against (`git diff <base>...HEAD` in the work folder), not `HEAD~1..HEAD`.

Every bare `tasks/...` path in the build skills is made absolute against the state folder. The verify lock moves to `<state>/stories/<sid>/.verify.lock`, which is per story, with a `verify-lock: global` setting for stacks whose worktrees share a port, database or cache.

A run with no worktrees (a standalone item) passes the home folder as both, so it behaves exactly as today.

## Consequences

- Agents can work correctly inside a worktree, and state never splits across folders.
- **This changes the prompts every build uses**, standalone builds included, which makes it the riskiest edit in the work. It needs the existing probe tests to stay green, plus new probes where the two paths differ.
- One writer per state file becomes enforceable: a story runner writes only `<state>/stories/<sid>/`, and the orchestrator only `<state>/features/<fid>/`.
- Hooks are unaffected. They run in the home-folder session. `drift-check.js` treats an edited worktree file as belonging to that worktree, which is harmless as long as `tasks/` edits always go to the state folder.

## Trade-offs considered

| Alternative | Why rejected |
|---|---|
| Keep `YOUR_PROJECT_ROOT` and tell agents to `cd` into the worktree | the bare `tasks/` paths would land in the worktree; the "may NOT access outside root" rule contradicts it |
| Put state inside each worktree | splits the source of truth across folders that get deleted after merge; resume can't find it |
| Install `.claude/` into every worktree and run a session there | duplicates the harness per worktree; nothing watches those sessions |
