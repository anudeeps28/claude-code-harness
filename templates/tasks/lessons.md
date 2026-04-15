# Lessons Learned

Running log of git rules, code patterns, Code Rabbit flags, and known fixes. Claude reads this at the start of every session. Add to it whenever something new is discovered.

---

## Git Commit Rules

- **Format:** `<type>: <short description>` (e.g. `feat:`, `fix:`, `refactor:`, `test:`, `docs:`)
- **Never:** Add "Co-Authored-By: Claude..." lines
- **Never:** Commit directly to `master`/`main` — always use a feature branch
- **Branch naming:** `feature/<short-description>` or `fix/<short-description>`
- Run build before committing
- Never force-push to master/main

| Type | When to use |
|---|---|
| `feat` | New feature or capability |
| `fix` | Bug fix |
| `refactor` | Code restructuring, no behavior change |
| `test` | Adding or updating tests |
| `docs` | Documentation only |
| `chore` | Build, CI, dependency updates |

---

## 3-Attempt Rule (CRITICAL)

If the same task or test fails **3 times in a row**, stop immediately.

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

Gate order: analyze > approve > fix > commit > reply > send. Never post replies or commit without explicit "go" / "commit" / "send".

---

## Patterns Code Rabbit Flags

Add your project-specific patterns here as you discover them.

| Pattern | CR complaint | Our response |
|---|---|---|
| <!-- Example: `var` in C# --> | <!-- "Use explicit types" --> | <!-- By design — local inference is fine per our style guide --> |

Reply template for style complaints:
> "Thanks for the suggestion! This is intentional per our team's style guide — we prefer [reason]. No code change needed."

---

## Known Build Fixes

Add known fixes for recurring issues here. Format:

### `Error: description`

Root cause and fix steps:
1. Step one
2. Step two

---

## Code Conventions

> Agents read this section to learn your project's coding style. Customize these for your stack.

**Naming:**
- <!-- Define your naming conventions here -->

**Patterns:**
- <!-- Define your code patterns here -->

**Build/Test commands:**
- Build: `<!-- your build command (e.g., dotnet build, npm run build, go build ./...) -->`
- Lint: `<!-- your lint command (e.g., dotnet format --check, npm run lint, golangci-lint run) -->`

> See the **Test Commands** section below for the full test command configuration.

---

## Test Naming Convention

```
ClassName_MethodName_Scenario_ExpectedResult
```

Examples:
- `UserService_CreateAsync_WithDuplicateEmail_ThrowsConflict`
- `OrderController_Submit_WhenCartEmpty_ReturnsBadRequest`

---

## Test Commands

> Skills and agents read this section to run the correct test commands for your stack.
> Fill in every command that applies to your project. Leave others as `<!-- not applicable -->`.

**Level 1 — Build + Unit Tests (no external dependencies):**
- Build: `<!-- your build command -->`
- Unit tests: `<!-- your unit test command (e.g., dotnet test --filter "Category!=Integration", npm test, pytest tests/unit/, go test ./... -short) -->`

**Level 2 — Integration Tests (may require Docker/emulators):**
- Setup: `<!-- command to start dependencies (e.g., docker compose up -d, or "not applicable" if none) -->`
- Integration tests: `<!-- your integration test command (e.g., dotnet test --filter "Category=Integration", npm run test:integration, pytest tests/integration/) -->`
- Cleanup: `<!-- command to stop dependencies (e.g., docker compose down) -->`

**Level 3 — Dev Server (for manual testing):**
- Dev server: `<!-- command to start the application (e.g., dotnet run --project src/Api/Api.csproj, npm run dev, go run ./cmd/server/) -->`
- Dev server URL: `<!-- e.g., http://localhost:5000, http://localhost:3000 -->`

**Test filtering (for verify commands):**
- Run a specific test class: `<!-- e.g., dotnet test --filter "FullyQualifiedName~ClassName", npm test -- --grep "ClassName", pytest tests/test_file.py -->`
- Run a specific test: `<!-- e.g., dotnet test --filter "MethodName", npm test -- --testNamePattern "test name", pytest tests/test_file.py::test_name -->`

**Custom test script (optional):**
- If your project has a custom test runner script, specify it here: `<!-- e.g., ./scripts/test.sh, make test, or leave blank if /local-test should orchestrate from the commands above -->`

---

## Dependency Injection Rules

> Remove this section if your project doesn't use DI.

- DI registration files must **always be in their own task** — never combined with other files in the same parallel_group
- When adding a new service, the DI registration task always runs **after** all the service implementation tasks
