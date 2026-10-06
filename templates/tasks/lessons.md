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

## Feature runs

> Settings for `/implement <feature-id>`, which builds each story in its own git worktree. Leave a
> line as a placeholder to keep its default.

- max-parallel-stories: `<!-- default 5; how many stories run at once (never over the 20-agent limit) -->`
- worktree-size-gb: `<!-- default 3; disk per worktree with dependencies restored, for the startup disk check -->`
- verify-lock: `<!-- default per-story; "global" if worktrees share a port, a database or a global cache -->`

---

## Observe

> How the harness may see the running app, so every item's Demo can be watched happen. `/implement`
> checks this section against the item's Demo at startup (`bin/observe-check.js`): a missing tool
> (a screenshot script, the e2e command) becomes a "Build the probe" task in the plan; missing access
> stops the run and names what is missing.
>
> - **Environment is local or test only.** Prod is refused unless you add `Prod allowed: yes`, and
>   only if your project's rules allow it.
> - **Credentials are named, never their value.** Each credential line holds the name of an
>   environment variable (or `none`); the value lives in that variable or the OS secret store.
> - **Read-only is enforced by the credential** — a read-only database user, a read-only API key —
>   never only by an instruction to the agent.
> - On projects with PHI/PII, only the shape of what is seen is recorded (row counts, ids, field
>   names, status codes), never row contents or response bodies.

- Environment: `<!-- local or test -->`
- Prod allowed: `<!-- leave unset; "yes" only if the project's rules allow observing prod -->`
- Start the app: `<!-- e.g., npm run dev, dotnet run --project src/Api -->`
- App URL: `<!-- e.g., http://localhost:3000 -->`
- Screenshot: `<!-- e.g., node scripts/screenshot.js <route> <out.png> (a Playwright script) -->`
- API base URL: `<!-- e.g., http://localhost:5000 -->`
- API credential variable: `<!-- the NAME of the variable holding a read-only token, e.g. OBSERVE_API_TOKEN, or none -->`
- Database credential variable: `<!-- the NAME of the variable holding a read-only connection string, e.g. OBSERVE_DB_URL -->`
- Read-only queries: `<!-- the SELECT statements the harness may run, e.g. SELECT id, status FROM orders WHERE id = $1 -->`
- E2E command: `<!-- the end-to-end gate /local-test e2e runs, e.g. npm run test:e2e -->`

---

## Dependency Injection Rules

> Remove this section if your project doesn't use DI.

- DI registration files must **always be in their own task** — never combined with other files in the same parallel_group
- When adding a new service, the DI registration task always runs **after** all the service implementation tasks
