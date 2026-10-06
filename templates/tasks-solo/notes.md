# Notes

Running log of decisions, conventions, known fixes, and things to remember. Claude reads this at the start of every session.

---

## Code Conventions

> Define your project's coding style here. Agents read this section to follow your patterns.
> Below is an example — replace with your own conventions.

**Language:** [your language — e.g. TypeScript, Python, Go, C#]

**Build command:** [e.g. `npm run build`, `go build ./...`, `dotnet build`]
**Test command:** [e.g. `npm test`, `pytest`, `go test ./...`]
**Lint command:** [e.g. `npm run lint`, `ruff check`, `golangci-lint run`]

**Naming:**
- [e.g. camelCase for functions, PascalCase for types]
- [e.g. test files: `*.test.ts` or `*_test.go`]

**Patterns:**
- [e.g. use async/await, not callbacks]
- [e.g. error handling: return errors, don't throw]

---

## PRD Configuration

Where PRDs are stored. The `/prd` skill reads this at start to determine output mode.

```
prd_mode = YOUR_PRD_MODE
```

Options:
- `file` — write `PRD.md` to the repo (default)
- `tracker` — publish as a tracker issue only
- `both-file-canonical` — file + tracker; file is canonical
- `both-tracker-canonical` — file + tracker; tracker is canonical

---

## Git Rules

- **Branch naming:** `implement/<issue-id>-<short-description>` (e.g. `implement/42-dark-mode`)
- **Commit format:** `#<issue-id> <description>` (e.g. `#42 Add dark mode toggle to settings`)
- **Never** commit directly to main — always use a branch + PR

---

## Test Commands

> Skills and agents read this section to run the correct test commands for your stack.
> Fill in every command that applies to your project. Leave others as `<!-- not applicable -->`.

**Level 1 — Build + Unit Tests (no external dependencies):**
- Build: `<!-- your build command (e.g., npm run build, go build ./..., dotnet build) -->`
- Unit tests: `<!-- your unit test command (e.g., npm test, pytest tests/unit/, go test ./... -short) -->`

**Level 2 — Integration Tests (may require Docker/emulators):**
- Setup: `<!-- command to start dependencies (e.g., docker compose up -d, or "not applicable") -->`
- Integration tests: `<!-- your integration test command (e.g., npm run test:integration, pytest tests/integration/) -->`
- Cleanup: `<!-- command to stop dependencies (e.g., docker compose down) -->`
- Migrate forward: `<!-- stands up a throwaway database at main, then applies this branch's migrations; the architect reviewer runs it to check migrations work on a database that already exists. Never a shared database. Or "not applicable" -->`

**Level 3 — Dev Server (for manual testing):**
- Dev server: `<!-- command to start the app (e.g., npm run dev, go run ./cmd/server/, uvicorn main:app --reload) -->`
- Dev server URL: `<!-- e.g., http://localhost:3000 -->`

**Test filtering (for verify commands):**
- Run a specific test class: `<!-- e.g., npm test -- --grep "ClassName", pytest tests/test_file.py -->`
- Run a specific test: `<!-- e.g., npm test -- --testNamePattern "test name", pytest tests/test_file.py::test_name -->`

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
> checks this section against the item's Demo at startup: a missing tool (a screenshot script, the
> e2e command) becomes a "Build the probe" task in the plan; missing access stops the run and names
> what is missing.
>
> - **Environment is local or test only.** Prod is refused unless you add `Prod allowed: yes`.
> - **Credentials are named, never their value.** Each credential line holds the name of an
>   environment variable (or `none`); the value lives in that variable or the OS secret store.
> - **Read-only is enforced by the credential** (a read-only database user, a read-only API key),
>   never only by an instruction to the agent.

- Environment: `<!-- local or test -->`
- Prod allowed: `<!-- leave unset; "yes" only if you really mean to observe prod -->`
- Start the app: `<!-- e.g., npm run dev -->`
- App URL: `<!-- e.g., http://localhost:3000 -->`
- Screenshot: `<!-- e.g., node scripts/screenshot.js <route> <out.png> (a Playwright script) -->`
- API base URL: `<!-- e.g., http://localhost:3000/api -->`
- API credential variable: `<!-- the NAME of the variable holding a read-only token, or none -->`
- Database credential variable: `<!-- the NAME of the variable holding a read-only connection string -->`
- Read-only queries: `<!-- the SELECT statements the harness may run -->`
- E2E command: `<!-- the end-to-end gate /local-test e2e runs, e.g. npm run test:e2e -->`

---

## Known Fixes

<!-- Add entries when you discover something non-obvious that fixes a recurring problem. -->
<!-- | Date | Problem | Fix | -->
<!-- | 2026-04-10 | Docker build fails on M1 | Add `--platform linux/amd64` to docker build | -->

---

## Decisions

<!-- Record why you chose approach A over approach B — future-you will thank present-you. -->
<!-- | Date | Decision | Why | -->
<!-- | 2026-04-08 | Use SQLite instead of Postgres for dev | Simpler local setup, no Docker needed | -->

---

## Blockers

<!-- Things waiting on external action — APIs, people, services. -->
<!-- | What | Waiting on | Since | -->
<!-- | API v2 access | Third-party approval | 2026-04-05 | -->
