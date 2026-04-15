# Todo

## Session

Currently working on: **Story #9950 — Add employer filter to query API**

Branch: `feature/9950-employer-filter`

---

## Active Task Plan

```xml
<tasks story="9950">

  <task id="1" parallel_group="1" type="auto">
    <name>Add EmployerFilter record</name>
    <files>
      src/YourProject.Core/Models/QueryFilters.cs
    </files>
    <action>
      Create a new file `src/YourProject.Core/Models/QueryFilters.cs`.
      Define a public record `QueryFilters` with:
      - `string? EmployerCode` — nullable string
      - `string? PlanYear` — nullable string (format "YYYY")
      Both properties should have init-only setters.
    </action>
    <verify>dotnet build YourProject.Core --no-restore 2>&amp;1 | tail -5</verify>
    <done>QueryFilters.cs compiles with no errors. Record has 2 nullable properties.</done>
  </task>

  <task id="2" parallel_group="1" type="auto">
    <name>✅ Update QueryRequest to include filters</name>
    <files>
      src/YourProject.Core/Models/QueryRequest.cs
    </files>
    <action>
      In `QueryRequest.cs`, add a nullable `QueryFilters? Filters` property.
      It should be a JSON-serializable property: `[JsonPropertyName("filters")]`.
    </action>
    <verify>dotnet build YourProject.Core --no-restore 2>&amp;1 | tail -5</verify>
    <done>QueryRequest.cs has Filters property, builds clean.</done>
  </task>

  <task id="3" parallel_group="2" type="auto">
    <name>Update RagQueryService to apply filters</name>
    <files>
      src/YourProject.Core/Services/RagQueryService.cs
      src/YourProject.Core/Services/IRagQueryService.cs
    </files>
    <action>
      In `RagQueryService.cs`:
      1. In `BuildSearchFilterAsync(QueryRequest request)`:
         - If `request.Filters?.EmployerCode` is not null, append `&amp;$filter=employerCode eq '{employerCode}'` to the search filter string
         - If `request.Filters?.PlanYear` is not null, append `&amp;$filter=planYear eq '{planYear}'` similarly
         - Filters combine with AND if both are present
      2. The method signature does not change.
      All existing tests must still pass.
    </action>
    <verify>dotnet test YourProject.Tests --filter "Category=Unit&amp;FullyQualifiedName~RagQueryService" --no-build 2>&amp;1 | tail -10</verify>
    <done>All RagQueryService unit tests pass. Filter logic is applied when request.Filters is non-null.</done>
  </task>

  <task id="4" parallel_group="3" type="auto">
    <name>Update DependencyInjection.cs</name>
    <files>
      src/YourProject.Core/DependencyInjection.cs
    </files>
    <action>
      In `DependencyInjection.cs`, verify that `RagQueryService` is registered as `IRagQueryService`.
      If it is already registered, no change needed — just confirm and exit with PASS.
      If it is missing, add: `services.AddScoped&lt;IRagQueryService, RagQueryService&gt;();`
    </action>
    <verify>dotnet build YourProject.API --no-restore 2>&amp;1 | tail -5</verify>
    <done>DependencyInjection.cs registers RagQueryService. Full API project builds clean.</done>
  </task>

  <task id="5" parallel_group="4" type="auto">
    <name>Add unit tests for employer filter</name>
    <files>
      src/YourProject.Tests/Unit/Services/RagQueryServiceTests.cs
    </files>
    <action>
      In `RagQueryServiceTests.cs`, add two new test methods:
      1. `RagQueryService_BuildSearchFilter_WithEmployerCode_AppliesEmployerFilter`
         - Input: QueryRequest with Filters.EmployerCode = "ACME"
         - Expected: filter string contains `employerCode eq 'ACME'`
      2. `RagQueryService_BuildSearchFilter_WithBothFilters_CombinesWithAnd`
         - Input: QueryRequest with Filters.EmployerCode = "ACME" and Filters.PlanYear = "2024"
         - Expected: filter string contains both conditions joined with AND
      Both tests should be tagged `[Category("Unit")]`.
    </action>
    <verify>dotnet test YourProject.Tests --filter "Category=Unit&amp;FullyQualifiedName~RagQueryService" --no-build 2>&amp;1 | tail -10</verify>
    <done>2 new tests pass. All existing RagQueryService tests still pass.</done>
  </task>

</tasks>
```

---

## Completed Stories

- ✅ Story #9880 — Conversation history (PR #152, merged 2026-03-28)
- ✅ Story #9901 — Document supersede logic (PR #158, merged 2026-04-01)
