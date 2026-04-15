#!/usr/bin/env node
// PreToolUse safety hook — blocks destructive operations.
// Even in --dangerously-skip-permissions mode, exit 2 + decision:deny
// will prevent the tool call from executing.
//
// Threat model and bypass discussion: see hooks/SECURITY.md.
//
// Two rule sets, applied based on tool name:
//   - BASH_RULES: applied to Bash command strings
//   - WRITE_RULES: applied to Write file content + path (skipped for docs)

const { readStdinJson, deny, ok, runHook } = require('./lib/hook-io');

// ── Bash command rules ────────────────────────────────────────────────
const BASH_RULES = [
  // 1. Git: commit and push (user wants oversight)
  { id: 'git-commit', re: /\bgit\s+commit\b/i, reason: 'git commit — needs your approval' },
  { id: 'git-push',   re: /\bgit\s+push\b/i,   reason: 'git push — needs your approval' },

  // 2. Git: destructive operations
  { id: 'git-reset-hard',  re: /\bgit\s+reset\s+--hard\b/i,            reason: 'git reset --hard — destroys uncommitted work' },
  { id: 'git-checkout-dot', re: /\bgit\s+checkout\s+\.\s*$/i,          reason: 'git checkout . — discards all unstaged changes' },
  { id: 'git-checkout-dd', re: /\bgit\s+checkout\s+--\s/i,             reason: 'git checkout -- — discards file changes' },
  { id: 'git-clean',       re: /\bgit\s+clean\s+-[a-z]*f/i,            reason: 'git clean -f — deletes untracked files permanently' },
  { id: 'git-branch-D',    re: /\bgit\s+branch\s+-D\b/,                reason: 'git branch -D — force-deletes a branch' },
  { id: 'git-rebase-main', re: /\bgit\s+rebase\b.*(master|main)\b/i,   reason: 'git rebase on master/main — dangerous' },
  { id: 'git-restore-dot', re: /\bgit\s+restore\s+\.\s*$/i,            reason: 'git restore . — discards all unstaged changes' },

  // 3. File deletion (rm -rf for /temp/acr-build is allowlisted below)
  { id: 'rm-rf',           re: /\brm\s+-[a-z]*r[a-z]*f/i,              reason: 'rm -rf — recursive force delete' },
  { id: 'rm-f',            re: /\brm\s+-[a-z]*f/i,                     reason: 'rm -f — force delete' },
  { id: 'rm-r',            re: /\brm\s+-r\b/i,                         reason: 'rm -r — recursive delete' },
  { id: 'remove-item-recurse', re: /remove-item.*-recurse/i,           reason: 'Remove-Item -Recurse — recursive delete' },
  { id: 'remove-item-force',   re: /remove-item.*-force/i,             reason: 'Remove-Item -Force — force delete' },
  { id: 'del-f',           re: /\bdel\s+\/[a-z]*f/i,                   reason: 'del /f — force delete' },
  { id: 'rmdir-s',         re: /\brmdir\s+\/s/i,                       reason: 'rmdir /s — recursive directory delete' },

  // 4. Azure resource destruction
  { id: 'az-group-delete',         re: /\baz\s+group\s+delete\b/i,             reason: 'az group delete — deletes entire resource group' },
  { id: 'az-webapp-delete',        re: /\baz\s+webapp\s+delete\b/i,            reason: 'az webapp delete — deletes web app' },
  { id: 'az-sql-delete',           re: /\baz\s+sql\s+(db|server)\s+delete\b/i, reason: 'az sql delete — deletes database/server' },
  { id: 'az-containerapp-delete',  re: /\baz\s+containerapp\s+delete\b/i,      reason: 'az containerapp delete — deletes container app' },
  { id: 'az-storage-delete',       re: /\baz\s+storage\s+account\s+delete\b/i, reason: 'az storage account delete — deletes storage' },
  { id: 'az-keyvault-delete',      re: /\baz\s+keyvault\s+delete\b/i,          reason: 'az keyvault delete — deletes Key Vault' },
  { id: 'az-search-delete',        re: /\baz\s+search\s+service\s+delete\b/i,  reason: 'az search service delete — deletes AI Search' },
  { id: 'az-functionapp-delete',   re: /\baz\s+functionapp\s+delete\b/i,       reason: 'az functionapp delete — deletes Functions app' },

  // 5. Database destructive SQL (Bash invocations only — running sqlcmd, psql, etc.)
  { id: 'sql-drop',     re: /\bdrop\s+(table|database|index|view|procedure)\b/i, reason: 'DROP statement — destroys database objects' },
  { id: 'sql-truncate', re: /\btruncate\s+table\b/i,                             reason: 'TRUNCATE TABLE — deletes all rows permanently' },
  { id: 'sql-delete',   re: /\bdelete\s+from\b/i,                                reason: 'DELETE FROM — deletes database rows (needs review)' },

  // 6. Credential / secret leakage
  { id: 'curl-creds',  re: /\bcurl\b.*\b(password|secret|key|token)\b/i,                     reason: 'curl with credentials — potential secret leak' },
  { id: 'echo-secrets', re: /\becho\b.*\b(password|secret|api.?key|connection.?string)\b/i,  reason: 'echo with secrets — potential credential exposure' },
  { id: 'printenv',    re: /\bprintenv\b/i,                                                  reason: 'printenv — may expose secrets in environment' },

  // 7. Pipe-to-shell (supply chain risk)
  { id: 'curl-pipe-sh', re: /\bcurl\b.*\|\s*(ba)?sh/i,  reason: 'curl piped to shell — supply chain risk' },
  { id: 'wget-pipe-sh', re: /\bwget\b.*\|\s*(ba)?sh/i,  reason: 'wget piped to shell — supply chain risk' },
  { id: 'iex-web',      re: /\biex\b.*\bweb/i,           reason: 'iex (Invoke-Expression) from web — supply chain risk' },

  // 8. Process killing
  { id: 'taskkill-f',   re: /\btaskkill\s+\/f\b/i,            reason: 'taskkill /f — force-kills a process' },
  { id: 'kill-9',       re: /\bkill\s+-9\b/,                  reason: 'kill -9 — force-kills a process' },
  { id: 'stop-process-force', re: /\bstop-process\s+-force\b/i, reason: 'Stop-Process -Force — force-kills a process' },

  // 9. Package publishing (irreversible)
  { id: 'nuget-push',  re: /\bdotnet\s+nuget\s+push\b/i, reason: 'dotnet nuget push — publishes package (irreversible)' },
  { id: 'npm-publish', re: /\bnpm\s+publish\b/i,         reason: 'npm publish — publishes package (irreversible)' },
];

// Allowlist: rm -rf inside the ACR build staging folder is intentional.
const RM_ACR_ALLOWLIST = /\brm\s+-[a-z]*r[a-z]*f\b.*\/temp\/acr-build/i;

// ── Write content rules ───────────────────────────────────────────────
// Write rules check for *committed secrets*. Destructive-command regexes
// (rm, DROP, etc.) intentionally don't run on Write content because docs
// frequently quote them ("don't run DROP TABLE without a backup").
const WRITE_RULES = [
  // Curl with creds in a file (e.g. an example committed into a script).
  { id: 'curl-creds-file', re: /\bcurl\b.*\b(password|secret|key|token)\b/i,
    reason: 'Write contains curl with credentials — move secrets to a vault' },

  // PEM private key headers — never legitimate to commit.
  { id: 'pem-private-key', re: /-----BEGIN (RSA |EC |DSA |OPENSSH |)PRIVATE KEY-----/,
    reason: 'Write contains a PEM private key — never commit private keys' },
];

// Files where docs commonly quote dangerous commands; skip Write rules entirely.
const DOCS_PATH_RE = /\.(md|mdx|rst|txt)$/i;
const DOCS_DIR_RE = /[\\/]docs[\\/]/i;

function isDocsPath(p) {
  return DOCS_PATH_RE.test(p) || DOCS_DIR_RE.test(p);
}

// Heuristic: a long token + a secret keyword in the same content suggests
// a hardcoded credential. Catches cases the explicit rules miss.
function looksLikeHardcodedSecret(content) {
  const lower = content.toLowerCase();
  const hasLongToken = /[a-z0-9_\-+/=]{32,}/.test(lower);
  const hasSecretWord = /(connectionstring|apikey|api_key|secret|password|bearer|client_secret|access_token|refresh_token)/.test(lower);
  return hasLongToken && hasSecretWord;
}

function checkRules(rules, text) {
  for (const rule of rules) {
    if (rule.re.test(text)) deny(rule.reason, rule.id);
  }
}

runHook('safety-check', async () => {
  const input = await readStdinJson();
  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};

  if (toolName === 'Bash') {
    const command = toolInput.command || '';
    if (RM_ACR_ALLOWLIST.test(command)) return ok();
    checkRules(BASH_RULES, command);
    return ok();
  }

  if (toolName === 'Write') {
    const filePath = toolInput.file_path || '';
    if (isDocsPath(filePath)) return ok();
    const content = toolInput.content || '';
    checkRules(WRITE_RULES, content);
    if (looksLikeHardcodedSecret(content)) {
      deny('Write contains what looks like a hardcoded secret — use Key Vault or user-secrets', 'hardcoded-secret');
    }
    return ok();
  }

  // Non-Bash / non-Write tools (Read, Edit, Glob, Grep, etc.) are out of scope.
  return ok();
});

