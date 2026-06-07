'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const INSTALL_JS = path.resolve(__dirname, '..', 'install.js');
const INSTALL_SH = path.resolve(__dirname, '..', 'install.sh');

const ENTERPRISE_ONLY_AGENTS = [
  'story-understand-agent.md',
  'story-plan-agent.md',
  'story-executor-agent.md',
  'story-pr-agent.md',
  'sprint-plan-gap-analyzer.md',
  'sprint-plan-docs-reader.md',
  'sprint-plan-tracker-reader.md',
];

function makeTempProject() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
  fs.mkdirSync(path.join(dir, '.git'), { recursive: true });
  return dir;
}

function runInstallJs(extraArgs, opts = {}) {
  return execFileSync('node', [INSTALL_JS, ...extraArgs], {
    timeout: 15_000,
    stdio: ['pipe', 'pipe', 'pipe'],
    input: '',
    ...opts,
  });
}

function runInstallSh(extraArgs, opts = {}) {
  return execFileSync('bash', [INSTALL_SH, ...extraArgs], {
    timeout: 15_000,
    stdio: ['pipe', 'pipe', 'pipe'],
    input: '',
    ...opts,
  });
}

// ── install.js ──────────────────────────────────────────────────────────────

test('install.js --yes without --global or --project exits with error', () => {
  assert.throws(
    () => runInstallJs(['--yes']),
    (err) => {
      assert.strictEqual(err.status, 1);
      assert.ok(err.stderr.toString().includes('--yes requires --global or --project'));
      return true;
    },
  );
});

test('install.js --yes --global --dry-run completes without hanging', () => {
  const out = runInstallJs(['--yes', '--global', '--dry-run']).toString();
  assert.ok(out.includes('DRY RUN'), 'should print dry run summary');
  assert.ok(out.includes('solo'), 'should default to solo pack');
});

test('install.js --yes --project installs without enterprise agents', () => {
  const dir = makeTempProject();
  try {
    runInstallJs(['--yes', '--project', dir]);
    const agents = fs.readdirSync(path.join(dir, '.claude', 'agents'));
    for (const enterprise of ENTERPRISE_ONLY_AGENTS) {
      assert.ok(
        !agents.includes(enterprise),
        `enterprise agent ${enterprise} should not be installed in solo mode`,
      );
    }
    assert.ok(agents.length > 0, 'should install some agents');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── install.sh ──────────────────────────────────────────────────────────────

test('install.sh --yes without --global or --project exits with error', () => {
  assert.throws(
    () => runInstallSh(['--yes']),
    (err) => {
      assert.strictEqual(err.status, 1);
      assert.ok(err.stderr.toString().includes('--yes requires --global or --project'));
      return true;
    },
  );
});

test('install.sh --yes --global --dry-run completes without hanging', () => {
  const out = runInstallSh(['--yes', '--global', '--dry-run']).toString();
  assert.ok(out.includes('DRY RUN'), 'should print dry run summary');
  assert.ok(out.includes('solo'), 'should default to solo pack');
});

test('install.sh --yes --project installs without enterprise agents', () => {
  const dir = makeTempProject();
  try {
    runInstallSh(['--yes', '--project', dir]);
    const agents = fs.readdirSync(path.join(dir, '.claude', 'agents'));
    for (const enterprise of ENTERPRISE_ONLY_AGENTS) {
      assert.ok(
        !agents.includes(enterprise),
        `enterprise agent ${enterprise} should not be installed in solo mode`,
      );
    }
    assert.ok(agents.length > 0, 'should install some agents');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
