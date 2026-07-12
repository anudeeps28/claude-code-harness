// Tracker adapter conformance suite.
//
// Validates that each tracker adapter (ADO, GitHub, Todoist) honours the contract
// documented in trackers/README.md. New adapters (Linear, Jira, local, ...) must
// pass every test in this file before they're considered conformant.
//
// The tracker interface is 8 scripts (D14): 7 task scripts + list-issues.sh.
// PR-review-thread scripts now live in code-platform/ (see WS1).
//
// Mocking strategy: PATH override. The test prepends fixtures/bin/ to PATH
// so the adapter's `az` / `gh` invocations hit our bash stub scripts which
// pattern-match argv and return canned JSON from fixtures/responses/.
//
// Skipped on platforms without bash (e.g. raw Windows cmd). Git Bash on
// Windows works fine — that's where we run today.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ADAPTERS_DIR = path.join(REPO_ROOT, 'trackers');
const FIXTURES_BIN = path.join(__dirname, 'fixtures', 'bin');
const FIXTURES_LOCAL_ISSUES = path.join(__dirname, 'fixtures', 'local-issues');
const GOLDEN_DIR = path.join(__dirname, 'golden');

const HAS_BASH = (() => {
  try {
    const r = spawnSync('bash', ['-c', 'echo ok'], { encoding: 'utf8' });
    return r.status === 0 && r.stdout.trim() === 'ok';
  } catch { return false; }
})();

function describe(name, fn) {
  if (!HAS_BASH) {
    test(`${name} (skipped: bash not available)`, { skip: true }, () => {});
    return;
  }
  fn();
}

// Copy the chosen adapter into a temp dir, sed-replacing placeholders so the
// adapter scripts pass their own pre-flight checks under test.
function prepareAdapter(adapter) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `tracker-${adapter}-`));
  const adapterDir = path.join(tmp, adapter);
  fs.cpSync(path.join(ADAPTERS_DIR, adapter), adapterDir, { recursive: true });
  fs.cpSync(path.join(ADAPTERS_DIR, 'lib'), path.join(tmp, 'lib'), { recursive: true });

  // ADO scripts have a hardcoded ADO_PROJECT="YOUR_ADO_PROJECT" placeholder
  // that the installer rewrites. Do the same for tests.
  if (adapter === 'ado') {
    for (const file of fs.readdirSync(adapterDir)) {
      const p = path.join(adapterDir, file);
      let txt = fs.readFileSync(p, 'utf8');
      txt = txt.replace(/ADO_PROJECT="YOUR_ADO_PROJECT"/g, 'ADO_PROJECT="TEST_PROJ"');
      txt = txt.replace(/ADO_REPO="YOUR_ADO_REPO"/g, 'ADO_REPO="test-repo"');
      txt = txt.replace(/ADO_ORG_PATH="[^"]*"/g, 'ADO_ORG_PATH="https://dev.azure.com/test-org"');
      fs.writeFileSync(p, txt);
    }
  }
  return { root: tmp, adapterDir };
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function runScript(adapter, script, args, { fixtureMode, fixtureAuth, retryCounter, retrySucceedAt } = {}) {
  const { root, adapterDir } = prepareAdapter(adapter);
  try {
    // bash always uses ':' as PATH separator, regardless of host OS.
    // path.delimiter is ';' on Windows, which would corrupt PATH for bash.
    const env = {
      ...process.env,
      PATH: `${FIXTURES_BIN}:${process.env.PATH}`,
      RETRY_BACKOFF_1: '0',
      RETRY_BACKOFF_2: '0',
    };
    if (adapter === 'todoist') env.TODOIST_CLI = path.join(FIXTURES_BIN, 'td');
    if (fixtureMode) env.FIXTURE_MODE = fixtureMode;
    if (fixtureAuth) env.FIXTURE_AUTH = fixtureAuth;
    if (retryCounter) {
      env.FIXTURE_RETRY_COUNTER = retryCounter;
      env.FIXTURE_RETRY_SUCCEED_AT = String(retrySucceedAt || 2);
    }
    const result = spawnSync('bash', [path.join(adapterDir, script), ...args], {
      encoding: 'utf8',
      env,
      timeout: 15000,
    });
    return {
      exitCode: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    };
  } finally { cleanup(root); }
}

// Local backend uses a temp tasks/issues/ dir instead of PATH-override mocks.
function prepareLocalAdapter() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-local-'));
  const adapterDir = path.join(tmp, 'local');
  fs.cpSync(path.join(ADAPTERS_DIR, 'local'), adapterDir, { recursive: true });
  fs.cpSync(path.join(ADAPTERS_DIR, 'lib'), path.join(tmp, 'lib'), { recursive: true });

  // Seed fixture tasks/issues/ directory
  const issuesDir = path.join(tmp, 'tasks', 'issues');
  fs.mkdirSync(issuesDir, { recursive: true });
  fs.cpSync(FIXTURES_LOCAL_ISSUES, issuesDir, { recursive: true });

  // Create tasks/ dir for todo.md output
  fs.mkdirSync(path.join(tmp, 'tasks'), { recursive: true });

  return { root: tmp, adapterDir, issuesDir };
}

function runLocalScript(script, args, { issuesDir } = {}) {
  const { root, adapterDir, issuesDir: defaultIssuesDir } = prepareLocalAdapter();
  const effectiveIssuesDir = issuesDir || defaultIssuesDir;
  try {
    const env = {
      ...process.env,
      LOCAL_ISSUES_DIR: effectiveIssuesDir,
      TODO_OUTPUT: path.join(root, 'tasks', 'todo.md'),
      RETRY_BACKOFF_1: '0',
      RETRY_BACKOFF_2: '0',
    };
    const result = spawnSync('bash', [path.join(adapterDir, script), ...args], {
      encoding: 'utf8',
      env,
      cwd: root,
      timeout: 15000,
    });
    return {
      exitCode: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      root,
      issuesDir: effectiveIssuesDir,
    };
  } finally { cleanup(root); }
}

// Like runLocalScript but returns root for inspection before cleanup
function runLocalScriptKeep(script, args) {
  const { root, adapterDir, issuesDir } = prepareLocalAdapter();
  const env = {
    ...process.env,
    LOCAL_ISSUES_DIR: issuesDir,
    TODO_OUTPUT: path.join(root, 'tasks', 'todo.md'),
    RETRY_BACKOFF_1: '0',
    RETRY_BACKOFF_2: '0',
  };
  const result = spawnSync('bash', [path.join(adapterDir, script), ...args], {
    encoding: 'utf8',
    env,
    cwd: root,
    timeout: 15000,
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    root,
    issuesDir,
    adapterDir,
  };
}

function readGolden(adapter, name) {
  return fs.readFileSync(path.join(GOLDEN_DIR, adapter, name), 'utf8');
}

function normalize(s) {
  return s.replace(/\r\n/g, '\n').trim();
}

// ── Argument validation contract ──────────────────────────────────────

describe('arg-validation', () => {
  for (const adapter of ['ado', 'github', 'todoist']) {
    test(`${adapter}_GetIssue_NoArg_Exits1WithJsonError`, () => {
      const r = runScript(adapter, 'get-issue.sh', []);
      assert.equal(r.exitCode, 1);
      assert.match(r.stderr, /\{"error":/);
    });

    test(`${adapter}_CloseIssue_NoArg_Exits1WithJsonError`, () => {
      const r = runScript(adapter, 'close-issue.sh', []);
      assert.equal(r.exitCode, 1);
      assert.match(r.stderr, /\{"error":/);
    });
  }

  test('local_GetIssue_NoArg_Exits1WithJsonError', () => {
    const r = runLocalScript('get-issue.sh', []);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('local_CloseIssue_NoArg_Exits1WithJsonError', () => {
    const r = runLocalScript('close-issue.sh', []);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('local_CreateIssue_NoArg_Exits1WithJsonError', () => {
    const r = runLocalScript('create-issue.sh', []);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('local_AddLabel_NoArgs_Exits1WithJsonError', () => {
    const r = runLocalScript('add-label.sh', []);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('local_RemoveLabel_NoArgs_Exits1WithJsonError', () => {
    const r = runLocalScript('remove-label.sh', []);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('local_GetIssueChildren_NoArg_Exits1WithJsonError', () => {
    const r = runLocalScript('get-issue-children.sh', []);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('local_GetSprintIssues_NoArg_Exits1WithJsonError', () => {
    const r = runLocalScript('get-sprint-issues.sh', []);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });
});

// ── Happy path: stdout contract ──────────────────────────────────────

describe('happy-path-stdout', () => {
  test('ado_GetIssue_HappyPath_MatchesGoldenMarkdown', () => {
    const r = runScript('ado', 'get-issue.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.equal(normalize(r.stdout), normalize(readGolden('ado', 'get-issue.happy.md')));
  });

  test('github_GetIssue_HappyPath_MatchesGoldenMarkdown', () => {
    const r = runScript('github', 'get-issue.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.equal(normalize(r.stdout), normalize(readGolden('github', 'get-issue.happy.md')));
  });

  test('todoist_GetIssue_HappyPath_MatchesGoldenMarkdown', () => {
    const r = runScript('todoist', 'get-issue.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.equal(normalize(r.stdout), normalize(readGolden('todoist', 'get-issue.happy.md')));
  });

  test('github_CloseIssue_HappyPath_ExitsZero', () => {
    const r = runScript('github', 'close-issue.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /Closed issue #1234/);
  });

  test('todoist_CloseIssue_HappyPath_ExitsZero', () => {
    const r = runScript('todoist', 'close-issue.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /Completed task 1234/);
  });

  test('ado_CloseIssue_HappyPath_ExitsZero', () => {
    const r = runScript('ado', 'close-issue.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /Closed work item #1234/);
  });

  test('local_GetIssue_HappyPath_MatchesGoldenMarkdown', () => {
    const r = runLocalScript('get-issue.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.equal(normalize(r.stdout), normalize(readGolden('local', 'get-issue.happy.md')));
  });

  test('local_CloseIssue_HappyPath_ExitsZero', () => {
    const r = runLocalScript('close-issue.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /Closed task #1234/);
  });

  test('local_CreateIssue_HappyPath_CreatesFileAndPrintsId', () => {
    const result = runLocalScriptKeep('create-issue.sh', ['New task', 'A body', 'feature']);
    try {
      assert.equal(result.exitCode, 0, `non-zero exit: ${result.stderr}`);
      assert.match(result.stdout, /1237/);
      const newFile = path.join(result.issuesDir, '1237.md');
      assert.ok(fs.existsSync(newFile), 'Expected 1237.md to be created');
      const content = fs.readFileSync(newFile, 'utf8');
      assert.match(content, /title: New task/);
      assert.match(content, /state: open/);
      assert.match(content, /labels: \[feature\]/);
    } finally { cleanup(result.root); }
  });

  test('local_ListIssues_HappyPath_ReturnsOpenTasksJSON', () => {
    const r = runLocalScript('list-issues.sh', []);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    const items = JSON.parse(r.stdout);
    assert.ok(Array.isArray(items));
    assert.equal(items.length, 2);
    assert.equal(items[0].id, 1234);
    assert.equal(items[0].state, 'open');
    assert.equal(items[1].id, 1235);
  });

  test('local_GetIssueChildren_HappyPath_ReturnsChildren', () => {
    const r = runLocalScript('get-issue-children.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /Child Tasks for Task #1234/);
    assert.match(r.stdout, /#1235/);
  });

  test('local_AddLabel_HappyPath_AddsLabel', () => {
    const result = runLocalScriptKeep('add-label.sh', ['1234', 'urgent']);
    try {
      assert.equal(result.exitCode, 0, `non-zero exit: ${result.stderr}`);
      assert.match(result.stdout, /Added label/);
      const content = fs.readFileSync(path.join(result.issuesDir, '1234.md'), 'utf8');
      assert.match(content, /urgent/);
    } finally { cleanup(result.root); }
  });

  test('local_RemoveLabel_HappyPath_RemovesLabel', () => {
    const result = runLocalScriptKeep('remove-label.sh', ['1234', 'feature']);
    try {
      assert.equal(result.exitCode, 0, `non-zero exit: ${result.stderr}`);
      assert.match(result.stdout, /Removed label/);
      const content = fs.readFileSync(path.join(result.issuesDir, '1234.md'), 'utf8');
      assert.ok(!content.match(/labels:.*feature/));
    } finally { cleanup(result.root); }
  });
});

// ── Failure-mode contract ────────────────────────────────────────────

describe('failure-modes', () => {
  test('ado_GetIssue_NotFound_Exits1WithJsonStderr', () => {
    const r = runScript('ado', 'get-issue.sh', ['9999']);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('github_GetIssue_NotFound_Exits1WithJsonStderr', () => {
    const r = runScript('github', 'get-issue.sh', ['9999']);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('ado_GetIssue_AuthExpired_Exits1WithAuthError', () => {
    const r = runScript('ado', 'get-issue.sh', ['1234'], { fixtureAuth: 'expired' });
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /az login|auth/i);
  });

  test('github_GetIssue_AuthExpired_Exits1WithAuthError', () => {
    const r = runScript('github', 'get-issue.sh', ['1234'], { fixtureAuth: 'expired' });
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /gh auth|expired/i);
  });

  test('todoist_GetIssue_NotFound_Exits1WithJsonStderr', () => {
    const r = runScript('todoist', 'get-issue.sh', ['9999']);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('todoist_GetIssue_AuthExpired_Exits1WithAuthError', () => {
    const r = runScript('todoist', 'get-issue.sh', ['1234'], { fixtureAuth: 'expired' });
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /auth/i);
  });

  test('local_GetIssue_NotFound_Exits1WithJsonStderr', () => {
    const r = runLocalScript('get-issue.sh', ['9999']);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('local_CloseIssue_AlreadyClosed_Exits1WithError', () => {
    const r = runLocalScript('close-issue.sh', ['1236']);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /already closed/);
  });

  test('local_GetIssue_MissingDir_Exits1WithAuthError', () => {
    // Run with a non-existent issues dir to trigger check_auth_local failure
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-local-nodir-'));
    const adapterDir = path.join(tmp, 'local');
    fs.cpSync(path.join(ADAPTERS_DIR, 'local'), adapterDir, { recursive: true });
    fs.cpSync(path.join(ADAPTERS_DIR, 'lib'), path.join(tmp, 'lib'), { recursive: true });
    try {
      const env = {
        ...process.env,
        LOCAL_ISSUES_DIR: path.join(tmp, 'nonexistent'),
        RETRY_BACKOFF_1: '0',
        RETRY_BACKOFF_2: '0',
      };
      const result = spawnSync('bash', [path.join(adapterDir, 'get-issue.sh'), '1234'], {
        encoding: 'utf8', env, cwd: tmp, timeout: 15000,
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /not found/i);
    } finally { cleanup(tmp); }
  });
});

// ── Retry behaviour ──────────────────────────────────────────────────

describe('retry', () => {
  test('ado_GetIssue_TransientFailure_RetriesAndSucceeds', () => {
    const counter = path.join(os.tmpdir(), `retry-counter-${process.pid}-${Date.now()}`);
    try {
      const r = runScript('ado', 'get-issue.sh', ['1234'], {
        retryCounter: counter,
        retrySucceedAt: 2,
      });
      // retry.sh tries 3 times with backoff; succeeds on attempt 2.
      assert.equal(r.exitCode, 0, `expected success after retry, got ${r.exitCode}: ${r.stderr}`);
      // Sanity: stub recorded 2 invocations of the work-item call (the auth
      // calls run before the retry counter starts incrementing relative to the
      // adapter call, but at least 2 total attempts must have happened).
      const count = parseInt(fs.readFileSync(counter, 'utf8'), 10);
      assert.ok(count >= 2, `expected >=2 stub invocations, got ${count}`);
    } finally {
      try { fs.unlinkSync(counter); } catch { /* ignore */ }
    }
  });

  test('github_GetIssue_TransientFailure_RetriesAndSucceeds', () => {
    const counter = path.join(os.tmpdir(), `retry-counter-${process.pid}-${Date.now()}`);
    try {
      const r = runScript('github', 'get-issue.sh', ['1234'], {
        retryCounter: counter,
        retrySucceedAt: 2,
      });
      assert.equal(r.exitCode, 0, `expected success after retry: ${r.stderr}`);
      const count = parseInt(fs.readFileSync(counter, 'utf8'), 10);
      assert.ok(count >= 2);
    } finally {
      try { fs.unlinkSync(counter); } catch { /* ignore */ }
    }
  });

  test('todoist_GetIssue_TransientFailure_RetriesAndSucceeds', () => {
    const counter = path.join(os.tmpdir(), `retry-counter-${process.pid}-${Date.now()}`);
    try {
      const r = runScript('todoist', 'get-issue.sh', ['1234'], {
        retryCounter: counter,
        retrySucceedAt: 2,
      });
      assert.equal(r.exitCode, 0, `expected success after retry: ${r.stderr}`);
      const count = parseInt(fs.readFileSync(counter, 'utf8'), 10);
      assert.ok(count >= 2);
    } finally {
      try { fs.unlinkSync(counter); } catch { /* ignore */ }
    }
  });
});

// ── Contract presence (8 task scripts, D14) ─────────────────────────

describe('contract-presence', () => {
  for (const adapter of ['ado', 'github', 'todoist', 'local']) {
    test(`${adapter}_HasAllContractScripts`, () => {
      const required = [
        'get-issue.sh',
        'get-issue-children.sh',
        'get-sprint-issues.sh',
        'create-issue.sh',
        'add-label.sh',
        'remove-label.sh',
        'close-issue.sh',
        'list-issues.sh',
      ];
      for (const f of required) {
        assert.ok(
          fs.existsSync(path.join(ADAPTERS_DIR, adapter, f)),
          `${adapter} missing ${f}`
        );
      }
    });

    test(`${adapter}_AllScriptsSourceSharedLibs`, () => {
      const dir = path.join(ADAPTERS_DIR, adapter);
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.sh')) continue;
        const txt = fs.readFileSync(path.join(dir, f), 'utf8');
        assert.match(txt, /source.*lib\/retry\.sh/, `${f} must source retry.sh`);
        assert.match(txt, /source.*lib\/auth-check\.sh/, `${f} must source auth-check.sh`);
      }
    });
  }
});
