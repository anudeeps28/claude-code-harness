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

**Level 3 — Dev Server (for manual testing):**
- Dev server: `<!-- command to start the app (e.g., npm run dev, go run ./cmd/server/, uvicorn main:app --reload) -->`
- Dev server URL: `<!-- e.g., http://localhost:3000 -->`

**Test filtering (for verify commands):**
- Run a specific test class: `<!-- e.g., npm test -- --grep "ClassName", pytest tests/test_file.py -->`
- Run a specific test: `<!-- e.g., npm test -- --testNamePattern "test name", pytest tests/test_file.py::test_name -->`

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
