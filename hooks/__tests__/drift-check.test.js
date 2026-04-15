const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', 'drift-check.js');

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drift-check-'));
  const tasks = path.join(dir, 'tasks');
  fs.mkdirSync(tasks);
  return { root: dir, tasks };
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
}

function runDriftCheck(filePath, env = {}) {
  const result = spawnSync(
    process.execPath,
    [HOOK],
    {
      input: JSON.stringify({ tool_input: { file_path: filePath } }),
      encoding: 'utf8',
      env: { ...process.env, ...env },
    }
  );
  let parsed = null;
  try { parsed = result.stdout ? JSON.parse(result.stdout) : null; } catch { /* not JSON */ }
  return { stdout: result.stdout, exitCode: result.status, json: parsed };
}

test('exits 0 silently for unrelated file path', () => {
  const { tasks, root } = makeFixture();
  try {
    const result = runDriftCheck(path.join(tasks, 'src', 'index.ts'));
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, '');
  } finally { cleanup(root); }
});

test('exits 0 silently when tracked file has no drift', () => {
  const { tasks, root } = makeFixture();
  try {
    fs.writeFileSync(path.join(tasks, 'pr-queue.md'),
      '## Active PRs\n\n| PR # | Branch | Status | Notes |\n|---|---|---|---|\n| #12 | feature/9950-foo | PR raised | ok |\n');
    const result = runDriftCheck(path.join(tasks, 'pr-queue.md'));
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, '');
  } finally { cleanup(root); }
});

test('soft warning on bad PR status enum', () => {
  const { tasks, root } = makeFixture();
  try {
    fs.writeFileSync(path.join(tasks, 'pr-queue.md'),
      '## Active PRs\n\n| PR # | Branch | Status | Notes |\n|---|---|---|---|\n| #12 | feature/9950-foo | NotARealStatus | x |\n');
    const result = runDriftCheck(path.join(tasks, 'pr-queue.md'));
    assert.equal(result.exitCode, 0);
    assert.ok(result.json);
    assert.equal(result.json.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.match(result.json.hookSpecificOutput.additionalContext, /NotARealStatus/);
  } finally { cleanup(root); }
});

test('soft warning on bad sprint status enum', () => {
  const { tasks, root } = makeFixture();
  try {
    fs.writeFileSync(path.join(tasks, 'sprint5.md'),
      '## Master Status Table\n\n| Story ID | Title | SP | Priority | Status | Owner |\n|---|---|---|---|---|---|\n| #9950 | Foo | 3 | High | NotAStatus | Anudeep |\n');
    const result = runDriftCheck(path.join(tasks, 'sprint5.md'));
    assert.equal(result.exitCode, 0);
    assert.match(result.json.hookSpecificOutput.additionalContext, /NotAStatus/);
  } finally { cleanup(root); }
});

test('hard block on missing flags-and-notes cross-ref', () => {
  const { tasks, root } = makeFixture();
  try {
    fs.writeFileSync(path.join(tasks, 'people.md'),
      '## Alice\n\n**Waiting on from them:**\n- [ ] review of PR #163 (see flags-and-notes.md)\n');
    fs.writeFileSync(path.join(tasks, 'flags-and-notes.md'), '## Waiting On\n\n_None._\n');
    const result = runDriftCheck(path.join(tasks, 'people.md'));
    assert.equal(result.exitCode, 0);
    assert.equal(result.json.decision, 'block');
    assert.match(result.json.reason, /review of PR #163/);
    assert.match(result.json.reason, /\/sync-tasks/);
  } finally { cleanup(root); }
});

test('no hard block when cross-ref text is present in flags-and-notes', () => {
  const { tasks, root } = makeFixture();
  try {
    fs.writeFileSync(path.join(tasks, 'people.md'),
      '## Alice\n\n**Waiting on from them:**\n- [ ] review of PR #163 (see flags-and-notes.md)\n');
    fs.writeFileSync(path.join(tasks, 'flags-and-notes.md'),
      '## Waiting On\n\n| Item | Waiting on |\n|---|---|\n| review of PR #163 | Alice |\n');
    const result = runDriftCheck(path.join(tasks, 'people.md'));
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, '');
  } finally { cleanup(root); }
});

test('placeholder template values do not trip the cross-ref check', () => {
  const { tasks, root } = makeFixture();
  try {
    fs.writeFileSync(path.join(tasks, 'people.md'),
      '## [Person Name] — [Role]\n\n**Waiting on from them:**\n- [ ] [Item description] (see flags-and-notes.md)\n');
    fs.writeFileSync(path.join(tasks, 'flags-and-notes.md'), '## Waiting On\n\n_None._\n');
    const result = runDriftCheck(path.join(tasks, 'people.md'));
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, '');
  } finally { cleanup(root); }
});

test('extended invariant 5 (branch naming) is silent in MVP mode', () => {
  const { tasks, root } = makeFixture();
  try {
    fs.writeFileSync(path.join(tasks, 'pr-queue.md'),
      '## Active PRs\n\n| PR # | Branch | Status | Notes |\n|---|---|---|---|\n| #14 | random-name | PR raised | ok |\n');
    const result = runDriftCheck(path.join(tasks, 'pr-queue.md'));
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, '');
  } finally { cleanup(root); }
});

test('extended invariant 5 (branch naming) warns in FULL mode', () => {
  const { tasks, root } = makeFixture();
  try {
    fs.writeFileSync(path.join(tasks, 'pr-queue.md'),
      '## Active PRs\n\n| PR # | Branch | Status | Notes |\n|---|---|---|---|\n| #14 | random-name | PR raised | ok |\n');
    const result = runDriftCheck(path.join(tasks, 'pr-queue.md'),
      { CLAUDE_HARNESS_DRIFT_LEVEL: 'full' });
    assert.equal(result.exitCode, 0);
    assert.match(result.json.hookSpecificOutput.additionalContext, /random-name/);
  } finally { cleanup(root); }
});

test('extended invariant 6 (story brief xref) skips New stories', () => {
  const { tasks, root } = makeFixture();
  try {
    fs.writeFileSync(path.join(tasks, 'sprint5.md'),
      '## Master Status Table\n\n| Story ID | Title | SP | Priority | Status | Owner |\n|---|---|---|---|---|---|\n| #9999 | Future | 3 | Low | New | Anudeep |\n');
    fs.mkdirSync(path.join(tasks, 'stories'));
    const result = runDriftCheck(path.join(tasks, 'sprint5.md'),
      { CLAUDE_HARNESS_DRIFT_LEVEL: 'full' });
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, '');
  } finally { cleanup(root); }
});

test('extended invariant 6 warns when In Progress story has no brief', () => {
  const { tasks, root } = makeFixture();
  try {
    fs.writeFileSync(path.join(tasks, 'sprint5.md'),
      '## Master Status Table\n\n| Story ID | Title | SP | Priority | Status | Owner |\n|---|---|---|---|---|---|\n| #9950 | Foo | 3 | High | In Progress | Anudeep |\n');
    fs.mkdirSync(path.join(tasks, 'stories'));
    const result = runDriftCheck(path.join(tasks, 'sprint5.md'),
      { CLAUDE_HARNESS_DRIFT_LEVEL: 'full' });
    assert.equal(result.exitCode, 0);
    assert.match(result.json.hookSpecificOutput.additionalContext, /9950/);
    assert.match(result.json.hookSpecificOutput.additionalContext, /brief\.md/);
  } finally { cleanup(root); }
});

test('uses highest-numbered sprint file when multiple coexist', () => {
  const { tasks, root } = makeFixture();
  try {
    fs.writeFileSync(path.join(tasks, 'sprint3.md'),
      '## Master Status Table\n\n| Story ID | Title | SP | Priority | Status | Owner |\n|---|---|---|---|---|---|\n| #1111 | Old | 3 | Low | NotAStatus | Old |\n');
    fs.writeFileSync(path.join(tasks, 'sprint7.md'),
      '## Master Status Table\n\n| Story ID | Title | SP | Priority | Status | Owner |\n|---|---|---|---|---|---|\n| #2222 | New | 3 | Low | AlsoNotAStatus | New |\n');
    const result = runDriftCheck(path.join(tasks, 'sprint7.md'));
    assert.equal(result.exitCode, 0);
    // Should warn about sprint7.md content (AlsoNotAStatus), not sprint3.md (the older NotAStatus row).
    const ctx = result.json.hookSpecificOutput.additionalContext;
    assert.match(ctx, /sprint7\.md/);
    assert.match(ctx, /AlsoNotAStatus/);
    assert.doesNotMatch(ctx, /sprint3\.md/);
  } finally { cleanup(root); }
});
