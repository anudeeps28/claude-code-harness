# ADR-0003 — Only the orchestrator merges, and every merge is tested before it is committed

- **Status:** accepted (2026-10-06): built in F4 (`worktree.js merge`), unchanged by parallel stories in F5
- **Date:** 2026-10-05
- **Decided by:** Anudeep Sharma (ARCHITECTURE.md §1, §2 #5, §8)

## Context

With stories in parallel worktrees (ADR-0002), each finished story has to land on the Feature branch. Two questions follow: **who** merges, and **what happens when a merged story breaks the Feature branch's tests**.

If story agents merged themselves, two could merge at the same moment, and a test after a merge could run against a Feature branch that had already moved on.

If a merge is committed and then found to break tests, the obvious fix is to revert it. In git, a reverted merge is a trap: when the story is fixed and merged again, git considers its earlier commits already merged, so their changes are silently dropped unless someone remembers to revert the revert.

## Decision

We will have **only the orchestrator write the Feature branch**. It merges stories **one at a time**, in the Feature worktree, as:

1. `git merge --no-ff --no-commit story/<sid>-slug`
2. run the build and tests on the merged, uncommitted result;
3. **green:** commit the merge. **Red, or a conflict that can't be resolved cleanly:** `git merge --abort`. The story is marked stuck, with its worktree kept and the test output or conflict recorded.

Story agents never merge, push or open a PR. The only push in a run is the Feature branch, and the only PR is Feature branch → main.

## Consequences

- No merge races, and every test-after-merge runs on a known state.
- **The Feature branch only ever contains merges that passed.** It never needs a revert, so the reverted-merge trap can't happen.
- `--no-ff` keeps each story's commits plus one merge commit per story, so a story can still be backed out later with a single revert if it's ever needed.
- Merges are a deliberate bottleneck. Parallel stories queue at the merge: seconds to merge, minutes to test. That's accepted.
- Resume has to handle a merge that was in progress when the session died (`MERGE_HEAD` present): abort it and redo it.

## Trade-offs considered

| Alternative | Why rejected |
|---|---|
| Story agents merge themselves into the Feature branch | merge races; a test after a merge can run on a branch that has already moved on |
| Commit the merge, then revert it on failure | merging a reverted branch again silently drops its changes |
| Squash-merge each story | one tidy commit, but the per-story history the PR reviewer reads is lost |
| Rebase story branches onto the Feature branch | rewrites history the reviews were run against; force-push territory, blocked by `safety-check.js` |
