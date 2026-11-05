# ADR-0006 — One session per Feature, all opened in the home folder

- **Status:** accepted (2026-11-04): built in F73
- **Date:** 2026-11-04
- **Decided by:** Anudeep Sharma (F73 plan gate, answer 3)
- **Refines:** [ADR-0004](0004-work-folder-state-folder.md) (work folder and state folder) and the one-terminal rule in `rules/git-worktrees.md`

## Context

ADR-0005 left Features as the only thing that may run in parallel: each Feature has its own worktree and
its stories go one at a time. What was missing was a safe way to run two Features at once. The old rule
said one worktree = one folder = one branch = one AI terminal, which read as "a session works in the
folder it is opened in". Under it a second Feature needed a second terminal opened *inside* the first
Feature's worktree, and the foreign-work check treated any other run's `phase.md` as a clash.

The Software Factory runs this the other way round. Its `work-feature` is started from the project's
clone (the home folder), builds in a worktree of its own, and several of them run side by side, one
session per Feature. Hydra runs it that way every day.

## Decision

We will run **one session per Feature**. Every session is opened in the **home folder**, runs
`/implement <fid>`, and builds in **its own Feature worktree**. A Feature session never edits code in the
home folder and writes only its own `tasks/features/<fid>/` and its stories' folders there, so several Feature
sessions may share the home folder without touching each other's files.

- **One session per Feature, enforced.** `feature-state.js claim` records the session in
  `tasks/features/<fid>/claim.md`. A second session on the same Feature is refused as `busy` while the
  first has been active in the last 30 minutes; a person may take it over. This is never self-answered.
- **A `feature:` marker is not foreign work.** The foreign-work check skips a `phase.md` carrying a
  `feature:` key and paths under `tasks/`. A standalone run still builds in the folder it runs in, so it
  is still one per folder.
- **Shared test resources queue on one lock.** Under `verify-lock: global`, `test-lock.js` serialises
  the builds, tests and Observe commands of every session. The default takes no lock.
- **Shared things are checked, not assumed.** `disk-check.js --feature` counts the worktrees other Features
  will still create; `worktree.js` retries a git lock file another session holds; a numbered file (an ADR,
  a migration) is reserved in the plan so two Features never pick the same number.
- The rule becomes: one Feature = one worktree = one branch = one session.

## Consequences

- The one-terminal rule is narrowed, not dropped: it still holds for standalone runs, which build in the
  folder they run in. It no longer says a Feature session lives inside its worktree.
- ADR-0004 stands: the builders still get a work folder (the Feature worktree) and the state folder
  (the home folder's `tasks/`). What changes is who may share the home folder: several Feature sessions.
- A standalone run that starts while a Feature session is open (a fresh `claim.md`, 30 minutes) asks first,
  before it checks out a branch in the home folder, because that moves the shared folder off main under the
  Feature session: (A) stop and use its own worktree, or (B) continue. It is not self-answerable.
- A person closing a session leaves a claim behind. It goes stale after 30 minutes without activity,
  or the next session takes it over.
- Two open Feature sessions share one machine's disk, CPU and, for stacks with a shared port or
  database, a test lock. That is the price of the speed-up.

## Trade-offs considered

| Alternative | Why rejected |
|---|---|
| One session building several Features through lane agents (an orchestrator with one agent per Feature) | one context carries every Feature, so the usage cost that ADR-0005 removed returns; a hung lane stalls the others, and nothing matches the factory's work-feature |
| Open each session inside its Feature worktree, as the one-terminal rule read | the state folder is the home folder's `tasks/`, so every session would write outside its own folder, and the foreign-work check would still see another run's markers as a clash |
| A global lock for the whole run, one Feature at a time | safe, and no faster than today; the point of the work is two Features at once |
| No claim, trusting people to open one session per Feature | two sessions on one Feature write one worktree and one state file; the failure is silent and costly to unpick |
