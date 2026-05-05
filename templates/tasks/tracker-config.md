# Tracker Config

> Configuration for your project tracker and environment URLs.
> The /pa and /troubleshoot skills read this file to look up API endpoints and tracker details.
> Fill in the sections that apply to your stack. Delete sections that don't apply.

---

## Issue Tracker

**Type:** [ADO / GitHub]

**Project/Board:** [YOUR_ADO_PROJECT or GitHub repo owner/name]

**Sprint/Iteration naming:** [e.g. "Sprint 5"]

### GitHub sprint settings *(GitHub only — delete if using ADO)*

```
sprint_mode = milestone
```

Set to `milestone` (default) to use GitHub Milestones named "Sprint N".
Set to `project` to use a GitHub Projects v2 board with an Iteration field.

```
github_project_number = 1
```

Required when `sprint_mode = project`. This is the number from your project URL:
`github.com/org/repo/projects/1` → set to `1`.

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

## Environments

| Environment | API Base URL | Notes |
|-------------|--------------|-------|
| Local | `http://localhost:5000` | Docker required |
| Dev | `https://[your-dev-url]` | |
| Staging | `https://[your-staging-url]` | |
| Production | `https://[your-prod-url]` | |

---

## Key Endpoints

| Name | Path | Notes |
|------|------|-------|
| [e.g. Query API] | `/api/query/ask` | [auth requirements] |
| [e.g. Ingest trigger] | `/api/ingest` | |

---

## Auth

**Method:** [Bearer token / API key / Managed Identity / none]

**Where to get tokens:** [e.g. Azure Portal > App Registration > Certificates & secrets]

---

## Azure Resources *(if applicable)*

| Resource | Name | Notes |
|----------|------|-------|
| Container App | [name] | |
| AI Search | [name] | |
| Key Vault | [name] | |
| Storage Account | [name] | |

---

## Build & Test Commands

> The `/deploy` and `/local-test` skills read these commands. Fill in for your stack.

| Step | Command | Notes |
|------|---------|-------|
| Build | `dotnet build` | [or `npm run build`, `go build ./...`, `make build`] |
| Unit tests | `dotnet test --filter "Category!=Integration"` | [or `npm test`, `pytest -m "not integration"`, `go test ./...`] |
| All tests | `dotnet test` | [or `npm run test:all`, `pytest`, `go test -tags=integration ./...`] |
| Lint (optional) | | [e.g. `npm run lint`, `golangci-lint run`] |

---

## Notes

[Any environment-specific quirks, known issues, or setup notes]
