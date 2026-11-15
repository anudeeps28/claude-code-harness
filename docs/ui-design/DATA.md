# Where the UI gets its data

**Version 2 · 2026-11-13.** The app is an **Electron** app on Mac and Windows. Its main process reads and writes each project's `tasks/` folder and talks to the harness; the renderer is the UI. The UI **reads** the harness's files and never becomes a second source of truth. Anything the harness doesn't record yet is marked **NEW**.

> Check every format against the repo before building. The version 1 notes came from `skills/implement/SKILL.md`, `skills/implement/bin/progress.js`, `skills/implement/bin/feature-state.js`, `rules/phase-markers.md` and `hooks/session-log.js` (harness v3.2.0). Several items below were agreed in the 2026-11-13 planning session and may already have a decided shape there. Where they differ, the decision wins.

## 1. Already in the harness

| UI element | Source | Notes |
|---|---|---|
| Feature, its stories, order, status, commit | `tasks/features/<fid>/feature-state.md` | Header `key: value` lines, then `story <sid>: status=… step=… commit=…` |
| Live phase of a story | `tasks/stories/<sid>/phase.md` | `phase`, `role`, `updated`, `detail`. Staleness → "No new step for …" |
| Step position / resume point | `tasks/stories/<sid>/executor-state.md` | `step:`, `round:` |
| Event feed, story bars | `tasks/features/<fid>/progress.log` | `[harness] ts=… feature=… story=… event=… phase=… detail="…"` |
| Plan, coverage | plan files under `tasks/` (templates in `templates/tasks/stories/`) | Plan gate state: `plan-approved`, `gate-shown` |
| One session per feature | `tasks/features/<fid>/claim.md` | |
| Session history | `tasks/sessions.jsonl` | |
| PR number | `pr-opened` event | |

## 2. Version 1 items still NEW

1. **Slots and queue scheduler** (Settings → Parallel slots, default 5). Starts up to N `/implement <fid>` sessions in Electron's main process and keeps the ordered queue.
2. **Feature-to-feature dependencies.** A `depends-on:` header line in feature-state.md. **Changed in v2:** a dependent starts only when its dependency is **merged**, not when it reaches its PR.
3. **Per-step log for Dig deeper:** `tasks/features/<fid>/steps.jsonl`, `{ts, agent, story, step, tool, input, result, files}`. Reasoning text comes from the session transcript.
4. **Messages to the orchestrator:** an inbox the orchestrator reads at each step boundary. See §3.2 for read receipts.
5. **Questions file:** `tasks/features/<fid>/questions.json`. Now with option detail (§3.1).
6. **PR watcher:** see §3.8 for the new rules.

## 3. NEW in version 2

### 3.1 Answer options with detail (B1, B7)
Every place answers appear reads the same shape:

```json
{ "id": "q2", "text": "When a page has no match in the other version, where should the jump go?",
  "answer": null,
  "options": [
    { "id": "home", "label": "That version's home", "recommended": true,
      "means": "The reader lands on the other version's start page…",
      "pros": ["Nothing new to build"], "cons": ["They lose their place"],
      "pickIf": "Missing pages are rare.", "skipIf": "Versions differ a lot." } ] }
```

- The run writes options with detail. The UI writes `answer` (an option id, or `{ "custom": "…" }` for a typed reply).
- **Accept all recommended** writes the recommended id into every question whose `answer` is null, and nothing else.
- The same shape serves the board question card, the "main changed" card (§3.9), Focus, the plan gate and the planning view.

### 3.2 Messages to the run, with read receipts (A2, B5)
- `tasks/features/<fid>/inbox.jsonl`: `{id, ts, text, from: "you" | "side-chat"}`.
- The orchestrator appends `{id, readAt}` to `inbox-read.jsonl` when it reads a message at a step boundary.
- The UI shows "Sent · read at its next step" until a `readAt` exists, then "Read", then the orchestrator's reply (an event in progress.log or a line in the transcript).

### 3.3 Side chat (A2)
- A **separate, read-only** session per feature, started on demand. Give it the plan, the last N steps from `steps.jsonl`, the current diff (`git diff main...feature/<fid>`) and the transcript tail.
- It has **no write tools**.
- Store the conversation per feature in `tasks/features/<fid>/side-chat.jsonl`, so it's there when you come back.
- **Send to the run** writes the edited instruction to the inbox with `from: "side-chat"`.

### 3.4 Pause, Stop now, Park (B2)
- A control file the orchestrator checks: `tasks/features/<fid>/control.json`, `{ "request": "pause" | "stop" | "park" | null, "at": ts }`.
- **pause:** finish the step in flight, save it, then stop. The UI shows "Pausing · finishing <step> first" from the moment the request is written.
- **stop:** stop at once. Resume redoes the step in flight from executor-state.md.
- **park:** like pause, then the scheduler frees the slot and puts the feature back in the queue, unnumbered, with `parked: true`. Resume = un-park, so it takes the next free slot.

### 3.5 Planning (A1)
- **A planning session** = one Claude session per idea (counts against "Plans written at once", not slots). Store it in `~/.harness/planning/<id>/` or the project's `tasks/planning/<id>/`:
  - `session.json`: `{id, project, text, title, stage: "describe" | "sizing" | "talk" | "propose", mode: "grill" | "map", size: "small" | "big"}`
  - `questions.json`: grilling questions in the §3.1 shape, asked one at a time
  - `map.json` (wayfinder): `{destination, tickets: [{id, short, question, dependsOn: [ids], status: "open" | "active" | "resolved", answer}]}`. Layout positions are the UI's job (layer by dependency depth).
  - `summary.json`: the live summary, `{decided: [{q, text}], open: [ids], scopeIn: [], scopeOut: []}`
  - `proposal.json`: the output of `/plan-features`, `{features: [{name, dependsOn: [names], stories: [{title, after}]}]}`
- **Create these** is the only write to the real tracker and `tasks/features/`. Each created feature starts in its plan-writing state, then reaches its own plan gate (§4.5).
- **A pasted issue number** skips planning: look the issue up through the tracker adapters and open its plan gate.
- **The board card** while planning reads `session.json` (stage, mode) and `map.json` (resolved count).

### 3.6 Review panel size and re-checks (B8)
- In feature-state.md (or steps.jsonl): `review: light | full`, `reviewReason: "120 lines, nothing sensitive" | "touches login"`, plus the checks run (light = 4 of 8).
- The full panel is chosen when the diff touches a **sensitive area** (§3.11).
- Each finding: `{check, text, status: "open" | "fixed" | "still-there"}`, updated after the re-check.

### 3.7 Proof per acceptance check (B6)
- `tasks/features/<fid>/proof/<ac-id>/`, with:
  - `recording.webm` (a recording of the app window, made during Prove it)
  - `response.json` (`{request, status, body}`) for API checks
  - `test-output.txt`
  - `signoff.json` (`{by: "you", at}`) for a check you signed off
- `tasks/features/<fid>/acceptance.json`: `[{ac, text, met: true | false, proof: "video" | "api" | "test" | "signed", removedAt?}]`. **This file is never removed.**
- History cleanup (§3.10) deletes the proof folders and sets `removedAt`. The UI then shows "Proof removed after <setting>".

### 3.8 PR rules (B8)
- After each story commit: **push**, and log `event=story-pushed` (the "saved to GitHub" mark).
- The PR body starts with a **Not done** section: `notDone: [{story, title, trackerUrl}]` in feature-state.md, shown at the top of the in-app PR summary.
- The watcher polls every 5 min, waits the project's **wait after the last review comment** (default 10 min) before fixing, and only then fixes the whole review.
- **On merge with notDone stories:** create a follow-up feature (`followUpOf: <fid>`) containing them. It waits for its own plan approval. The merged feature records `movedTo: <follow-up name>` for Completed.

### 3.9 Can't catch up with main (B8)
When rebasing or merging main into the feature branch hits conflicts on lines the feature changed, the run stops. It writes a question (§3.1 shape) with `kind: "main-changed"` and `files: […]`, and options like "Rebuild on main's version" (recommended) and "Keep this branch's lines".

### 3.10 App settings (A5)
Stored by Electron in the user's app data folder (`app.getPath('userData')/settings.json`):

```json
{ "parallelSlots": 5, "plansAtOnce": 2, "historyDays": 90, "updateCheck": "daily",
  "projectsFolder": "~/Projects", "theme": "dark", "tone": "modern", "density": "comfortable",
  "projects": [ { "path": "/Users/you/Projects/billing-service" } ] }
```

- `historyDays`: 30 | 90 | 365 | null (forever). It drives the proof cleanup in §3.7.

### 3.11 Per-project settings (A5)
`<project>/.claude/harness-project.json`:

```json
{ "prReviewBot": { "name": "CodeRabbit", "detected": true }, "waitAfterLastReviewMin": 10,
  "sensitiveAreas": ["auth/", "billing/", "payments/", "login", "password", "token", "migrations/"] }
```

- **Bot detection:** look at the authors of review comments on recent PRs through `code-platform/`.

### 3.12 Projects, install and house rules (A3)
- **Project list:** `settings.json → projects`.
- **Brand-new:** create the folder, run `git init`, then install.
- **Existing folder:** native folder picker (`dialog.showOpenDialog`).
- **Clone:** `git clone <url>` into the projects folder.
- **Harness present?** The folder has `.claude/.harness-manifest.json`. Its version against the app's bundled harness decides the "Newer harness available" row notice.
- **Install / Update:** run the harness installer (`install/`) into the project. It adds only `.claude/` and `tasks/`.
- **House rules:** `<project>/.claude/house-rules.md`, one rule per line (the definition of done).
  - On install, draft them from what's detected (UI framework, API folder, and so on).
  - On update, show only the rules the new harness version adds.
  - The reviewers and the PR gate read this file.
- **UI detection:** a `package.json` with React, Vue or Svelte, an `index.html`, and so on.
- **Branding:** `<project>/.claude/brand.md` (+ screenshots). Missing on a UI project → offer setup. Skipped → flag `brandingOffer: "skipped"`, and offer again when a feature's diff first touches UI files.

### 3.13 App updates (A4)
- Electron's `autoUpdater`, checking daily or weekly per settings. "What's new" comes from the release notes.
- After an app update, compare each project's harness version against the bundled one to show the row notices.

## 4. Suggested shape (choose with Claude Code)

- **Electron main process:** the scheduler, file watchers on each project's `tasks/` (`fs.watch` or chokidar), the PR watcher, the update checker, and the Claude sessions (Agent SDK recommended, now that side chat and planning both need sessions the app owns).
- **Renderer:** React + Vite + TypeScript, plain CSS with `tokens.css`, no component library needed.
- **IPC:** typed channels for file state → UI and UI actions → files (answers, inbox, control, settings).
- The harness runtime stays zero-dependency. The app is a separate package (`app/` or its own repo).
