// Tracker adapter conformance suite.
//
// Validates that each tracker adapter (ADO, GitHub) honours the contract
// documented in trackers/README.md. New adapters (Linear, Jira, ...) must
// pass every test in this file before they're considered conformant.
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

function readGolden(adapter, name) {
  return fs.readFileSync(path.join(GOLDEN_DIR, adapter, name), 'utf8');
}

function normalize(s) {
  return s.replace(/\r\n/g, '\n').trim();
}

// ── Argument validation contract ──────────────────────────────────────

describe('arg-validation', () => {
  for (const adapter of ['ado', 'github']) {
    test(`${adapter}_GetIssue_NoArg_Exits1WithJsonError`, () => {
      const r = runScript(adapter, 'get-issue.sh', []);
      assert.equal(r.exitCode, 1);
      assert.match(r.stderr, /\{"error":/);
    });

    test(`${adapter}_GetPrThreads_NoArg_Exits1WithJsonError`, () => {
      const r = runScript(adapter, 'get-pr-review-threads.sh', []);
      assert.equal(r.exitCode, 1);
      assert.match(r.stderr, /\{"error":/);
    });

    test(`${adapter}_ReplyPrThread_MissingArgs_Exits1`, () => {
      const r = runScript(adapter, 'reply-pr-thread.sh', ['1']);
      assert.equal(r.exitCode, 1);
    });
  }
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

  test('github_GetPrReviewThreads_HappyPath_ReturnsJsonArrayWithRequiredKeys', () => {
    const r = runScript('github', 'get-pr-review-threads.sh', ['42']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.ok(Array.isArray(parsed), 'expected JSON array');
    for (const t of parsed) {
      assert.ok('id' in t, 'thread missing id');
      assert.ok('file' in t, 'thread missing file');
      assert.ok('line' in t, 'thread missing line');
      assert.ok('content' in t, 'thread missing content');
      assert.ok('author' in t, 'thread missing author');
      assert.ok('threadId' in t, 'GitHub threads must include threadId for resolve');
    }
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
});

// ── Tracker README + lib presence ────────────────────────────────────

describe('contract-presence', () => {
  for (const adapter of ['ado', 'github']) {
    test(`${adapter}_HasAllSixContractScripts`, () => {
      const required = [
        'get-issue.sh',
        'get-issue-children.sh',
        'get-pr-review-threads.sh',
        'reply-pr-thread.sh',
        'resolve-pr-thread.sh',
        'get-sprint-issues.sh',
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
        const txt = fs.readFileSync(path.join(dir, f), 'utf8');
        assert.match(txt, /source.*lib\/retry\.sh/, `${f} must source retry.sh`);
        assert.match(txt, /source.*lib\/auth-check\.sh/, `${f} must source auth-check.sh`);
      }
    });
  }
});
