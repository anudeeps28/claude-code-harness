# Story Handoff Contracts

Each story gets its own subdirectory: `tasks/stories/<story-id>/`

These files are the **formal contracts** between phases. Each phase reads the previous phase's output and writes its own. This prevents goal drift, makes debugging easier, and lets the evaluator check work against the original plan.

## Directory structure

```
tasks/stories/<story-id>/
├── brief.md          # Phase 1 output — 8-point understanding brief
├── plan.md           # Phase 1c output — Demo, probes and one "## Story #<id>" section
├── executor-state.md # the saved state — step, review round, red evidence, updated live
├── phase.md          # Current phase marker — written by the build skill at every phase
│                      # boundary; see rules/phase-markers.md. Machine-read by external
│                      # orchestrators (e.g. DevOS's Story State Reader).
└── evaluation.md     # Phase 3.6 output — evaluator findings + verdict
```

## Lifecycle

1. `/implement <id>` Phase 1 creates `brief.md`
2. Phase 1c reads `brief.md`, creates `plan.md`
3. Phase 2 (the story loop) reads `plan.md`, creates and updates `executor-state.md` at every step
4. Phase 3 reads `plan.md` + `executor-state.md`, creates `evaluation.md` and the other review reports
5. The PR step reads all files to draft the PR description

`/implement --resume <id>` reads `executor-state.md` and `plan.md` to carry on a stopped run.
6. After PR merges: archive the directory or delete it

## Notes

- These files are in `tasks/` which is NOT in git — they're local working state
- The evaluator uses `plan.md` to check plan compliance
- If a story is abandoned or restarted, delete its directory and start fresh
