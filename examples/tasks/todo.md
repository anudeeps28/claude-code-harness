# Todo

## Session

Currently working on: **Story #9950 — Add employer filter to query API**

Branch: `feature/9950-employer-filter`

---

## Active Story Plan

The plan is one story section (`tasks/stories/9950/plan.md`); the story loop builds it test first.

```markdown
## Story #9950 — Add employer filter to query API

**Files:**
- src/YourProject.Core/Models/QueryFilters.cs — create: the filter record (EmployerCode, PlanYear)
- src/YourProject.Core/Services/RagQueryService.cs — modify: build the search filter from it
- src/YourProject.Tests/Unit/Services/RagQueryServiceTests.cs — modify: the two tests below

**Tests to write first:**
- AC1 → RagQueryService_BuildSearchFilter_WithEmployerCode_AppliesEmployerFilter: fails on the missing `employerCode eq 'ACME'`
- AC2 → RagQueryService_BuildSearchFilter_WithBothFilters_CombinesWithAnd: fails on the missing AND

**Acceptance criteria and their proofs:**
1. A request with an employer code only returns results for that employer
   - Proof: unit — RagQueryService_BuildSearchFilter_WithEmployerCode_AppliesEmployerFilter
   - Seen by: the filter string the service sends to the search index
   - Would lie if: the test builds the filter but never reads it back
2. A request with an employer code and a plan year applies both
   - Proof: unit — RagQueryService_BuildSearchFilter_WithBothFilters_CombinesWithAnd
   - Seen by: the filter string holds both conditions joined with AND
   - Would lie if: the test checks only one of the two conditions

**Source requirements:**
Source: none

**Commands:**
- dotnet build YourProject.Core --no-restore; dotnet test YourProject.Tests --filter "Category=Unit&FullyQualifiedName~RagQueryService" --no-build

**Open questions:**
none
```

---

## Completed Stories

- ✅ Story #9880 — Conversation history (PR #152, merged 2026-03-28)
- ✅ Story #9901 — Document supersede logic (PR #158, merged 2026-04-01)
