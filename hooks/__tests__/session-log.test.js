const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', 'session-log.js');

function makeWorkRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-log-'));
  fs.mkdirSync(path.join(dir, 'tasks'));
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function runSessionLog(workRoot, payload = {}) {
  return spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ session_id: 'sess-test', matcher: 'unit-test', ...payload }),
    encoding: 'utf8',
    cwd: workRoot,
    env: { ...process.env, CLAUDE_HARNESS_WORK_ROOT: workRoot },
  });
}

test('session-log_AppendsJsonlEntry_OnFreshFile', () => {
  const workRoot = makeWorkRoot();
  try {
    const r = runSessionLog(workRoot);
    assert.equal(r.status, 0);
    const logFile = path.join(workRoot, 'tasks', 'sessions.jsonl');
    assert.ok(fs.existsSync(logFile));
    const entry = JSON.parse(fs.readFileSync(logFile, 'utf8').trim());
    assert.equal(entry.session_id, 'sess-test');
    assert.equal(entry.source, 'unit-test');
    assert.ok(entry.timestamp);
  } finally { cleanup(workRoot); }
});

test('session-log_AppendsToExistingFile_PreservesPriorEntries', () => {
  const workRoot = makeWorkRoot();
  try {
    const logFile = path.join(workRoot, 'tasks', 'sessions.jsonl');
    fs.writeFileSync(logFile, '{"prior":true}\n');
    runSessionLog(workRoot);
    const lines = fs.readFileSync(logFile, 'utf8').trim().split('\n');
    assert.equal(lines.length, 2);
    assert.deepEqual(JSON.parse(lines[0]), { prior: true });
  } finally { cleanup(workRoot); }
});

test('session-log_RotatesWhenFileExceeds10MB', { timeout: 30000 }, () => {
  const workRoot = makeWorkRoot();
  try {
    const logFile = path.join(workRoot, 'tasks', 'sessions.jsonl');
    // Write a 10.5MB sessions.jsonl to force rotation on next append.
    const chunk = '{"oversized":true}\n'.repeat(Math.ceil(10.5 * 1024 * 1024 / 19));
    fs.writeFileSync(logFile, chunk);
    assert.ok(fs.statSync(logFile).size > 10 * 1024 * 1024);

    const r = runSessionLog(workRoot);
    assert.equal(r.status, 0);

    // After rotation: original file should be small (just the new line).
    const newSize = fs.statSync(logFile).size;
    assert.ok(newSize < 1024, `expected post-rotation file < 1KB, got ${newSize}`);

    // A rotated sibling (.jsonl or .jsonl.gz) should appear within ~3s.
    const start = Date.now();
    let siblings = [];
    while (Date.now() - start < 5000) {
      siblings = fs.readdirSync(path.join(workRoot, 'tasks'))
        .filter(f => f.startsWith('sessions.') && f !== 'sessions.jsonl');
      if (siblings.length >= 1) break;
      // Spin briefly without sleeping in test code.
      const wait = spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},150)'], { timeout: 500 });
      void wait;
    }
    assert.ok(siblings.length >= 1, `expected rotated sibling, found: ${siblings.join(',')}`);
  } finally { cleanup(workRoot); }
});
