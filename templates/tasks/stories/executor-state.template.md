# Executor state — story STORY_ID

run-mode: interactive
skill: implement
flags: [the flags this run was started with]
branch: implement/STORY_ID
base: [git rev-parse HEAD when the build began]
step: tests
updated: YYYY-MM-DDTHH:MM:SSZ

<!-- `step` is the step in flight, the one `/implement --resume` starts again: understand, goal, plan,
     tests, red, code, green, review, commit, local-test, panel, e2e-gate, pr, and done once the PR
     is open. While `step` is review,
     a `round: <n>` line says which review round (1 to 5). There is no per-task table: the story is
     the unit. The orchestrator overwrites the header at every step boundary. -->

## Red evidence

- [test name] | AC1 | [verbatim failure line from the test runner] | shape: assertion

## Red files

<!-- The red set (the tests and any stub the tests builder wrote), saved at the red step: one path per
     line. A resume at `code` restores nothing listed here. -->

- [path/to/test-or-stub-file]

## Debug Escalations

### [what] — escalated YYYY-MM-DD HH:MM
**Root cause (from /debug):** [what debug-agent found]
**Chosen approach:** [which of the 2-3 approaches was picked]
**Result:** [resolved / still blocked]

## Local Test Result

**Phase 2.5:** [NOT RUN / ✅ PASS / ❌ FAIL]
**Command:** `/local-test 2`
**Output summary:** [build OK, N tests passed, M failed]

## Blockers

- [list anything waiting on external action, with who and what]
