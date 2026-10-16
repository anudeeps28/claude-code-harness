#!/usr/bin/env node
// @ts-check
// PreToolUse safety hook — blocks destructive operations.
// Even in --dangerously-skip-permissions mode, exit 2 + decision:deny
// will prevent the tool call from executing.
//
// Threat model and bypass discussion: see hooks/SECURITY.md.
//
// Two rule sets, applied based on tool name:
//   - BASH_RULES: applied to Bash command strings
//   - WRITE_RULES: applied to Write file content + path (skipped for docs). These look for
//     committed secrets only, so a file that names a blocked command (a test, a doc, a
//     script comment) can still be written (#23).

const { readStdinJson, deny, ask, ok, runHook } = require('./lib/hook-io');

// ── curl credential positions ─────────────────────────────────────────
// A credential word only matters where curl actually sends it (#13293):
//   -u / --user / -U user:pass        --password / --pass / --oauth2-bearer
//   -H "Authorization: …" or any header whose name carries auth/key/token/secret/password, or Cookie
//   ?api_key=… / &token=… / &sig=… query parameters that carry a value
//   -d / --data* / -F / --form / --json carrying password=, "token": and the like
// A word like "key" or "token" in a URL path (/api/key/health), a variable name or a comment
// is not a credential and does not fire.
const CURL_CREDS_RE = new RegExp(
  '\\bcurl\\b[^\\n]*?(?:' + [
    '\\s(?:-u|--user|-U|--proxy-user)[\\s=]*["\']?[^\\s"\':]*:[^\\s"\']+',
    '\\s--(?:password|pass|oauth2-bearer)\\b',
    '\\s(?:-H|--header|--proxy-header)[\\s=]*["\']?\\s*(?:[\\w-]*(?:auth|key|token|secret|passw(?:or)?d)[\\w-]*|cookie)\\s*:',
    '[?&][\\w-]*(?:key|token|secret|passw(?:or)?d|pwd|sig|signature)[\\w-]*=[^&\\s"\'#]+',
    '\\s(?:-d|--data[\\w-]*|-F|--form|--json)[\\s=]*["\']?[^\\n]*?\\b[\\w-]*(?:passw(?:or)?d|pwd|secret|token|api[_-]?key)[\\w-]*["\']?\\s*[=:]',
  ].join('|') + ')',
  'i'
);

// ── Bash command rules ────────────────────────────────────────────────
// action: 'ask' routes the command to the user's approval prompt (oversight —
// the human signs off in the moment). Everything else hard-denies (destructive,
// never allowed). Destructive denials always win over ask prompts (see checkRules).
const BASH_RULES = [
  // 1. Git: commit and push — human oversight, not a ban. Prompt for approval.
  { id: 'git-commit', re: /\bgit\s+commit\b/i, action: 'ask', reason: 'git commit — approve to let Claude run it' },
  { id: 'git-push',   re: /\bgit\s+push\b/i,   action: 'ask', reason: 'git push — approve to let Claude run it' },

  // 2. Git: destructive operations
  { id: 'git-reset-hard',  re: /\bgit\s+reset\s+--hard\b/i,            reason: 'git reset --hard — destroys uncommitted work' },
  { id: 'git-checkout-dot', re: /\bgit\s+checkout\s+\.\s*$/i,          reason: 'git checkout . — discards all unstaged changes' },
  { id: 'git-checkout-dd', re: /\bgit\s+checkout\s+--\s/i,             reason: 'git checkout -- — discards file changes' },
  { id: 'git-clean',       re: /\bgit\s+clean\s+-[a-z]*f/i,            reason: 'git clean -f — deletes untracked files permanently' },
  // Force-delete = -D in any flag cluster, or any delete flag (-d/--delete)
  // combined with any force flag (-f/--force) in either order.
  { id: 'git-branch-D',    re: /\bgit\s+branch\b(?:(?=.*\s-\w*D\b)|(?=.*\s(?:--delete\b|-[a-z]*d[a-z]*\b))(?=.*\s(?:--force\b|-[a-z]*f[a-z]*\b)))/, reason: 'git branch force-delete — discards a branch without merge check' },
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
  // curl-creds fires only when a credential sits where curl sends it (see CURL_CREDS_RE),
  // not when "key" or "token" is a URL path segment or a word in a comment (#13293).
  { id: 'curl-creds',  re: CURL_CREDS_RE,                                                    reason: 'curl with credentials — potential secret leak' },
  // echo-secrets runs on the raw command, heredoc bodies and search patterns included.
  { id: 'echo-secrets', raw: true, re: /\becho\b.*\b(password|secret|api.?key|connection.?string)\b/i,  reason: 'echo with secrets — potential credential exposure' },
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
  { id: 'curl-creds-file', re: CURL_CREDS_RE,
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

// Heuristic: a secret keyword next to something that looks like a secret VALUE suggests a
// hardcoded credential. Catches cases the explicit rules miss. Checked line by line, and the
// value has to be plausible (#13293): a long identifier such as a test method name
// (Script_below_canary_applies_when_secret_name_differs), a Key Vault secret name, a
// ${reference} or a ===== separator line is not a secret, even next to the word "secret".
const SECRET_WORD_RE = /(connectionstring|apikey|api_key|secret|password|bearer|client_secret|access_token|refresh_token)/i;
// <secret word><more identifier chars> [quote] = or : or => [quote] <value>, or "Bearer <value>".
const ASSIGNED_SECRET_RE = /(?:connectionstring|apikey|api_key|secret|password|client_secret|access_token|refresh_token)\w*["']?\s*(?:=>|[:=])\s*@?["'`]?([^\s"'`,;]{20,})|\bbearer\s+([A-Za-z0-9\-._~+/]{20,}=*)/gi;
const LONG_TOKEN_RE = /[A-Za-z0-9_\-+/=~.]{32,}/g;

// A value assigned to a secret word: anything long that is not a reference or a name.
function isPlausibleSecretValue(v) {
  if (/[${}()<>]/.test(v)) return false;                        // ${VAR}, $(cmd), f(x), <placeholder>
  if (/^%\w+%$/.test(v)) return false;                           // %ENV_VAR%
  if (/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+$/.test(v)) return false; // config.Secrets.ApiKey, process.env.X
  if (/^[A-Za-z]+(?:[_\-.][A-Za-z]+)+$/.test(v)) return false;  // my-app-db-password (a name)
  if (/^(?:[a-z]+|[A-Z][a-z]+)(?:[A-Z][a-z]+)+$/.test(v)) return false; // ClientSecretName (a name)
  return true;
}

// A standalone token: long, varied, and not mostly made of words.
function isHighEntropyToken(t) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return false; // GUID
  if (new Set(t).size < 10) return false;                       // ==========, ----------
  const words = t.match(/[A-Z]?[a-z]{3,}|[A-Z]{4,}/g) || [];
  const wordChars = words.reduce((n, w) => n + w.length, 0);
  return wordChars / t.length < 0.5;                            // identifiers are mostly words
}

function looksLikeHardcodedSecret(content) {
  for (const line of content.split('\n')) {
    if (!SECRET_WORD_RE.test(line)) continue;
    for (const m of line.matchAll(ASSIGNED_SECRET_RE)) {
      if (isPlausibleSecretValue(m[1] || m[2])) return true;
    }
    for (const m of line.matchAll(LONG_TOKEN_RE)) {
      if (isHighEntropyToken(m[0])) return true;
    }
  }
  return false;
}

// SAFETY_ALLOW_GIT_COMMIT_PUSH=1 (set in the "env" block of ~/.claude/settings.json) lets
// Claude commit and push without a prompt. It lifts the ask rules only: every deny rule
// still runs first, so "git commit && rm -rf ..." is blocked either way.
function asksDisabled() {
  return process.env.SAFETY_ALLOW_GIT_COMMIT_PUSH === '1';
}

// `text` is what deny rules see. `rawText` (default: the same) is what ask rules and rules
// marked `raw: true` see — for Bash that is the whole command, unstripped.
function checkRules(rules, text, rawText = text) {
  // Destructive denials take precedence: a command that both matches an ask rule
  // and a deny rule (e.g. "git commit && rm -rf") must be hard-blocked, not merely
  // prompted. So run all deny rules first, then the ask prompts.
  for (const rule of rules) {
    if (rule.action === 'ask') continue;
    if (rule.re.test(rule.raw ? rawText : text)) deny(rule.reason, rule.id);
  }
  if (asksDisabled()) return;
  for (const rule of rules) {
    if (rule.action !== 'ask') continue;
    if (rule.re.test(rawText)) ask(rule.reason, rule.id);
  }
}

// Write rules for content that lands in a file (a Write, or a heredoc written by cat/tee).
function checkWriteContent(content) {
  checkRules(WRITE_RULES, content);
  if (looksLikeHardcodedSecret(content)) {
    deny('Write contains what looks like a hardcoded secret — use Key Vault or user-secrets', 'hardcoded-secret');
  }
}

// ── Data vs command (#13293) ──────────────────────────────────────────
// The destructive rules used to scan the whole command string, so a command that only
// MENTIONED a dangerous word as data was denied: a grep pattern, a heredoc written to a
// file, a PR body. commandView() removes exactly two kinds of data before those rules run:
//
//   1. The body of a heredoc whose owner is `cat` or `tee` (written to a file, printed, or
//      substituted into another command's argument) — unless it is piped into anything
//      other than tee, substituted into a code runner (bash -c "$(cat <<EOF…)", eval…), or
//      the file it writes is used again later in the same command (bash x.sh, ./x.sh,
//      cat x.sh | sh). Heredocs owned by anything else (bash, python -, node, psql, ssh…)
//      are code and stay in the scanned text.
//   2. The contents of quoted arguments to read-only search tools (grep, rg, findstr,
//      Select-String…), unless the quote contains $( or a backtick, or rg is given --pre.
//
// Everything else stays: a quoted string given to bash -c / sh -c / eval / powershell -c /
// cmd /c is code; ; && || | $( ) and backticks start new commands that are scanned as
// usual. When the lexer is unsure (unclosed quote, unterminated heredoc, unclosed $( ),
// it strips nothing. See hooks/SECURITY.md for the limits.

const DATA_HEREDOC_OWNERS = new Set(['cat', 'tee']);
const SEARCH_TOOLS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'findstr', 'select-string', 'sls']);
const SHELL_KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'do', 'while', 'until', '!', 'time']);
// A later command that names the heredoc's file without running it.
const SAFE_FILE_FOLLOWUPS = new Set(['git', 'ls', 'wc', 'stat', 'chmod', 'code']);
// Text before a $(cat <<EOF …) that makes the substituted text code, not an argument.
const CODE_PREFIX_RE = /(?:^|[\s;&|(`"'])(?:eval|exec|source|xargs|ssh|sudo|su|bash|sh|zsh|dash|ksh|fish|cmd(?:\.exe)?|pwsh|powershell(?:\.exe)?|iex|invoke-expression|psql|sqlcmd|mysql|sqlite3|osql)(?=[\s"'`]|$)|\s-(?:c|e|Command|EncodedCommand|Q|q)(?=[\s"'`]|$)|\s\/c(?=[\s"'`]|$)|^\s*\.\s/i;

/** First command word of a simple command: skips VAR=x assignments and shell keywords. */
function commandWord(segment) {
  for (const tok of segment.trim().split(/\s+/)) {
    if (!tok) continue;
    if (/^[A-Za-z_]\w*=/.test(tok)) continue;
    if (SHELL_KEYWORDS.has(tok)) continue;
    const bare = tok.replace(/^["']|["']$/g, '');
    return bare.split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, '');
  }
  return '';
}

/**
 * Lex a Bash command. Returns the text the destructive rules should scan, plus the data
 * heredoc bodies (so the Write rules can be applied to them). Returns null when unsure.
 * @param {string} text
 * @returns {{ scan: string, dataBodies: string[] } | null}
 */
function lexCommand(text) {
  /** @type {any[]} */ const heredocs = [];
  /** @type {any[]} */ const segments = [];
  // Frames: { type: 'cmd'|'sq'|'dq', closer, openPos, seg }
  const newSeg = (start) => ({ start, end: -1, quotes: [], heredocs: [], pipedTo: null });
  const root = { type: 'cmd', closer: null, openPos: 0, seg: newSeg(0) };
  /** @type {any[]} */ const stack = [root];
  let pending = [];
  let i = 0;
  const top = () => stack[stack.length - 1];
  const nearestCmd = (from) => { for (let k = from; k >= 0; k--) if (stack[k].type === 'cmd') return stack[k]; return root; };

  const endSeg = (frame, pos, pipe) => {
    const seg = frame.seg;
    seg.end = pos;
    seg.text = text.slice(seg.start, pos);
    seg.word = commandWord(seg.text);
    if (pipe) seg.pipedTo = commandWord(text.slice(pos + 1).split(/[\n;&|]/)[0]);
    for (const h of seg.heredocs) {
      if (h.ownerSeg === seg) h.ownerText = seg.text;
      if (pipe && seg.pipedTo !== 'tee') h.code = true;
    }
    segments.push(seg);
    frame.seg = newSeg(pos + 1);
    // Piped into tee: the heredoc flows on, so the tee stage's own pipe and the files it
    // writes are checked too (cat <<EOF | tee a.sh | sh, … | tee a.sh; bash a.sh).
    if (pipe && seg.pipedTo === 'tee') {
      for (const h of seg.heredocs) { frame.seg.heredocs.push(h); h.segs.push(frame.seg); }
    }
  };

  while (i < text.length) {
    const f = top();
    const ch = text[i];
    if (f.type === 'sq') {
      if (ch === "'") { stack.pop(); nearestCmd(stack.length - 1).seg.quotes.push({ s: f.openPos + 1, e: i, subst: false }); }
      i++; continue;
    }
    if (f.type === 'dq') {
      if (ch === '\\') { i += 2; continue; }
      if (ch === '"') { stack.pop(); nearestCmd(stack.length - 1).seg.quotes.push({ s: f.openPos + 1, e: i, subst: f.subst }); i++; continue; }
      if (ch === '$' && text[i + 1] === '(') { f.subst = true; stack.push({ type: 'cmd', closer: ')', openPos: i, seg: newSeg(i + 2) }); i += 2; continue; }
      if (ch === '`') { f.subst = true; stack.push({ type: 'cmd', closer: '`', openPos: i, seg: newSeg(i + 1) }); i++; continue; }
      i++; continue;
    }
    // cmd context
    if (ch === '\\') { i += 2; continue; }
    if (ch === "'") { stack.push({ type: 'sq', openPos: i }); i++; continue; }
    if (ch === '"') { stack.push({ type: 'dq', openPos: i, subst: false }); i++; continue; }
    if (ch === '#' && (i === 0 || /[\s;&|()]/.test(text[i - 1]))) {
      while (i < text.length && text[i] !== '\n') i++;
      continue;
    }
    if (ch === '$' && text[i + 1] === '(') { stack.push({ type: 'cmd', closer: ')', openPos: i, seg: newSeg(i + 2) }); i += 2; continue; }
    if (ch === '`' && f.closer !== '`') { stack.push({ type: 'cmd', closer: '`', openPos: i, seg: newSeg(i + 1) }); i++; continue; }
    if (ch === '(') { stack.push({ type: 'cmd', closer: ')', openPos: i, seg: newSeg(i + 1) }); i++; continue; }
    if ((ch === ')' || ch === '`') && f.closer === ch) {
      endSeg(f, i, false);
      stack.pop();
      // Heredocs substituted into the enclosing command: code if that command runs code.
      const parent = nearestCmd(stack.length - 1);
      const prefix = text.slice(parent.seg.start, f.openPos);
      for (const s of segments) {
        if (s.start < f.openPos || s.end > i) continue;
        for (const h of s.heredocs) {
          if (CODE_PREFIX_RE.test(prefix)) h.code = true;
          if (!parent.seg.heredocs.includes(h)) parent.seg.heredocs.push(h);
        }
      }
      i++; continue;
    }
    if (ch === '<' && text[i + 1] === '<') {
      if (text[i + 2] === '<') { i += 3; continue; } // here-string
      let j = i + 2;
      const dash = text[j] === '-';
      if (dash) j++;
      while (text[j] === ' ' || text[j] === '\t') j++;
      const m = /^[^\s;&|<>()]+/.exec(text.slice(j));
      if (!m) { i = j; continue; }
      const delim = m[0].replace(/["'\\]/g, '');
      const h = { dash, delim, ownerSeg: f.seg, segs: [f.seg], ownerWord: commandWord(text.slice(f.seg.start, i)), code: false, ownerText: '' };
      heredocs.push(h);
      f.seg.heredocs.push(h);
      pending.push(h);
      i = j + m[0].length;
      continue;
    }
    if (ch === ';' || ch === '&' || ch === '|' || ch === '\n') {
      const pipe = ch === '|' && text[i + 1] !== '|' && text[i - 1] !== '|';
      endSeg(f, i, pipe);
      if (ch === '\n' && pending.length) {
        let pos = i + 1;
        for (const h of pending) {
          h.bodyStart = pos;
          h.terminated = false;
          while (pos <= text.length) {
            let eol = text.indexOf('\n', pos);
            if (eol === -1) eol = text.length;
            let line = text.slice(pos, eol).replace(/\r$/, '');
            if (h.dash) line = line.replace(/^\t+/, '');
            if (line === h.delim) { h.bodyEnd = pos; h.terminated = true; pos = eol + 1; break; }
            pos = eol + 1;
          }
          if (!h.terminated) return null; // unterminated heredoc: unsure
        }
        pending = [];
        f.seg = newSeg(pos);
        i = pos;
        continue;
      }
      i++; continue;
    }
    i++;
  }
  if (stack.length !== 1 || pending.length) return null; // unclosed quote / $( / heredoc
  endSeg(root, text.length, false);

  const remove = [];
  const dataBodies = [];
  for (const h of heredocs) {
    if (h.code || !DATA_HEREDOC_OWNERS.has(h.ownerWord)) continue;
    // The files this heredoc writes, if any, must not be used again (bash x.sh, ./x.sh …).
    const targets = [];
    for (const s of h.segs) {
      const segText = s === h.ownerSeg ? h.ownerText : (s.text || '');
      const redirect = /(?:^|[^<>&\d])>>?\s*["']?([^\s"';&|<>]+)/.exec(segText);
      if (redirect) targets.push(redirect[1]);
      if (s.word === 'tee') {
        targets.push(...segText.replace(/<<-?\s*\S+/g, '').trim().split(/\s+/).slice(1)
          .filter((t) => t && !t.startsWith('-') && !t.startsWith('>')));
      }
    }
    const reused = targets.some((t) => {
      const base = t.replace(/^["']|["']$/g, '').split(/[\\/]/).pop();
      if (!base || base === 'null') return false;
      return segments.some((s) => !h.segs.includes(s) && s.text && s.text.includes(base)
        && !(SAFE_FILE_FOLLOWUPS.has(s.word) && !s.pipedTo));
    });
    if (reused) continue;
    remove.push([h.bodyStart, h.bodyEnd]);
    dataBodies.push(text.slice(h.bodyStart, h.bodyEnd));
  }
  for (const s of segments) {
    if (!SEARCH_TOOLS.has(s.word)) continue;
    if (s.word === 'rg' && /\s--pre\b/.test(s.text)) continue;
    for (const q of s.quotes) if (!q.subst) remove.push([q.s, q.e]);
  }
  remove.sort((a, b) => a[0] - b[0]);
  let scan = '';
  let at = 0;
  for (const [s, e] of remove) {
    if (s < at) continue;
    scan += text.slice(at, s);
    at = e;
  }
  scan += text.slice(at);
  return { scan, dataBodies };
}

/** The Bash text the destructive rules scan. Falls back to the raw command when unsure. */
function commandView(command) {
  let view = null;
  try { view = lexCommand(command); } catch { view = null; }
  if (!view) view = { scan: command, dataBodies: [] };
  // Join line continuations so `curl … \` + newline + `-H "Authorization: …"` is one line.
  return { scan: view.scan.replace(/\\\r?\n/g, ' '), dataBodies: view.dataBodies };
}

runHook('safety-check', async () => {
  const input = await readStdinJson();
  const toolName = input.tool_name || '';
  const toolInput = input.tool_input || {};

  if (toolName === 'Bash') {
    const command = toolInput.command || '';
    if (RM_ACR_ALLOWLIST.test(command)) return ok();
    const view = commandView(command);
    // A heredoc written to a file is a Write by another name: it gets the Write rules.
    for (const body of view.dataBodies) checkWriteContent(body);
    checkRules(BASH_RULES, view.scan, command);
    return ok();
  }

  if (toolName === 'Write') {
    const filePath = toolInput.file_path || '';
    if (isDocsPath(filePath)) return ok();
    checkWriteContent(toolInput.content || '');
    return ok();
  }

  // Non-Bash / non-Write tools (Read, Edit, Glob, Grep, etc.) are out of scope.
  return ok();
});

