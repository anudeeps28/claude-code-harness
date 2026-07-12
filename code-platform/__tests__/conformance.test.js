// Code-platform adapter conformance suite.
//
// Validates that each code-platform adapter (github, azure-repos, none) honours
// the 3-script interface defined in code-platform/README.md:
//   get-pr-review-threads.sh, reply-pr-thread.sh, resolve-pr-thread.sh
//
// The `none` backend must exit non-zero with a helpful message (D16: loud failure).
//
// Mocking strategy: same PATH-override approach as trackers/__tests__/conformance.test.js.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const CODE_PLATFORM_DIR = path.join(REPO_ROOT, 'code-platform');
const FIXTURES_BIN = path.join(REPO_ROOT, 'trackers', '__tests__', 'fixtures', 'bin');

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

function prepareAdapter(adapter) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `code-platform-${adapter}-`));
  const adapterDir = path.join(tmp, adapter);
  fs.cpSync(path.join(CODE_PLATFORM_DIR, adapter), adapterDir, { recursive: true });
  fs.cpSync(path.join(CODE_PLATFORM_DIR, 'lib'), path.join(tmp, 'lib'), { recursive: true });

  if (adapter === 'azure-repos') {
    for (const file of fs.readdirSync(adapterDir)) {
      const p = path.join(adapterDir, file);
      let txt = fs.readFileSync(p, 'utf8');
      txt = txt.replace(/ADO_PROJECT="YOUR_ADO_PROJECT"/g, 'ADO_PROJECT="TEST_PROJ"');
      txt = txt.replace(/ADO_REPO="YOUR_ADO_REPO"/g, 'ADO_REPO="test-repo"');
      fs.writeFileSync(p, txt);
    }
  }
  return { root: tmp, adapterDir };
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function runScript(adapter, script, args, { fixtureMode, fixtureAuth } = {}) {
  const { root, adapterDir } = prepareAdapter(adapter);
  try {
    const env = {
      ...process.env,
      PATH: `${FIXTURES_BIN}:${process.env.PATH}`,
      RETRY_BACKOFF_1: '0',
      RETRY_BACKOFF_2: '0',
    };
    if (fixtureMode) env.FIXTURE_MODE = fixtureMode;
    if (fixtureAuth) env.FIXTURE_AUTH = fixtureAuth;
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

// ── Contract presence ────────────────────────────────────────────────

describe('code-platform-contract-presence', () => {
  const CONTRACT_SCRIPTS = [
    'get-pr-review-threads.sh',
    'reply-pr-thread.sh',
    'resolve-pr-thread.sh',
  ];

  for (const adapter of ['github', 'azure-repos', 'none']) {
    test(`${adapter}_HasAllContractScripts`, () => {
      for (const f of CONTRACT_SCRIPTS) {
        assert.ok(
          fs.existsSync(path.join(CODE_PLATFORM_DIR, adapter, f)),
          `${adapter} missing ${f}`
        );
      }
    });

    test(`${adapter}_AllScriptsSourceSharedLibs`, () => {
      const dir = path.join(CODE_PLATFORM_DIR, adapter);
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.sh')) continue;
        const txt = fs.readFileSync(path.join(dir, f), 'utf8');
        assert.match(txt, /source.*lib\/retry\.sh/, `${f} must source retry.sh`);
        assert.match(txt, /source.*lib\/auth-check\.sh/, `${f} must source auth-check.sh`);
      }
    });
  }
});

// ── Arg validation ───────────────────────────────────────────────────

describe('code-platform-arg-validation', () => {
  for (const adapter of ['github', 'azure-repos']) {
    test(`${adapter}_GetPrThreads_NoArg_Exits1WithJsonError`, () => {
      const r = runScript(adapter, 'get-pr-review-threads.sh', []);
      assert.equal(r.exitCode, 1);
      assert.match(r.stderr, /\{"error":/);
    });

    test(`${adapter}_ReplyPrThread_MissingArgs_Exits1`, () => {
      const r = runScript(adapter, 'reply-pr-thread.sh', ['1']);
      assert.equal(r.exitCode, 1);
    });

    test(`${adapter}_ResolvePrThread_MissingArgs_Exits1`, () => {
      const r = runScript(adapter, 'resolve-pr-thread.sh', ['1']);
      assert.equal(r.exitCode, 1);
    });
  }
});

// ── `none` backend: loud failure (D16) ──────────────────────────────

describe('code-platform-none-loud-failure', () => {
  const CONTRACT_SCRIPTS = [
    'get-pr-review-threads.sh',
    'reply-pr-thread.sh',
    'resolve-pr-thread.sh',
  ];

  for (const script of CONTRACT_SCRIPTS) {
    test(`none_${script}_ExitsNonZeroWithHelpfulMessage`, () => {
      const r = runScript('none', script, ['42', 'thread-1', 'text']);
      assert.notEqual(r.exitCode, 0, `${script} must exit non-zero`);
      assert.match(r.stderr, /No code platform configured/i,
        `${script} must print a helpful error about no code platform`);
      assert.match(r.stderr, /Re-run the installer/i,
        `${script} must suggest re-running the installer`);
    });
  }
});

// ── GitHub happy-path ────────────────────────────────────────────────

describe('code-platform-github-happy-path', () => {
  test('github_GetPrReviewThreads_HappyPath_ReturnsJsonArrayWithRequiredKeys', () => {
    const r = runScript('github', 'get-pr-review-threads.sh', ['42']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.ok(Array.isArray(parsed), 'expected JSON array');
    for (const t of parsed) {
      assert.ok('id' in t, 'thread missing id');
      assert.ok('threadId' in t, 'thread missing threadId');
      assert.ok('file' in t, 'thread missing file');
      assert.ok('line' in t, 'thread missing line');
      assert.ok('content' in t, 'thread missing content');
      assert.ok('author' in t, 'thread missing author');
    }
  });
});
