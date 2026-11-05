# Hooks

Node.js scripts that run automatically on Claude Code tool events. The installer wires them into `.claude/settings.json`.

**Cross-platform:** All hooks run on Node.js (>= 20). One implementation for Windows, macOS, and Linux. No external dependencies — pure stdlib.

---

## Scripts in this folder

| Script | Hook event | Matcher | What it does |
|---|---|---|---|
| `safety-check.js` | `PreToolUse` | `Bash\|Write` | Blocks destructive git, file, Azure, and database operations before they run. Blocks writes that look like hardcoded secrets. |
| `catalog-trigger.js` | `PostToolUse` | `Write\|Edit` | When a skill, agent, or command file is edited, spawns `catalog-skills.js` in the background |
| `catalog-skills.js` | (called by trigger) | — | Scans all skills, agents, and hooks across `CLAUDE_HARNESS_WORK_ROOT` + `~/.claude/` and writes `SKILLS_CATALOG.md` to the work root |
| `drift-check.js` | `PostToolUse` | `Write\|Edit` | When one of the 7 enterprise task files is edited, checks cross-file invariants. Soft-warns on enum mismatches, hard-blocks on people.md ↔ flags-and-notes.md cross-reference drift (directs user to `/sync-tasks`). Set `CLAUDE_HARNESS_DRIFT_LEVEL=full` to also check branch naming + sprint story brief.md presence. |
| `pre-compact.js` | `PreCompact` | `*` | Appends a timestamp marker to `tasks/todo.md` and injects a reminder for Claude to save its in-progress state |
| `session-log.js` | `SessionEnd` | `*` | Appends a JSONL line to `tasks/sessions.jsonl` with timestamp, session ID, branch, and story ID |
| `lib/hook-io.js` | (shared lib) | — | stdin JSON read + stdout JSON write helpers |
| `lib/frontmatter.js` | (shared lib) | — | Minimal YAML frontmatter parser for SKILL.md / agent.md |
| `lib/walk.js` | (shared lib) | — | Recursive directory walk with predicate filter |

---

## Configuration

`catalog-skills.js` requires `CLAUDE_HARNESS_WORK_ROOT` — the folder containing your projects. The installer writes this into the `env` block of `settings.json`:

```json
{
  "env": {
    "CLAUDE_HARNESS_WORK_ROOT": "/home/username/projects"
  },
  ...
}
```

Or export it in your shell if running manually:

```bash
export CLAUDE_HARNESS_WORK_ROOT="$HOME/projects"
node ~/.claude/hooks/catalog-skills.js
```

### Optional: extended drift detection

Set `CLAUDE_HARNESS_DRIFT_LEVEL=full` (default `mvp`) to enable two extra invariants in `drift-check.js`:

- **Branch naming** — every Branch entry in `pr-queue.md` must match `feature/`, `fix/`, `hotfix/`, or `chore/` prefix.
- **Sprint story ↔ brief.md** — every active sprint story (status `In Progress`, `Code Review`, `Blocked`) must have `tasks/stories/<id>/brief.md`.

Both are soft warnings only. They're opt-in to keep hook latency predictable on every edit.

```json
{
  "env": {
    "CLAUDE_HARNESS_WORK_ROOT": "/path/to/projects",
    "CLAUDE_HARNESS_DRIFT_LEVEL": "full"
  }
}
```

### Tests

Unit tests use `node:test` (no runtime deps; `npm install` brings in eslint and c8 for development only):

```bash
npm test                 # all hook + tracker tests
npm run test:hooks       # hooks only
npm run test:trackers    # tracker conformance suite
npm run test:coverage    # with c8 coverage report
```

110 hook tests + 19 tracker conformance tests = 129 total (v1.5):

- `safety-check.test.js` — 72 cases: every BASH_RULES entry, false-positive negatives, ACR/docs allowlists, secret heuristic, out-of-scope tools.
- `hook-io.test.js` — 13 cases: runHook timeout/exception/rejection envelopes, readStdinJson error logging, recordMetric schema, appendWithRotation thresholds + pruning.
- `drift-check.test.js` — 12 cases: all 6 drift invariants (positive, negative, placeholder).
- `frontmatter.test.js` — 10 cases: YAML edge cases.
- `session-log.test.js` — 3 cases: append-on-fresh, append-preserves, 10 MB rotation.
- `trackers/__tests__/conformance.test.js` — 19 cases: arg validation, happy-path golden match, failure modes, retry-and-succeed, contract presence (×2 adapters).

### Threat model

Read [SECURITY.md](SECURITY.md) before adding new safety rules or relying on the hook for anything beyond accidental-command oversight. The safety hook is **not** a sandbox.

---

## Hook wiring in settings.json

The installer generates `.claude/settings.json` with all hooks wired up. Reference structure:

```json
{
  "env": {
    "CLAUDE_HARNESS_WORK_ROOT": "/path/to/your/projects"
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|Write",
        "hooks": [{ "type": "command", "command": "node \"/path/to/.claude/hooks/safety-check.js\"" }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          { "type": "command", "command": "node \"/path/to/.claude/hooks/catalog-trigger.js\"" },
          { "type": "command", "command": "node \"/path/to/.claude/hooks/drift-check.js\"" }
        ]
      }
    ],
    "PreCompact": [
      {
        "matcher": "*",
        "hooks": [{ "type": "command", "command": "node \"/path/to/.claude/hooks/pre-compact.js\"" }]
      }
    ],
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [{ "type": "command", "command": "echo \"SESSION START: read tasks/lessons.md, todo.md, pr-queue.md, flags-and-notes.md\"" }]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "*",
        "hooks": [{ "type": "command", "command": "node \"/path/to/.claude/hooks/session-log.js\"" }]
      }
    ]
  }
}
```

Paths are filled in automatically by `install/install.sh`.

---

## Hook I/O protocol

- Hooks receive tool-call context as JSON on **stdin**.
- Hooks respond on **stdout** with JSON and/or an exit code.
- **PreToolUse** hooks deny by writing `{"decision":"deny","reason":"..."}` and exiting 2. This prevents the tool call.
- **PostToolUse** hooks cannot undo the call (it already ran), but can write `{"decision":"block","reason":"..."}` to tell Claude to stop before further edits.
- Soft context injection (non-blocking hint) uses `{"hookSpecificOutput":{"hookEventName":"<event>","additionalContext":"..."}}`.
- Running any hook manually with no stdin works — the helper detects a TTY or empty stdin and exits cleanly.

---

## All Claude Code hook events

| Event | Fires when |
|---|---|
| `SessionStart` | A new session begins |
| `PreToolUse` | Before a tool call executes — exit code 2 blocks the call |
| `PostToolUse` | After a tool call succeeds |
| `PostToolUseFailure` | After a tool call fails |
| `PreCompact` | Before context window compaction |
| `PostCompact` | After context window compaction |
| `Stop` | Claude finishes responding |
| `UserPromptSubmit` | User submits a prompt, before Claude processes it |
| `InstructionsLoaded` | A CLAUDE.md or rules file is loaded |
| `PermissionRequest` | A permission dialog appears |
| `Notification` | Claude Code sends a notification |
| `SubagentStart` | A sub-agent is spawned |
| `SubagentStop` | A sub-agent finishes |
| `TaskCompleted` | A task is marked as completed |
| `ConfigChange` | A configuration file changes during a session |
| `WorktreeCreate` | A worktree is being created |
| `WorktreeRemove` | A worktree is being removed |
| `TeammateIdle` | An agent team teammate is about to go idle |
| `Elicitation` | An MCP server requests user input |
| `ElicitationResult` | After user responds to an MCP elicitation |
| `SessionEnd` | A session terminates |
