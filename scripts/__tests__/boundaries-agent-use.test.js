'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { repoRoot, fixture, agent } = require('./helpers.js');
const boundaries = require('../lib/boundaries.js');

function run(root) {
  assert.equal(typeof boundaries.checkAgentUse, 'function', 'boundaries.js must export checkAgentUse');
  return boundaries.checkAgentUse(root);
}
function withFixture(files, fn) {
  const root = fixture(files);
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
const skill = (name, body) => `---\nname: ${name}\ndescription: d\n---\n${body}\n`;

test('check 3 — a skill uses only its own and shared agents (AC3, AC4)', () => {
  assert.deepEqual(run(repoRoot), []);
  // Companion: the scan really saw skills and agents (the real repo has both).
  assert.ok(boundaries.agentOwners(repoRoot).length > 0, 'no agents were read');
  assert.ok(boundaries.callersOf(repoRoot, 'prover').includes('implement'), 'no real launch line was seen');
});

test('check 3 allows own and shared agents (AC1, AC2)', () => {
  withFixture({
    'skills/implement/SKILL.md': skill('implement', 'Spawn `prover` with the plan.\nThen launch `debug-agent` on failure.'),
    'skills/debug/SKILL.md': skill('debug', 'Launch `debug-agent` to diagnose.'),
    'agents/prover.md': agent('implement'),
    'agents/debug-agent.md': agent('shared'),
  }, (root) => {
    assert.deepEqual(run(root), []);
  });
});

test('check 3 names the skill and the agent it may not use (AC1, AC5)', () => {
  withFixture({
    'skills/debug/SKILL.md': skill('debug', 'Spawn `prover` with the failing test.'),
    'skills/implement/SKILL.md': skill('implement', 'Spawn `prover` with the plan.'),
    'agents/prover.md': agent('implement'),
  }, (root) => {
    const problems = run(root);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('skills/debug') && problems[0].includes('prover') && problems[0].includes('implement'), problems[0]);
  });
});

test('check 3 flags a person-owned agent used by a skill (AC2)', () => {
  withFixture({
    'skills/debug/SKILL.md': skill('debug', 'Launch `chief-operator` now.'),
    'agents/chief-operator.md': agent('person'),
  }, (root) => {
    const problems = run(root);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('chief-operator') && problems[0].includes('person'), problems[0]);
  });
});

test('check 3 reads the whole skill folder, not its tests (AC6)', () => {
  withFixture({
    'skills/debug/SKILL.md': skill('debug', 'Nothing here.'),
    'skills/debug/reference/notes.md': 'Spawn `prover` with it.\n',
    'skills/debug/__tests__/x.test.md': 'Spawn `prover` here.\n',
    'agents/prover.md': agent('implement'),
  }, (root) => {
    const problems = run(root);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('skills/debug/reference/notes.md'), problems[0]);
  });
});

test('check 3 does not count a path or a prose mention as use (AC6)', () => {
  const mention = 'Spawn `agents/prover.md` for it.\nThe prover\'s report is short.';
  withFixture({
    'skills/debug/SKILL.md': skill('debug', mention),
    'agents/prover.md': agent('implement'),
  }, (root) => {
    assert.deepEqual(run(root), []);
  });
  // Companion: the same fixture with a real launch line is flagged, so the agent name was seen.
  withFixture({
    'skills/debug/SKILL.md': skill('debug', mention + '\nSpawn `prover` too.'),
    'agents/prover.md': agent('implement'),
  }, (root) => {
    assert.equal(run(root).length, 1);
  });
});

test('check 3 does not flag a possessive on a line that also has a start verb (AC6)', () => {
  const line = "Note how far the run got before the prover's report came back.";
  withFixture({
    'skills/debug/SKILL.md': skill('debug', line),
    'agents/prover.md': agent('implement'),
  }, (root) => {
    assert.deepEqual(run(root), []);
  });
  // Companion: the same line without the possessive is flagged, so only the possessive saved it.
  withFixture({
    'skills/debug/SKILL.md': skill('debug', line.replace("prover's report", 'prover report')),
    'agents/prover.md': agent('implement'),
  }, (root) => {
    assert.equal(run(root).length, 1);
  });
});

test('check 3 reads a third folder under the skill (AC6)', () => {
  withFixture({
    'skills/debug/SKILL.md': skill('debug', 'Nothing here.'),
    'skills/debug/notes/x.md': 'Spawn `prover` with it.\n',
    'agents/prover.md': agent('implement'),
  }, (root) => {
    const problems = run(root);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('skills/debug/notes/x.md'), problems[0]);
  });
});

test('check 3 does not read a launch line inside a code fence (AC6)', () => {
  const fenced = 'Example:\n```\nSpawn `prover` with it.\n```';
  withFixture({
    'skills/debug/SKILL.md': skill('debug', fenced),
    'agents/prover.md': agent('implement'),
  }, (root) => {
    assert.deepEqual(run(root), []);
  });
  // Companion: the same line outside a fence is flagged, so the agent name was seen.
  withFixture({
    'skills/debug/SKILL.md': skill('debug', 'Spawn `prover` with it.'),
    'agents/prover.md': agent('implement'),
  }, (root) => {
    assert.equal(run(root).length, 1);
  });
});
