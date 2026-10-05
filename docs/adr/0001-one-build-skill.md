# ADR-0001 — One build skill: `/implement` builds Features, `/story` is retired

- **Status:** proposed
- **Date:** 2026-10-05
- **Decided by:** Anudeep Sharma (grill session 2026-09-30, Q1–Q2, Q12)

## Context

The harness has two build skills. `/story` is enterprise-pack only (sprint file, Master Status Table, `story-understand` / `story-plan` / `story-pr` agents). `/implement` ships in both packs and carries the newest machinery: `--tdd`, `--autonomous`, `--rework`, and the probe tests that prove them. Both build one story at a time.

The work is moving to Features as the unit of work: `/to-issues` already writes Features with child stories and blocked-by links, and a Feature must end in a change you can see and test. A Feature-level build is needed. Building it into both skills would mean writing the dependency graph, branch review, Prove it and PR gate twice. A third skill would make three build engines, and every fix would land in several places.

## Decision

We will have **one build skill, `/implement`**.
- `/implement <feature-id>` builds the whole Feature.
- `/implement <story-or-bug-id>` with a parent Feature stops and asks whether the Feature was meant.
- With no parent, it requires `--standalone` and says so at the start of the run.
- The mode comes from the item type every tracker adapter reports.
- `/run-tasks` is replaced by `/implement --resume`.

We will **retire `/story`** only after a line-by-line inventory of what it does. Its enterprise-only parts (sprint-file updates, anything its agents do that `/implement`'s don't) become settings `/implement` reads when the enterprise pack is installed.

## Consequences

- One build engine. A fix (resume, done only after review, test-first) is made once.
- `/implement` grows significantly. Its SKILL.md is already about 750 lines, so it needs care to stay readable.
- About 40 files reference `/story` or `/run-tasks` by name (skills, agents, rules, hooks, and the installer's enterprise-only lists in `install/lib/updater.js`). All of them change when `/story` and `/run-tasks` are retired.
- Enterprise users lose a familiar command name. The installer must handle the upgrade so `/story` doesn't silently survive in old installs.
- The name `/implement` no longer describes the full role exactly. That's accepted, to avoid a 40-file rename.

## Trade-offs considered

| Alternative | Why rejected |
|---|---|
| A new Feature skill ported from Hydra's work-feature, with `/story` and `/implement` kept | Three build engines; work-feature is wired to ADO and would need rewriting for every tracker anyway |
| Write a new skill from scratch and retire both | test-first, rework, autonomous mode, the wave rules and their probes would all have to be moved over again, and that's where regressions hide |
| Grow `/story` instead | enterprise-only, so solo installs would lose their build skill until the pack split was reworked |
| Rename to `/build` | about 40 files to rename, and "unknown skill" for anyone who has `/implement` memorised |
