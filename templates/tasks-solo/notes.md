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

## Git Rules

- **Branch naming:** `implement/<issue-id>-<short-description>` (e.g. `implement/42-dark-mode`)
- **Commit format:** `#<issue-id> <description>` (e.g. `#42 Add dark mode toggle to settings`)
- **Never** commit directly to main — always use a branch + PR

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
