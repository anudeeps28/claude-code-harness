const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const {
  detectProjectState,
  detectActiveTracker,
  detectOpenIssues,
  detectFirstOpenIssue,
  renderGuidance,
  verifyTrackerAdapters,
} = require('../lib/project-state.js');

function makeProjectRoot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-state-'));
  return dir;
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function ghReturns(json) {
  return () => JSON.stringify(json);
}

// 1. Greenfield: no artifacts + gh returns 0 open issues -> state 'greenfield'
test('detectProjectState_NoArtifactsNoIssues_ReturnsGreenfield', () => {
  const root = makeProjectRoot();
  try {
    const result = detectProjectState(root, { ghRunner: ghReturns([]) });
    assert.equal(result.state, 'greenfield');
    assert.deepEqual(result.signals.artifacts, []);
    assert.equal(result.signals.openIssues, 0);
    assert.equal(result.signals.trackerAvailable, true);
  } finally { cleanup(root); }
});

// 2. Active by artifact: PRD.md present + gh returns 0 issues -> state 'active'
test('detectProjectState_PrdMdPresent_ReturnsActive', () => {
  const root = makeProjectRoot();
  try {
    fs.writeFileSync(path.join(root, 'PRD.md'), '# PRD');
    const result = detectProjectState(root, { ghRunner: ghReturns([]) });
    assert.equal(result.state, 'active');
    assert.ok(result.signals.artifacts.includes('PRD.md'));
  } finally { cleanup(root); }
});

// 3. Active by open issue: no artifacts + gh returns 1 open issue -> state 'active'
test('detectProjectState_OneOpenIssue_ReturnsActive', () => {
  const root = makeProjectRoot();
  try {
    const result = detectProjectState(root, { ghRunner: ghReturns([{ number: 42 }]) });
    assert.equal(result.state, 'active');
    assert.equal(result.signals.openIssues, 1);
    assert.equal(result.signals.trackerAvailable, true);
  } finally { cleanup(root); }
});

// 4. Active when BOTH artifact and issue present (sanity check)
test('detectProjectState_ArtifactAndIssue_ReturnsActive', () => {
  const root = makeProjectRoot();
  try {
    fs.writeFileSync(path.join(root, 'PRD.md'), '# PRD');
    const result = detectProjectState(root, { ghRunner: ghReturns([{ number: 7 }]) });
    assert.equal(result.state, 'active');
    assert.ok(result.signals.artifacts.includes('PRD.md'));
    assert.equal(result.signals.openIssues, 1);
  } finally { cleanup(root); }
});

// 5a. Artifact 'grill-summary.md' independently flips state to 'active'
test('detectProjectState_GrillSummaryPresent_ReturnsActive', () => {
  const root = makeProjectRoot();
  try {
    fs.writeFileSync(path.join(root, 'grill-summary.md'), '# Grill');
    const result = detectProjectState(root, { ghRunner: ghReturns([]) });
    assert.equal(result.state, 'active');
    assert.ok(result.signals.artifacts.includes('grill-summary.md'));
  } finally { cleanup(root); }
});

// 5b. Artifact 'PRD.md' independently flips state to 'active'
test('detectProjectState_PrdMdArtifact_ReturnsActive', () => {
  const root = makeProjectRoot();
  try {
    fs.writeFileSync(path.join(root, 'PRD.md'), '# PRD');
    const result = detectProjectState(root, { ghRunner: ghReturns([]) });
    assert.equal(result.state, 'active');
    assert.ok(result.signals.artifacts.includes('PRD.md'));
  } finally { cleanup(root); }
});

// 5c. Artifact 'ARCHITECTURE.md' independently flips state to 'active'
test('detectProjectState_ArchitectureMdPresent_ReturnsActive', () => {
  const root = makeProjectRoot();
  try {
    fs.writeFileSync(path.join(root, 'ARCHITECTURE.md'), '# Architecture');
    const result = detectProjectState(root, { ghRunner: ghReturns([]) });
    assert.equal(result.state, 'active');
    assert.ok(result.signals.artifacts.includes('ARCHITECTURE.md'));
  } finally { cleanup(root); }
});

// 5d. Artifact 'tasks/plan.md' independently flips state to 'active'
test('detectProjectState_TasksPlanMdPresent_ReturnsActive', () => {
  const root = makeProjectRoot();
  try {
    fs.mkdirSync(path.join(root, 'tasks'));
    fs.writeFileSync(path.join(root, 'tasks', 'plan.md'), '# Plan');
    const result = detectProjectState(root, { ghRunner: ghReturns([]) });
    assert.equal(result.state, 'active');
    assert.ok(result.signals.artifacts.includes('tasks/plan.md'));
  } finally { cleanup(root); }
});

// 6. gh-absent fail-open: ghRunner throws -> greenfield (no artifacts), openIssues null, ghAvailable false, no throw
test('detectProjectState_GhRunnerThrows_FailsOpen', () => {
  const root = makeProjectRoot();
  try {
    const throwingRunner = () => { throw new Error('gh not found'); };
    let result;
    assert.doesNotThrow(() => {
      result = detectProjectState(root, { ghRunner: throwingRunner });
    });
    assert.equal(result.state, 'greenfield');
    assert.equal(result.signals.openIssues, null);
    assert.equal(result.signals.trackerAvailable, false);
  } finally { cleanup(root); }
});

// 7. gh returns non-JSON garbage -> fail-open (openIssues null, ghAvailable false), no throw
test('detectProjectState_GhReturnsNonJson_FailsOpen', () => {
  const root = makeProjectRoot();
  try {
    const badRunner = () => 'not valid json {{{{';
    let result;
    assert.doesNotThrow(() => {
      result = detectProjectState(root, { ghRunner: badRunner });
    });
    assert.equal(result.signals.openIssues, null);
    assert.equal(result.signals.trackerAvailable, false);
  } finally { cleanup(root); }
});

// 8. Latency: detectProjectState with injected ghRunner completes in < 500ms
test('detectProjectState_WithInjectedRunner_CompletesUnder500ms', () => {
  const root = makeProjectRoot();
  try {
    const start = performance.now();
    detectProjectState(root, { ghRunner: ghReturns([]) });
    const elapsed = performance.now() - start;
    assert.ok(elapsed < 500, `expected < 500ms, took ${elapsed.toFixed(2)}ms`);
  } finally { cleanup(root); }
});

// detectOpenIssues: returns openIssues count and ghAvailable true when runner returns array
test('detectOpenIssues_RunnerReturnsArray_ReturnsCountAndAvailable', () => {
  const result = detectOpenIssues({ ghRunner: ghReturns([{ number: 1 }, { number: 2 }]) });
  assert.equal(result.openIssues, 2);
  assert.equal(result.trackerAvailable, true);
});

// detectOpenIssues: runner returns non-array JSON -> fail-open
test('detectOpenIssues_RunnerReturnsNonArray_FailsOpen', () => {
  const result = detectOpenIssues({ ghRunner: () => '{"not":"array"}' });
  assert.equal(result.openIssues, null);
  assert.equal(result.trackerAvailable, false);
});

// detectOpenIssues: runner throws -> fail-open
test('detectOpenIssues_RunnerThrows_FailsOpen', () => {
  const result = detectOpenIssues({ ghRunner: () => { throw new Error('no gh'); } });
  assert.equal(result.openIssues, null);
  assert.equal(result.trackerAvailable, false);
});

// ── Todoist-specific tests ──────────────────────────────────────────────

function tdReturns(json) {
  return () => JSON.stringify(json);
}

// detectActiveTracker: reads Type field from tracker-config.md
test('detectActiveTracker_TrackerConfigTodoist_ReturnsTodoist', () => {
  const root = makeProjectRoot();
  try {
    fs.mkdirSync(path.join(root, 'tasks'));
    fs.writeFileSync(path.join(root, 'tasks', 'tracker-config.md'), '**Type:** Todoist\n');
    const tracker = detectActiveTracker(root);
    assert.equal(tracker, 'todoist');
  } finally { cleanup(root); }
});

// detectActiveTracker: explicit override via opts.tracker
test('detectActiveTracker_ExplicitOverride_ReturnsOverride', () => {
  const root = makeProjectRoot();
  try {
    const tracker = detectActiveTracker(root, { tracker: 'todoist' });
    assert.equal(tracker, 'todoist');
  } finally { cleanup(root); }
});

// detectProjectState with Todoist: open tasks detected
test('detectProjectState_TodoistWithOpenTasks_ReturnsActive', () => {
  const root = makeProjectRoot();
  try {
    const tasks = [
      { id: '100', content: 'Build login', is_completed: false },
      { id: '101', content: 'Done task', is_completed: true },
    ];
    const result = detectProjectState(root, {
      tracker: 'todoist',
      tdRunner: tdReturns(tasks),
    });
    assert.equal(result.state, 'active');
    assert.equal(result.signals.openIssues, 1);
    assert.equal(result.signals.tracker, 'todoist');
  } finally { cleanup(root); }
});

// detectProjectState with Todoist: no open tasks, no artifacts -> greenfield
test('detectProjectState_TodoistNoOpenTasks_ReturnsGreenfield', () => {
  const root = makeProjectRoot();
  try {
    const tasks = [{ id: '100', content: 'Done', is_completed: true }];
    const result = detectProjectState(root, {
      tracker: 'todoist',
      tdRunner: tdReturns(tasks),
    });
    assert.equal(result.state, 'greenfield');
    assert.equal(result.signals.openIssues, 0);
  } finally { cleanup(root); }
});

// detectOpenIssues with Todoist: counts only non-completed tasks
test('detectOpenIssues_Todoist_CountsOpenOnly', () => {
  const tasks = [
    { id: '1', content: 'A', is_completed: false },
    { id: '2', content: 'B', is_completed: true },
    { id: '3', content: 'C', is_completed: false },
  ];
  const result = detectOpenIssues({
    activeTracker: 'todoist',
    tdRunner: tdReturns(tasks),
  });
  assert.equal(result.openIssues, 2);
  assert.equal(result.trackerAvailable, true);
});

// detectOpenIssues with Todoist: runner throws -> fail-open
test('detectOpenIssues_TodoistRunnerThrows_FailsOpen', () => {
  const result = detectOpenIssues({
    activeTracker: 'todoist',
    tdRunner: () => { throw new Error('no td'); },
  });
  assert.equal(result.openIssues, null);
  assert.equal(result.trackerAvailable, false);
});

// detectFirstOpenIssue with Todoist: returns first open task
test('detectFirstOpenIssue_Todoist_ReturnsFirstOpenTask', () => {
  const tasks = [
    { id: '50', content: 'Completed', is_completed: true },
    { id: '51', content: 'Build API', is_completed: false },
    { id: '52', content: 'Build UI', is_completed: false },
  ];
  const result = detectFirstOpenIssue({
    activeTracker: 'todoist',
    firstTodoistTaskRunner: tdReturns(tasks),
  });
  assert.deepEqual(result, { id: '51', title: 'Build API' });
});

// detectFirstOpenIssue with Todoist: no open tasks -> null
test('detectFirstOpenIssue_TodoistAllCompleted_ReturnsNull', () => {
  const tasks = [{ id: '50', content: 'Done', is_completed: true }];
  const result = detectFirstOpenIssue({
    activeTracker: 'todoist',
    firstTodoistTaskRunner: tdReturns(tasks),
  });
  assert.equal(result, null);
});

// renderGuidance: Todoist active with first task
test('renderGuidance_TodoistWithFirstTask_ShowsTaskTitle', () => {
  const msg = renderGuidance(
    'active',
    { tracker: 'todoist', openIssues: 1 },
    { id: '51', title: 'Build API' }
  );
  assert.ok(msg.includes('/implement "Build API"'), 'should suggest /implement with task title');
  assert.ok(msg.includes('Todoist'), 'should mention Todoist');
  assert.ok(!msg.includes('#'), 'should not use # issue number syntax');
});

// renderGuidance: GitHub active with first issue (unchanged behavior)
test('renderGuidance_GitHubWithFirstIssue_ShowsIssueNumber', () => {
  const msg = renderGuidance(
    'active',
    { tracker: 'github', openIssues: 1 },
    { number: 42, title: 'Login flow' }
  );
  assert.ok(msg.includes('/implement #42'), 'should suggest /implement with issue number');
});

// renderGuidance: greenfield message is tracker-neutral
test('renderGuidance_Greenfield_TrackerNeutral', () => {
  const msg = renderGuidance('greenfield', { tracker: 'todoist' }, null);
  assert.ok(msg.includes('greenfield'), 'should say greenfield');
  assert.ok(msg.includes('/grill-me'), 'should suggest /grill-me');
});

// ── detectActiveTracker: manifest-first reading ─────────────────────────────

test('detectActiveTracker_ManifestTodoist_ReturnsTodoist', () => {
  const dir = makeProjectRoot();
  try {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', '.harness-manifest.json'),
      JSON.stringify({ tracker: 'todoist' }), 'utf8');
    const result = detectActiveTracker(dir);
    assert.equal(result, 'todoist');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('detectActiveTracker_ManifestOverridesTrackerConfig', () => {
  const dir = makeProjectRoot();
  try {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', '.harness-manifest.json'),
      JSON.stringify({ tracker: 'todoist' }), 'utf8');
    fs.mkdirSync(path.join(dir, 'tasks'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tasks', 'tracker-config.md'),
      '**Type:** GitHub\n', 'utf8');
    const result = detectActiveTracker(dir);
    assert.equal(result, 'todoist', 'manifest should take priority over tracker-config.md');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('detectActiveTracker_NoManifestTracker_FallsToTrackerConfig', () => {
  const dir = makeProjectRoot();
  try {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', '.harness-manifest.json'),
      JSON.stringify({ tracker: null }), 'utf8');
    fs.mkdirSync(path.join(dir, 'tasks'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'tasks', 'tracker-config.md'),
      '**Type:** Todoist\n', 'utf8');
    const result = detectActiveTracker(dir);
    assert.equal(result, 'todoist', 'should fall back to tracker-config.md');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('detectActiveTracker_ExplicitOverride_WinsOverManifest', () => {
  const dir = makeProjectRoot();
  try {
    fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', '.harness-manifest.json'),
      JSON.stringify({ tracker: 'todoist' }), 'utf8');
    const result = detectActiveTracker(dir, { tracker: 'github' });
    assert.equal(result, 'github', 'explicit override wins');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── verifyTrackerAdapters ────────────────────────────────────────────────────

test('verifyTrackerAdapters_NoManifest_ReturnsMatchTrue', () => {
  const dir = makeProjectRoot();
  try {
    const result = verifyTrackerAdapters(dir);
    assert.equal(result.match, true);
    assert.equal(result.manifestTracker, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('verifyTrackerAdapters_ManifestMatchesScripts_ReturnsMatchTrue', () => {
  const dir = makeProjectRoot();
  try {
    fs.mkdirSync(path.join(dir, '.claude', 'trackers', 'active'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', '.harness-manifest.json'),
      JSON.stringify({ tracker: 'todoist' }), 'utf8');
    fs.writeFileSync(path.join(dir, '.claude', 'trackers', 'active', 'get-issue.sh'),
      '#!/bin/bash\ncheck_auth_todoist\n', 'utf8');
    const result = verifyTrackerAdapters(dir);
    assert.equal(result.match, true);
    assert.equal(result.manifestTracker, 'todoist');
    assert.equal(result.detectedTracker, 'todoist');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('verifyTrackerAdapters_ManifestMismatchesScripts_ReturnsMatchFalse', () => {
  const dir = makeProjectRoot();
  try {
    fs.mkdirSync(path.join(dir, '.claude', 'trackers', 'active'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.claude', '.harness-manifest.json'),
      JSON.stringify({ tracker: 'todoist' }), 'utf8');
    fs.writeFileSync(path.join(dir, '.claude', 'trackers', 'active', 'get-issue.sh'),
      '#!/bin/bash\ngh issue view "$1"\n', 'utf8');
    const result = verifyTrackerAdapters(dir);
    assert.equal(result.match, false);
    assert.equal(result.manifestTracker, 'todoist');
    assert.equal(result.detectedTracker, 'github');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
