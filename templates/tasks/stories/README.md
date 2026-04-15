# Story Handoff Contracts

Each story gets its own subdirectory: `tasks/stories/<story-id>/`

These files are the **formal contracts** between phases. Each phase reads the previous phase's output and writes its own. This prevents goal drift, makes debugging easier, and lets the evaluator check work against the original plan.

## Directory structure

```
tasks/stories/<story-id>/
├── brief.md          # Phase 1 output — 8-point understanding brief
├── plan.md           # Phase 2 output — XML task plan + rationale
├── executor-state.md # Phase 3 output — per-task results, updated live
└── evaluation.md     # Phase 3.6 output — evaluator findings + verdict
```

## Lifecycle

1. `/story <id>` Phase 1 creates `brief.md`
2. Phase 2 reads `brief.md`, creates `plan.md`
3. Phase 3 reads `plan.md`, creates and updates `executor-state.md` after each wave
4. Phase 3.6 reads `plan.md` + `executor-state.md`, creates `evaluation.md`
5. Phase 4 reads all files to draft PR description
6. After PR merges: archive the directory or delete it

## Notes

- These files are in `tasks/` which is NOT in git — they're local working state
- The evaluator uses `plan.md` to check plan compliance
- If a story is abandoned or restarted, delete its directory and start fresh
