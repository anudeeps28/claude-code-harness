const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', 'todo-render-trigger.js');

function makeFixture({ tracker = 'local' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-render-'));
  const claudeDir = path.join(dir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, '.harness-manifest.json'),
    JSON.stringify({ tracker })
  );
  return { root: dir };
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
}

function runHook(filePath, { cwd } = {}) {
  const result = spawnSync(
    process.execPath,
    [HOOK],
    {
      input: JSON.stringify({ tool_input: { file_path: filePath } }),
      encoding: 'utf8',
      cwd: cwd || process.cwd(),
      env: { ...process.env },
      timeout: 10000,
    }
  );
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status };
}

test('exits 0 silently for unrelated file path', () => {
  const { root } = makeFixture();
  try {
    const result = runHook('/some/project/src/index.ts', { cwd: root });
    assert.equal(result.exitCode, 0);
  } finally { cleanup(root); }
});

test('exits 0 silently when file is under tasks/issues/ but mode is not local', () => {
  const { root } = makeFixture({ tracker: 'github' });
  try {
    const result = runHook(path.join(root, 'tasks/issues/42.md'), { cwd: root });
    assert.equal(result.exitCode, 0);
  } finally { cleanup(root); }
});

test('exits 0 when file is under tasks/issues/ and mode is local', () => {
  const { root } = makeFixture({ tracker: 'local' });
  try {
    const result = runHook(path.join(root, 'tasks/issues/42.md'), { cwd: root });
    assert.equal(result.exitCode, 0);
  } finally { cleanup(root); }
});

test('exits 0 when no manifest exists (fail-open)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-render-nomanifest-'));
  try {
    const result = runHook(path.join(dir, 'tasks/issues/42.md'), { cwd: dir });
    assert.equal(result.exitCode, 0);
  } finally { cleanup(dir); }
});

test('exits 0 when no file_path in input', () => {
  const { root } = makeFixture();
  try {
    const result = spawnSync(
      process.execPath,
      [HOOK],
      {
        input: JSON.stringify({ tool_input: {} }),
        encoding: 'utf8',
        cwd: root,
        timeout: 10000,
      }
    );
    assert.equal(result.status, 0);
  } finally { cleanup(root); }
});
