# Where the UI gets its data

The harness already writes most of what the UI needs as plain files under each project's `tasks/` folder. The UI should **read** those files and never become a second source of truth. The few things it doesn't record yet are marked **NEW**.

> Verify each format against the repo before building: these notes were written from `skills/implement/SKILL.md`, `skills/implement/bin/progress.js`, `skills/implement/bin/feature-state.js`, `rules/phase-markers.md` and `hooks/session-log.js` (harness v3.2.0).

## Already in the harness

| UI element | Source | Notes |
|---|---|---|
| Project list | **NEW**: a list of repo paths the user added (e.g. `~/.harness/projects.json`) | Each repo has `.claude/.harness-manifest.json` (pack, tracker) |
| Feature + its stories, order, status, commit | `tasks/features/<fid>/feature-state.md` | Header `key: value` lines, then `story <sid>: status=… step=… commit=…`. Status: pending, running, committed, stuck, held, skipped |
| Live phase of a story | `tasks/stories/<sid>/phase.md` | `phase` (planning/coding/testing/reviewing/shipping), `role`, `updated`, `detail`. Staleness → "No new step for …" |
| Step position / resume point | `tasks/stories/<sid>/executor-state.md` | `step:` (understand, goal, plan, tests, red, code, green, review, commit, local-test, panel, e2e-gate, pr, done), `round:` |
| Event feed ("Since you left", step list, story bar) | `tasks/features/<fid>/progress.log` (story-only runs: `tasks/stories/<sid>/progress.log`) | One line each: `[harness] ts=… feature=… story=… event=… phase=… detail="…"`. Events: run-started, run-resumed, run-paused, run-finished, phase, step, review-done, pr-opened, tracker-error, story-started, story-committed, story-stuck |
| Plan, coverage, questions | `tasks/stories/<sid>/plan.md`, `brief.md` (templates in `templates/tasks/stories/`) and the Feature's plan files | Plan gate state: `plan-approved`, `gate-shown` in feature-state.md |
| One session per Feature | `tasks/features/<fid>/claim.md` | Shows which session owns the run |
| Session history | `tasks/sessions.jsonl` | One JSON line per session end |
| PR number | `pr-opened` progress event | |

## NEW: what the harness doesn't record yet

1. **Machine-wide slots and queue.** Today one session builds one Feature. The board needs a small **scheduler** that starts up to N `/implement <fid>` sessions, keeps the ordered queue (Up next), and enforces "starts after X reaches its PR". Store it in `~/.harness/queue.json` or per project in `tasks/queue.json`.
2. **Feature-to-feature dependencies.** Story blockers exist inside a Feature; dependencies *between* Features don't. Add a `depends-on:` header line in feature-state.md, or keep them in the queue file.
3. **Structured step log for Dig deeper.** progress.log has one line per step. Dig deeper also wants, per step: the agent (orchestrator / story-builder / suite-runner / story-reviewer), the tool call (verb, input, result), the files changed, and the agent's reasoning text. Options:
   - a PostToolUse hook that appends JSON lines to `tasks/features/<fid>/steps.jsonl` (`{ts, agent, story, step, tool, input, result, files}`);
   - reasoning text from the Claude Code session transcript (`~/.claude/projects/…/*.jsonl`), matched by session id and time.
4. **Chat with the orchestrator from the UI.** The run lives in a Claude Code session. Choices: (a) start runs through the Claude Agent SDK so the UI owns the session and can send messages; or (b) a file inbox, `tasks/features/<fid>/inbox.md`, that the orchestrator reads before each step (the same idea as "Notes are read before the next step" in the work harness). (a) gives real chat and streaming; (b) is simpler and works with today's terminal runs.
5. **Answering questions from the UI.** Questions are asked at the plan gate and on pause triggers. They need a machine-readable form: `tasks/features/<fid>/questions.json` (`{id, text, options:[{id,label,recommended}], answer}`). The UI writes `answer`, and the run reads it on resume.
6. **PR watcher.** A poller (every 5 min) using `code-platform/` (`gh` / Azure Repos) that records checks and comments and moves merged Features to Completed.
7. **Pause / resume / park** from the UI: write a flag the orchestrator checks between steps; resume = `/implement --resume <fid>`.

## Suggested shape (choose with Claude Code)

- Keep the harness runtime zero-dependency. Put the UI in its own folder (e.g. `ui/`) with its own `package.json`.
- **Local server** (Node, no framework needed): reads/watches `tasks/` with `fs.watch`, parses the files above, serves JSON plus a Server-Sent Events stream of changes, and writes answers/inbox/flags. Bind to `127.0.0.1` only.
- **Front end**: React + Vite + TypeScript, plain CSS with `tokens.css`. No component library is needed; every component in DESIGN.md is simple.
- Later, if wanted: wrap it in Tauri/Electron as a desktop app.
