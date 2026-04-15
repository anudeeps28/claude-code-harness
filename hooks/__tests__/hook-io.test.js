// Tests for the runHook envelope: timeout (fail-open), exception handling,
// metrics emission, and log rotation. Each test spawns a tiny throwaway
// hook script that exercises one behaviour of hook-io.js.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK_IO = path.join(__dirname, '..', 'lib', 'hook-io.js').replace(/\\/g, '/');

function makeWorkRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-io-'));
  fs.mkdirSync(path.join(dir, 'tasks'));
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// Spawn a temporary node script that loads hook-io and calls a body.
function runScript(body, { workRoot, stdin = '{}', timeoutMs = 8000 } = {}) {
  const scriptPath = path.join(os.tmpdir(), `hook-io-script-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.js`);
  const src = `const hi = require(${JSON.stringify(HOOK_IO)});\n${body}\n`;
  fs.writeFileSync(scriptPath, src);
  try {
    const result = spawnSync(
      process.execPath,
      [scriptPath],
      {
        input: stdin,
        encoding: 'utf8',
        timeout: timeoutMs,
        env: workRoot ? { ...process.env, CLAUDE_HARNESS_WORK_ROOT: workRoot } : { ...process.env, CLAUDE_HARNESS_WORK_ROOT: '' },
      }
    );
    return { exitCode: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
  } finally {
    try { fs.unlinkSync(scriptPath); } catch { /* ignore */ }
  }
}

// ── runHook envelope ──────────────────────────────────────────────────

test('runHook_BodyCallsOk_Exit0', () => {
  const r = runScript(`hi.runHook('test-hook', async () => { hi.ok(); });`);
  assert.equal(r.exitCode, 0);
});

test('runHook_BodyThrows_FailOpenExit0', () => {
  const r = runScript(`hi.runHook('test-hook', async () => { throw new Error('boom'); });`);
  assert.equal(r.exitCode, 0, `expected fail-open exit 0, got ${r.exitCode}`);
  assert.match(r.stderr, /hook_exception/);
  assert.match(r.stderr, /boom/);
});

test('runHook_BodyTimesOut_FailOpenExit0', () => {
  const r = runScript(
    `hi.runHook('test-hook', async () => { await new Promise(r => setTimeout(r, 30000)); });`,
    { timeoutMs: 8000 }
  );
  assert.equal(r.exitCode, 0, `expected fail-open exit 0, got ${r.exitCode}`);
  assert.match(r.stderr, /hook_timeout/);
});

test('runHook_BodyCallsDeny_Exit2WithReason', () => {
  const r = runScript(`hi.runHook('test-hook', async () => { hi.deny('not allowed', 'test-rule'); });`);
  assert.equal(r.exitCode, 2);
  const out = JSON.parse(r.stdout);
  assert.equal(out.decision, 'deny');
  assert.equal(out.reason, 'not allowed');
});

test('runHook_UnhandledRejection_FailOpenExit0', () => {
  const r = runScript(
    `hi.runHook('test-hook', async () => { Promise.reject(new Error('rej')); await new Promise(r => setTimeout(r, 200)); });`
  );
  assert.equal(r.exitCode, 0);
  assert.match(r.stderr, /unhandled_rejection|hook_exception/);
});

// ── readStdinJson error logging ──────────────────────────────────────

test('readStdinJson_MalformedJson_LogsToStderrSettlesEmpty', () => {
  const r = runScript(
    `hi.runHook('test-hook', async () => { const data = await hi.readStdinJson(); console.log(JSON.stringify(data)); hi.ok(); });`,
    { stdin: '{not json' }
  );
  assert.equal(r.exitCode, 0);
  assert.match(r.stderr, /stdin_parse_failed/);
  assert.equal(r.stdout.trim(), '{}');
});

// ── Metrics emission ─────────────────────────────────────────────────

test('recordMetric_OnOk_AppendsAllowLine', () => {
  const workRoot = makeWorkRoot();
  try {
    const r = runScript(`hi.runHook('test-hook', async () => { hi.ok(); });`, { workRoot });
    assert.equal(r.exitCode, 0);
    const metricsPath = path.join(workRoot, 'tasks', 'metrics.jsonl');
    assert.ok(fs.existsSync(metricsPath), 'metrics.jsonl should exist');
    const lines = fs.readFileSync(metricsPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1);
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.hook, 'test-hook');
    assert.equal(entry.decision, 'allow');
    assert.equal(typeof entry.duration_ms, 'number');
    assert.ok(entry.ts);
  } finally { cleanup(workRoot); }
});

test('recordMetric_OnDeny_AppendsDenyLineWithRule', () => {
  const workRoot = makeWorkRoot();
  try {
    const r = runScript(`hi.runHook('test-hook', async () => { hi.deny('blocked', 'demo-rule'); });`, { workRoot });
    assert.equal(r.exitCode, 2);
    const lines = fs.readFileSync(path.join(workRoot, 'tasks', 'metrics.jsonl'), 'utf8').trim().split('\n');
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.decision, 'deny');
    assert.equal(entry.rule, 'demo-rule');
  } finally { cleanup(workRoot); }
});

test('recordMetric_OnTimeout_AppendsTimeoutLine', () => {
  const workRoot = makeWorkRoot();
  try {
    const r = runScript(
      `hi.runHook('slow', async () => { await new Promise(r => setTimeout(r, 30000)); });`,
      { workRoot, timeoutMs: 8000 }
    );
    assert.equal(r.exitCode, 0);
    const metricsPath = path.join(workRoot, 'tasks', 'metrics.jsonl');
    assert.ok(fs.existsSync(metricsPath));
    const entry = JSON.parse(fs.readFileSync(metricsPath, 'utf8').trim().split('\n').pop());
    assert.equal(entry.decision, 'timeout');
  } finally { cleanup(workRoot); }
});

test('recordMetric_NoWorkRoot_SkipsSilently', () => {
  // No workRoot env var → recordMetric should noop without throwing.
  const r = runScript(`hi.runHook('test-hook', async () => { hi.ok(); });`);
  assert.equal(r.exitCode, 0);
});

// ── appendWithRotation ───────────────────────────────────────────────

test('appendWithRotation_BelowThreshold_AppendsInPlace', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rot-'));
  try {
    const file = path.join(dir, 'log.jsonl');
    const body = `hi.appendWithRotation(${JSON.stringify(file.replace(/\\/g, '/'))}, JSON.stringify({a:1}), {maxBytes: 1024});`;
    runScript(body);
    runScript(body);
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
    assert.deepEqual(JSON.parse(lines[0]), { a: 1 });
  } finally { cleanup(dir); }
});

test('appendWithRotation_AboveThreshold_RotatesAndStartsNew', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rot-'));
  try {
    const file = path.join(dir, 'log.jsonl');
    // Pre-fill the log over the 1KB threshold.
    fs.writeFileSync(file, 'x'.repeat(2000));
    const body = `hi.appendWithRotation(${JSON.stringify(file.replace(/\\/g, '/'))}, JSON.stringify({a:1}), {maxBytes: 1024, keep: 3});`;
    runScript(body);
    // After rotation: original file should be small (just our new line).
    const newSize = fs.statSync(file).size;
    assert.ok(newSize < 100, `expected new file < 100 bytes, got ${newSize}`);
    // The rotated file (or its .gz) should exist alongside.
    const siblings = fs.readdirSync(dir).filter(f => f.startsWith('log.') && f !== 'log.jsonl');
    assert.ok(siblings.length >= 1, `expected rotated sibling, found: ${siblings.join(',')}`);
  } finally { cleanup(dir); }
});

test('appendWithRotation_PrunesBeyondKeep', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rot-'));
  try {
    const file = path.join(dir, 'log.jsonl');
    // Drop 6 fake rotated files with descending mtimes so the prune order is deterministic.
    const now = Date.now();
    for (let i = 0; i < 6; i++) {
      const p = path.join(dir, `log.fake-${i}.jsonl.gz`);
      fs.writeFileSync(p, 'gz');
      fs.utimesSync(p, new Date((now - i * 60_000) / 1000), new Date((now - i * 60_000) / 1000));
    }
    fs.writeFileSync(file, 'x'.repeat(2000));
    const body = `hi.appendWithRotation(${JSON.stringify(file.replace(/\\/g, '/'))}, JSON.stringify({a:1}), {maxBytes: 1024, keep: 2});`;
    runScript(body);
    const remaining = fs.readdirSync(dir).filter(f => f.startsWith('log.') && f !== 'log.jsonl');
    // After rotation: at most `keep` historical files. (The rotation we triggered
    // creates one new sibling; pruning keeps the newest 2 across all siblings.)
    assert.ok(remaining.length <= 3, `expected <=3 remaining, got ${remaining.length}: ${remaining.join(',')}`);
  } finally { cleanup(dir); }
});
