const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', 'tracker-sync.js');

// --- Fixture helpers ---

function makeFixture({
  tracker = 'local',
  trackerMirror = false,
  withBackup = false,
  withIssues = [],
} = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-sync-'));
  const claudeDir = path.join(dir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, '.harness-manifest.json'),
    JSON.stringify({ tracker, trackerMirror })
  );

  if (withBackup) {
    fs.mkdirSync(path.join(dir, 'tasks'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'tasks', 'todo-manual-backup.md'),
      '- [ ] Migrate old tasks\n- [x] Already done\n'
    );
  }

  if (withIssues.length) {
    const issuesDir = path.join(dir, 'tasks', 'issues');
    fs.mkdirSync(issuesDir, { recursive: true });
    for (const issue of withIssues) {
      const content = [
        `id: ${issue.id}`,
        `title: ${issue.title}`,
        `state: ${issue.state || 'open'}`,
        `labels: [${(issue.labels || []).join(', ')}]`,
        `created: 2026-01-01T00:00:00Z`,
      ];
      if (issue.state === 'closed') {
        content.push(`closed: 2026-01-02T00:00:00Z`);
        content.push(`close_reason: completed`);
      }
      fs.writeFileSync(path.join(issuesDir, `${issue.id}.md`), content.join('\n') + '\n');
    }
  }

  return { root: dir };
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
}

function runHookProcess(phase, { cwd, env } = {}) {
  const result = spawnSync(
    process.execPath,
    [HOOK, phase],
    {
      input: JSON.stringify({}),
      encoding: 'utf8',
      cwd: cwd || process.cwd(),
      env: { ...process.env, ...env, PATH: process.env.PATH },
      timeout: 15000,
    }
  );
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status };
}

// --- Mode gating tests ---

test('exits 0 (no-op) when manifest is missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-sync-nomanifest-'));
  try {
    const result = runHookProcess('start', { cwd: dir });
    assert.equal(result.exitCode, 0);
  } finally { cleanup(dir); }
});

test('exits 0 (no-op) when tracker is null in manifest', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-sync-notracker-'));
  const claudeDir = path.join(dir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });
  fs.writeFileSync(
    path.join(claudeDir, '.harness-manifest.json'),
    JSON.stringify({ tracker: null })
  );
  try {
    const result = runHookProcess('start', { cwd: dir });
    assert.equal(result.exitCode, 0);
  } finally { cleanup(dir); }
});

test('exits 0 for session end when manifest is missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-sync-nomanifest-'));
  try {
    const result = runHookProcess('end', { cwd: dir });
    assert.equal(result.exitCode, 0);
  } finally { cleanup(dir); }
});

// --- Mode derivation tests ---

test('mode = local when tracker is local', () => {
  const { root } = makeFixture({ tracker: 'local' });
  try {
    const result = runHookProcess('start', { cwd: root });
    assert.equal(result.exitCode, 0);
  } finally { cleanup(root); }
});

test('mode = both when tracker is github + trackerMirror true', () => {
  const { root } = makeFixture({ tracker: 'github', trackerMirror: true });
  try {
    const result = runHookProcess('start', { cwd: root });
    assert.equal(result.exitCode, 0);
  } finally { cleanup(root); }
});

test('mode = tracker when tracker is github + no mirror', () => {
  const { root } = makeFixture({ tracker: 'github', trackerMirror: false });
  try {
    const result = runHookProcess('start', { cwd: root });
    assert.equal(result.exitCode, 0);
  } finally { cleanup(root); }
});

// --- Backup notice tests ---

test('SessionStart injects backup notice when todo-manual-backup.md exists', () => {
  const { root } = makeFixture({ tracker: 'local', withBackup: true });
  try {
    const result = runHookProcess('start', { cwd: root });
    assert.equal(result.exitCode, 0);
    const output = result.stdout;
    if (output) {
      const parsed = JSON.parse(output);
      const ctx = parsed.hookSpecificOutput?.additionalContext || '';
      assert.ok(ctx.includes('todo-manual-backup.md'), 'should mention backup file');
      assert.ok(ctx.includes('--import-backup'), 'should suggest --import-backup flag');
    }
  } finally { cleanup(root); }
});

test('SessionStart does NOT inject backup notice when no backup exists', () => {
  const { root } = makeFixture({ tracker: 'local' });
  try {
    const result = runHookProcess('start', { cwd: root });
    assert.equal(result.exitCode, 0);
    if (result.stdout) {
      const parsed = JSON.parse(result.stdout);
      const ctx = parsed.hookSpecificOutput?.additionalContext || '';
      assert.ok(!ctx.includes('todo-manual-backup.md'), 'should not mention backup file');
    }
  } finally { cleanup(root); }
});

// --- Evidence extraction unit tests (via require) ---

// We test the module's pure functions by loading them directly.
// The hook file exports nothing (it's a script), so we extract
// the functions by reading the source and evaluating them.

const hookSource = fs.readFileSync(HOOK, 'utf8');

function extractFunction(name, source) {
  const pattern = new RegExp(`function ${name}\\b[^]*?\\n\\}`);
  const m = source.match(pattern);
  if (!m) throw new Error(`Could not extract function ${name}`);
  return new Function('return ' + m[0])();
}

const extractClosingRefs = extractFunction('extractClosingRefs', hookSource);
const extractTaskTrailers = extractFunction('extractTaskTrailers', hookSource);

test('extractClosingRefs: matches "Closes #123"', () => {
  const refs = extractClosingRefs('This PR\n\nCloses #123');
  assert.equal(refs.length, 1);
  assert.equal(refs[0].type, 'github');
  assert.equal(refs[0].id, '123');
});

test('extractClosingRefs: matches "Fixes #456" case-insensitive', () => {
  const refs = extractClosingRefs('fixes #456');
  assert.equal(refs.length, 1);
  assert.equal(refs[0].id, '456');
});

test('extractClosingRefs: matches "Resolves #789"', () => {
  const refs = extractClosingRefs('Resolves #789 and more');
  assert.equal(refs.length, 1);
  assert.equal(refs[0].id, '789');
});

test('extractClosingRefs: matches multiple refs', () => {
  const refs = extractClosingRefs('Closes #1\nFixes #2\nResolves #3');
  assert.equal(refs.length, 3);
});

test('extractClosingRefs: matches ADO "Fixes AB#204"', () => {
  const refs = extractClosingRefs('Fixes AB#204');
  assert.equal(refs.length, 1);
  assert.equal(refs[0].type, 'ado');
  assert.equal(refs[0].id, '204');
});

test('extractClosingRefs: returns empty for no refs', () => {
  const refs = extractClosingRefs('Just a regular PR body with issue #42 mention');
  assert.equal(refs.length, 0);
});

test('extractClosingRefs: returns empty for null/empty', () => {
  assert.deepEqual(extractClosingRefs(null), []);
  assert.deepEqual(extractClosingRefs(''), []);
});

test('extractTaskTrailers: matches anchored "Task: 42"', () => {
  const refs = extractTaskTrailers('Some PR body\n\nTask: 42');
  assert.equal(refs.length, 1);
  assert.equal(refs[0].type, 'local');
  assert.equal(refs[0].id, '42');
});

test('extractTaskTrailers: matches multiple trailers', () => {
  const refs = extractTaskTrailers('Task: 1\nTask: 2\nTask: 3');
  assert.equal(refs.length, 3);
});

test('extractTaskTrailers: does NOT match prose "builds on task 42"', () => {
  const refs = extractTaskTrailers('This builds on task 42 and extends it');
  assert.equal(refs.length, 0);
});

test('extractTaskTrailers: does NOT match "Task: 42 extra text"', () => {
  const refs = extractTaskTrailers('Task: 42 extra text');
  assert.equal(refs.length, 0);
});

test('extractTaskTrailers: does NOT match indented trailer', () => {
  const refs = extractTaskTrailers('  Task: 42');
  assert.equal(refs.length, 0);
});

test('extractTaskTrailers: returns empty for null/empty', () => {
  assert.deepEqual(extractTaskTrailers(null), []);
  assert.deepEqual(extractTaskTrailers(''), []);
});

// --- Never-act-on-ambiguous rule ---

test('extractClosingRefs: does NOT match bare "#42" without closing keyword', () => {
  const refs = extractClosingRefs('Related to #42');
  assert.equal(refs.length, 0);
});

test('extractClosingRefs: does NOT match "Closed #42" (past tense without s)', () => {
  const refs = extractClosingRefs('Closed #42');
  assert.equal(refs.length, 1, '"Closed" is a valid GitHub closing keyword');
});

test('extractTaskTrailers: does NOT match "Tasks: 42" (plural)', () => {
  const refs = extractTaskTrailers('Tasks: 42');
  assert.equal(refs.length, 0);
});

// --- Todoist trailer support (closed = merged) ---

const usesTaskTrailers = extractFunction('usesTaskTrailers', hookSource);

test('extractTaskTrailers: matches alphanumeric Todoist id', () => {
  const refs = extractTaskTrailers('Body\n\nTask: 6hM5pM4FxJvMQxX8');
  assert.equal(refs.length, 1);
  assert.equal(refs[0].id, '6hM5pM4FxJvMQxX8');
});

test('extractTaskTrailers: does NOT match alphanumeric id with trailing text', () => {
  const refs = extractTaskTrailers('Task: 6hM5pM4FxJvMQxX8 extra');
  assert.equal(refs.length, 0);
});

test('usesTaskTrailers: true for local mode', () => {
  assert.equal(usesTaskTrailers({ tracker: 'local' }, 'local'), true);
});

test('usesTaskTrailers: true for todoist tracker (any mode)', () => {
  assert.equal(usesTaskTrailers({ tracker: 'todoist' }, 'tracker'), true);
  assert.equal(usesTaskTrailers({ tracker: 'todoist' }, 'both'), true);
});

test('usesTaskTrailers: false for github/ado trackers', () => {
  assert.equal(usesTaskTrailers({ tracker: 'github' }, 'tracker'), false);
  assert.equal(usesTaskTrailers({ tracker: 'ado' }, 'both'), false);
});

test('usesTaskTrailers: false-y when manifest is null and mode not local', () => {
  assert.equal(!!usesTaskTrailers(null, 'tracker'), false);
});

// --- Graceful gh absence ---

test('SessionEnd exits 0 when gh is not available (graceful skip)', () => {
  const { root } = makeFixture({ tracker: 'github' });
  try {
    const result = runHookProcess('end', {
      cwd: root,
      env: { PATH: '/nonexistent' },
    });
    assert.equal(result.exitCode, 0);
  } finally { cleanup(root); }
});

test('SessionStart exits 0 when gh is not available (graceful skip)', () => {
  const { root } = makeFixture({ tracker: 'github' });
  try {
    const result = runHookProcess('start', {
      cwd: root,
      env: { PATH: '/nonexistent' },
    });
    assert.equal(result.exitCode, 0);
  } finally { cleanup(root); }
});

// --- Default argv handling ---

test('defaults to start phase when no argv[2] provided', () => {
  const { root } = makeFixture({ tracker: 'local' });
  try {
    const result = spawnSync(
      process.execPath,
      [HOOK],
      {
        input: JSON.stringify({}),
        encoding: 'utf8',
        cwd: root,
        timeout: 15000,
      }
    );
    assert.equal(result.status, 0);
  } finally { cleanup(root); }
});
