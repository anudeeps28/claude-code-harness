# Lessons

Running log of git rules, code patterns, Code Rabbit flags, and known fixes. Claude reads this at the start of every session. Add to it whenever something new is discovered.

---

## Git Commit Rules

- **Format:** `[#STORY-ID] Short description in present tense`
- **Example:** `[#9950] Add employer filter to query API`
- **Never:** Add "Co-Authored-By: Claude Sonnet" lines — explicitly prohibited
- **Never:** Commit directly to `master` or `develop` — always use a feature branch
- **Branch naming:** `feature/STORY-ID-short-description` (e.g. `feature/9950-employer-filter`)
- **One commit per story** unless the change spans multiple logical units (then one commit per unit)
- **Do not squash** merge commits — the PR history is the audit trail

---

## 3-Attempt Rule

If the same task or test fails **3 times in a row**, stop immediately and invoke `/debug`.

Do not:
- Keep tweaking the same approach
- Try a "slightly different" version of the same fix
- Move on to the next task while leaving a failure unresolved

Do:
- Invoke `/debug` immediately
- Provide it the full error text from all 3 attempts
- Wait for a diagnosis before touching code

---

## PR Comment Review Process

When handling Code Rabbit review comments (`/babysit-pr`):

1. **Fix items** — comments about bugs, null checks, missing validation, wrong logic. These need code changes.
2. **Reply items** — comments about style, naming preferences, or items where we intentionally deviated. These need a polite explanation but no code change.
3. **Skip items** — comments Code Rabbit keeps re-raising after we've already addressed them 3 times. Flag for manual review.

Gate order: analyze → approve → fix → commit → reply → send. Never post replies or commit without explicit "go" / "commit" / "send".

---

## Patterns Code Rabbit Flags

These are patterns Code Rabbit consistently flags in this project — known and intentional:

| Pattern | CR complaint | Our response |
|---|---|---|
| `var` in C# | "Use explicit types" | By design — local inference is fine per our style guide |
| No XML docs on internal classes | "Missing documentation" | Only public API surface gets XML docs |
| `async void` in event handlers | "Use async Task" | WinForms event handlers must be `async void` |
| Large constructor params | "Consider dependency injection" | Already DI — CR doesn't see the container registration |

Reply template for style complaints:
> "Thanks for the suggestion! This is intentional per our team's style guide — we prefer [reason]. No code change needed."

---

## Known Build Fixes

### `CS0246: The type or namespace 'X' could not be found`

Usually means the project reference is missing or the using statement is wrong.

1. Check `Directory.Packages.props` — is the package version pinned there?
2. Check the `.csproj` — is `<PackageReference Include="X" />` present?
3. Run `dotnet restore` before `dotnet build`

### Docker SQL Edge won't start on Windows

```bash
# Check if Hyper-V is enabled
systeminfo | grep "Hyper-V"

# If not, enable it and restart
# Settings → Turn Windows features on or off → Hyper-V

# Also check that Docker is set to use Linux containers
# Docker Desktop → Switch to Linux containers
```

### Azure Functions local.settings.json missing

The `local.settings.json` is gitignored. Copy from the team's shared vault:

```bash
az keyvault secret show --vault-name YOUR_KEY_VAULT --name local-settings-json --query value -o tsv > src/YourProject.Functions/local.settings.json
```

### AI Search returns 0 results after re-ingest

Wait 3 minutes after uploading blobs — the Function App needs time to process. If still 0:
1. Check the Function App logs: `az containerapp logs show --name YOUR_CONTAINER_APP --resource-group YOUR_RESOURCE_GROUP`
2. Confirm your documents table has rows (content hash check)
3. Verify AI Search index exists and has the right schema

---

## Code Conventions

> Agents read this section to learn your project's coding style. Customize these for your stack.
> Below is an example for a .NET/C# project — replace with your own conventions.

**Naming:**
- Private fields: `_camelCase`
- Async methods: always suffix with `Async`
- Test methods: `ClassName_MethodName_Scenario_ExpectedResult`

**Patterns:**
- Structured logging: `{PropertyName}` placeholders, never string interpolation
- Entity pattern: static `Create()` factory + state-transition methods
- Null guards: `ArgumentNullException.ThrowIfNull` on public method boundaries

**Dependencies:**
- NuGet: no version attributes in `.csproj` — versions in `Directory.Packages.props`
- DI lifetimes: `AddScoped` for services with request state, `AddSingleton` for stateless utilities

**Build/Test commands:**
- Build: `dotnet build`
- Lint: `dotnet format --verify-no-changes`

> See the **Test Commands** section below for the full test command configuration.

---

## Test Commands

> Skills and agents read this section to run the correct test commands for your stack.

**Level 1 — Build + Unit Tests (no external dependencies):**
- Build: `dotnet build`
- Unit tests: `dotnet test --filter "Category!=Integration"`

**Level 2 — Integration Tests (Docker emulators):**
- Setup: `docker compose -f .claude/skills/local-test/examples/docker-compose-dotnet.yml up -d`
- Integration tests: `dotnet test --filter "Category=Integration"`
- Cleanup: `docker compose -f .claude/skills/local-test/examples/docker-compose-dotnet.yml down`

**Level 3 — Dev Server:**
- Dev server: `dotnet run --project src/YOUR_PROJECT_NAMESPACE.API/YOUR_PROJECT_NAMESPACE.API.csproj --urls http://localhost:5000`
- Dev server URL: `http://localhost:5000`

**Test filtering (for `<verify>` commands):**
- Run a specific test class: `dotnet test --filter "FullyQualifiedName~ClassName"`
- Run a specific test: `dotnet test --filter "Name=MethodName"`

**Custom test script (optional):**
- Full-stack script (Level 2+ with Azure emulators + API + Functions + E2E smoke test): `powershell.exe -ExecutionPolicy Bypass -File .claude/skills/local-test/examples/local-test-dotnet.ps1`

---

## Dependency Injection Rules

- `DependencyInjection.cs` files must **always be in their own task** — never combined with other files in the same parallel_group
- When adding a new service, the DI registration task always runs **after** all the service implementation tasks
- Use `AddScoped` for services that hold request state, `AddSingleton` for stateless utilities

---

## Test Naming Convention

```
ClassName_MethodName_Scenario_ExpectedResult
```

Examples:
- `QueryService_AskAsync_WithEmployerFilter_ReturnsFilteredResults`
- `DocumentIngestionService_ProcessAsync_WhenHashExists_SkipsIngestion`
- `ConversationManager_AddMessage_WhenLimitExceeded_DropsOldestMessage`

All tests must be in the `Tests` project and tagged with `[Category("Unit")]` or `[Category("Integration")]`.

---

## API Response Shape

The query API always returns:

```json
{
  "answer": "string",
  "sources": [
    {
      "planNumber": "M9429CCG4",
      "chunkId": "uuid",
      "relevanceScore": 0.92
    }
  ],
  "conversationId": "uuid"
}
```

If the answer field is empty or `null`, the search returned no relevant chunks — check the index and re-ingest.
