---
name: local-test
description: Run local build, tests, integration testing, and the feature's e2e goal gate. Stack-agnostic — reads commands from tasks/lessons.md (enterprise) or tasks/notes.md (solo). Use before committing, after code changes, or when another skill asks you to verify. Usage: /local-test [1|2|3|e2e]
argument-hint: Level (1=build+unit, 2=build+unit+integration, 3=Level2+dev server for manual testing, e2e=run the story's e2e goal gate). Default=2
---

**Core Philosophy:** Verify locally at the right level — Level 1 for quick build checks, Level 2 for full integration, Level 3 when you need to manually interact with the running application.

**Triggers:** "run local tests", "verify build", "check everything works locally", "run the test suite", "local-test before committing", "verify before PR"

---

You run local verification at the requested level. If no level is given, default to **Level 2**. `e2e` is a distinct capability (not a numeric level) — the goal gate for `/story` Phase 3.7.

**First:** Read `YOUR_PROJECT_ROOT/tasks/lessons.md` to find the project's test configuration. If `lessons.md` does not exist, read `YOUR_PROJECT_ROOT/tasks/notes.md` instead — solo projects store the same test commands there under the "Test Commands" section. All commands come from one of these two files — nothing is hardcoded.

---

## What each level does

### Level 1 — Build + Unit Tests

Fast feedback. No external dependencies required.

1. **Build** — run the build command from `lessons.md`
2. **Unit tests** — run the unit test command from `lessons.md`
3. **Report** — pass/fail + test count

If the build fails, stop immediately — no point running tests.

### Level 2 — Build + Unit Tests + Integration Tests

Full verification. May require external dependencies (Docker, databases, emulators).

1. **Everything in Level 1**
2. **Pre-flight check** — if `lessons.md` defines Docker/emulator prerequisites, check they're running. If Docker is required but not running, fall back to Level 1 and say: **"Docker is not running — falling back to Level 1 (build + unit tests only)."** Do NOT attempt to start Docker yourself.
3. **Start dependencies** — if `lessons.md` defines a setup command (docker compose, database migration, seed data), run it
4. **Integration tests** — run the integration test command from `lessons.md`
5. **Cleanup** — stop any dependencies started in step 3 (docker compose down, etc.)
6. **Report** — pass/fail at each stage

### Level 3 — Full Stack + Dev Server (for manual testing)

Everything in Level 2, plus a running application for manual interaction.

1. **Everything in Level 2** (but do NOT clean up dependencies — keep them running)
2. **Start dev server** — run the dev server command from `lessons.md`
3. **Print the URL** — tell YOUR_NAME the localhost URL to open in a browser
4. **Stay running** — does NOT auto-stop. YOUR_NAME closes it when done.

### e2e — Run the story's e2e goal gate

The end-to-end gate for the current feature — the terminal check `/story` Phase 3.7 runs. Unlike Levels 1-3 (which are fixed build/test stages), the e2e gate is **per-feature**: its modality and concrete command were chosen during planning and recorded in the story's `test-strategy.md` ("Goal" + "Concrete gate").

1. **Read the gate.** Find the story's `tasks/stories/<id>/test-strategy.md` and read its **Goal** (chosen e2e modality) and **Concrete gate**. If a story ID wasn't passed, ask which story's gate to run.
2. **Find the gate command.** The actual command comes from `tasks/lessons.md` / `tasks/notes.md` under an "E2E gate" (or modality-specific) entry — **never hardcode it here**. Different modalities run differently:
   - **Automated test / integration:** the e2e/acceptance test command from the lessons file.
   - **UI automation:** the UI e2e command (e.g. the project's browser-driver suite).
   - **Domain-specific graded eval:** the project's eval runner (defined in the project's own skills/docs, not here).
   - **Structured human acceptance** (no machine oracle): there is no command to run — instead surface the ACTUAL behavior using the story's **observability plan** (API response, log, trace, screenshot; never a raw prod DB read) and report it for a human sign-off. Do NOT declare PASS yourself.
3. **Run it and report** PASS/FAIL against each acceptance criterion (the criteria ARE the gate). For the human-acceptance case, report "AWAITING HUMAN SIGN-OFF" with the evidence shown.
4. **Never fix on failure** — report the failure back to the caller (`/story` Phase 3.7 owns the diagnostic re-approach).

If neither lessons file defines an e2e gate command and the modality isn't structured-human-acceptance, say so and report SKIPPED — do not invent a command.

---

## How to run

Read the commands from `tasks/lessons.md` under the "Test Commands" section. Execute them in order for the requested level.

**If `lessons.md` has a project-specific test script** (e.g., a PowerShell script, shell script, or Makefile target), run that instead:

```bash
# Example: project has a custom test script
cd YOUR_PROJECT_ROOT && <custom-test-script> <level>
```

**If no custom script exists**, run the commands from `lessons.md` directly:

```bash
# Level 1
cd YOUR_PROJECT_ROOT && <build command>
cd YOUR_PROJECT_ROOT && <unit test command>

# Level 2 (additional)
cd YOUR_PROJECT_ROOT && <setup command>  # if defined (e.g., docker compose up -d)
cd YOUR_PROJECT_ROOT && <integration test command>
cd YOUR_PROJECT_ROOT && <cleanup command>  # if defined (e.g., docker compose down)

# Level 3 (additional)
cd YOUR_PROJECT_ROOT && <dev server command>  # stays running
```

---

## Interpreting results

Report results as a summary table:

| Step | Status | Details |
|------|--------|---------|
| Build | PASS/FAIL | [error count if failed] |
| Unit Tests | PASS/FAIL | [N passed, M failed] |
| Integration Tests | PASS/FAIL/SKIPPED | [N passed, M failed, or why skipped] |

If any step fails:
1. Show the exact error output to YOUR_NAME
2. Do NOT retry automatically — this is a verification step, not a fix-it step
3. If called from another skill (`/run-tasks`, `/story`, `/implement`), report the failure back to that skill

---

## Hard rules

- Never modify source code — this skill only tests, never fixes
- Never commit anything
- Always clean up dependencies on exit (even on failure) — don't leave Docker containers or background processes running
- If Docker/emulators are not available at Level 2+, fall back to Level 1 and say why
- All commands come from `tasks/lessons.md` (enterprise) or `tasks/notes.md` (solo) — never guess or hardcode test commands
- If neither file defines a required command (e.g., no integration test command), skip that step and note it in the report

---

## Stack-specific examples

The following are examples of what `tasks/lessons.md` might define. See the "Test Commands" section of the lessons template for the full format.

**.NET:**
```
Build: dotnet build MySolution.sln
Unit tests: dotnet test MySolution.sln --filter "Category!=Integration"
Integration tests: dotnet test MySolution.sln --filter "Category=Integration"
Setup: docker compose -f docker-compose.yml up -d
Cleanup: docker compose -f docker-compose.yml down
Dev server: dotnet run --project src/MyApi/MyApi.csproj --urls http://localhost:5000
```

**Node.js:**
```
Build: npm run build
Unit tests: npm test
Integration tests: npm run test:integration
Setup: docker compose up -d
Cleanup: docker compose down
Dev server: npm run dev
```

**Python:**
```
Build: python -m py_compile src/**/*.py
Unit tests: pytest tests/unit/
Integration tests: pytest tests/integration/
Setup: docker compose up -d && python scripts/seed_db.py
Cleanup: docker compose down
Dev server: uvicorn main:app --reload --port 8000
```

**Go:**
```
Build: go build ./...
Unit tests: go test ./... -short
Integration tests: go test ./... -run Integration
Setup: docker compose up -d
Cleanup: docker compose down
Dev server: go run ./cmd/server/main.go
```
