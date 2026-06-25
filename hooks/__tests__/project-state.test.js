const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const { detectProjectState, detectOpenIssues } = require('../lib/project-state.js');

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
    assert.equal(result.signals.ghAvailable, true);
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
    assert.equal(result.signals.ghAvailable, true);
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
    assert.equal(result.signals.ghAvailable, false);
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
    assert.equal(result.signals.ghAvailable, false);
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
  assert.equal(result.ghAvailable, true);
});

// detectOpenIssues: runner returns non-array JSON -> fail-open
test('detectOpenIssues_RunnerReturnsNonArray_FailsOpen', () => {
  const result = detectOpenIssues({ ghRunner: () => '{"not":"array"}' });
  assert.equal(result.openIssues, null);
  assert.equal(result.ghAvailable, false);
});

// detectOpenIssues: runner throws -> fail-open
test('detectOpenIssues_RunnerThrows_FailsOpen', () => {
  const result = detectOpenIssues({ ghRunner: () => { throw new Error('no gh'); } });
  assert.equal(result.openIssues, null);
  assert.equal(result.ghAvailable, false);
});
