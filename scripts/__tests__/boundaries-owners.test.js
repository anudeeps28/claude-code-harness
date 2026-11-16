'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { repoRoot, fixture, agent, EXPECTED_OWNERS } = require('./helpers.js');
const { agentOwners, checkOwners, checkRulesTable } = require('../lib/boundaries.js');

test('every agent has a valid owner (AC1, AC2, AC3)', () => {
  const agents = fs.readdirSync(path.join(repoRoot, 'agents')).filter((f) => f.endsWith('.md'))
    .map((f) => f.replace(/\.md$/, '')).sort();
  assert.deepEqual(agents, Object.keys(EXPECTED_OWNERS).sort());
  assert.deepEqual(checkOwners(repoRoot), []);
});

test('owner check names an agent whose owner is missing or unknown (AC6)', () => {
  const root = fixture({
    'skills/real/SKILL.md': '---\nname: real\n---\n',
    'agents/foo.md': agent('bar'),
    'agents/baz.md': agent(null),
    'agents/ok1.md': agent('real'),
    'agents/ok2.md': agent('shared'),
    'agents/ok3.md': agent('person'),
  });
  try {
    const problems = checkOwners(root);
    assert.ok(problems.some((p) => p.includes('agents/foo.md') && p.includes('"bar"')), problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('agents/baz.md')), problems.join('\n'));
    assert.equal(problems.length, 2, 'valid owners must not be reported: ' + problems.join('\n'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('owner is read from the frontmatter, not the body (AC2)', () => {
  const root = fixture({
    'agents/a.md': '---\nname: a\n---\nowner: shared\n',
  });
  try {
    const problems = checkOwners(root);
    assert.ok(problems.some((p) => p.includes('agents/a.md')), 'body owner line must not count');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('agent owners match who uses them (AC3, AC4, AC5, AC7)', () => {
  const actual = {};
  for (const { name, owner } of agentOwners(repoRoot)) actual[name] = owner;
  assert.deepEqual(actual, EXPECTED_OWNERS);
});

test('README rules table lists every rule file (AC8)', () => {
  const rules = fs.readdirSync(path.join(repoRoot, 'rules')).filter((f) => f.endsWith('.md'));
  assert.ok(rules.includes('modules.md'), 'rules/modules.md is missing');
  assert.deepEqual(checkRulesTable(repoRoot), []);
});

test('rules table check reads the rules section, not the whole README (AC8)', () => {
  const root = fixture({
    'rules/modules.md': '# m\n',
    'rules/other.md': '# o\n',
    'README.md': '# R\nSee modules.md elsewhere.\n\n## Rules\n\n| `other.md` | x |\n\n---\n\n## Next\nmodules.md\n',
  });
  try {
    const problems = checkRulesTable(root);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('modules.md'), problems[0]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('owner that climbs out of skills/ is rejected even if the path exists (AC3)', () => {
  const root = fixture({
    'x/SKILL.md': '---\nname: x\n---\n',
    'agents/evil.md': agent('../x'),
  });
  try {
    const problems = checkOwners(root);
    assert.ok(problems.some((p) => p.includes('agents/evil.md')), 'path-like owner must be reported: ' + problems.join('\n'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rules table check reports every rule when README has no Rules section (AC8)', () => {
  const root = fixture({
    'rules/a.md': '# a\n',
    'rules/b.md': '# b\n',
    'README.md': '# R\n`a.md` and `b.md` mentioned outside any rules section.\n',
  });
  try {
    const problems = checkRulesTable(root);
    assert.equal(problems.length, 2, problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('rules/a.md')) && problems.some((p) => p.includes('rules/b.md')), problems.join('\n'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('a bare mention in the rules section is not a table entry (AC8)', () => {
  const root = fixture({
    'rules/a.md': '# a\n',
    'rules/b.md': '# b\n',
    'README.md': '# R\n\n## Rules\n\nSee a.md for details.\n\n| `b.md` | x |\n\n## Next\n',
  });
  try {
    const problems = checkRulesTable(root);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('rules/a.md'), problems[0]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
