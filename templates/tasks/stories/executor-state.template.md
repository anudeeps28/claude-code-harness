# Executor State — Story #STORY_ID

**Updated by:** story orchestrator (Phase 3, after each wave)
**Last updated:** YYYY-MM-DD HH:MM

---

## Progress

| Task | Name | Wave | Attempts | Status | Summary |
|---|---|---|---|---|---|
| 1 | "..." | 1 | 1 | ✅ PASS | [one-line what changed] |
| 2 | "..." | 1 | 2 | ✅ PASS | [passed on retry — first attempt had X error] |
| 3 | "..." | 2 | 3 | ❌ ESCALATED | [3-attempt rule — sent to /debug] |
| 4 | "..." | 2 | 0 | ⏳ PENDING | [not yet started] |
| 5 | "..." | 3 | 1 | ⚠️ BLOCKED | [waiting on YOUR_INFRA_PERSON for X] |

## Wave Log

### Wave 1 — completed YYYY-MM-DD HH:MM
- Task 1: PASS (attempt 1)
- Task 2: FAIL (attempt 1 — missing using statement), PASS (attempt 2)

### Wave 2 — completed YYYY-MM-DD HH:MM
- Task 3: FAIL (attempt 1 — null ref), FAIL (attempt 2 — wrong interface), FAIL (attempt 3 — same null ref) → ESCALATED to /debug
- Task 4: PASS (attempt 1)

### Wave 3 — in progress
- Task 5: BLOCKED — waiting on DBA to run migration script

## Debug Escalations

### Task 3 — escalated YYYY-MM-DD HH:MM
**Root cause (from /debug):** [what debug-agent found]
**Chosen approach:** [which of the 2-3 approaches was picked]
**Result:** [resolved / still blocked]

## Local Test Result

**Phase 3.5:** [NOT RUN / ✅ PASS / ❌ FAIL]
**Command:** `/local-test 2`
**Output summary:** [build OK, N tests passed, M failed]

## Blockers

- [list anything waiting on external action, with who and what]
