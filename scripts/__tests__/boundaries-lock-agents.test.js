'use strict';
// One promise between two modules: the /implement SKILL.md paragraph that gives the test lock to the agents that
// run suites names exactly the agents whose own text says they run suites. The skill's probe derives the first
// set from the paragraph (skills/implement/__tests__/several-sessions.probe.test.js) and the agents' test derives
// the second from the agent files (agents/__tests__/agent-text-several-sessions.test.js); only the boundary
// family may read both (rules/modules.md, check 5 carve-out), so the two are compared here.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { repoRoot, inFixture, block } = require('./helpers.js');
const { lockAgents } = require('../../skills/implement/__tests__/lock-paragraph.js');
const { suiteRunningAgents } = require('../../agents/__tests__/helpers.js');

const suiteAgent = (owner) => `---\nname: x\ndescription: d\ntools: Read, Bash\nowner: ${owner}\n---\n\n${block()}\nRun the project tests.\n`;
const quietAgent = (owner) => `---\nname: x\ndescription: d\ntools: Read\nowner: ${owner}\n---\n\n${block()}\nReads files.\n`;
const skill = (names) => `## Feature mode\n\n### Run the stories\n\nShared test resources. The lock goes to ${names.map((n) => `\`${n}\``).join(', ')}.\n\nThen loop on the stories.\n`;

// What the paragraph names against what the agents' own text says: the agents in one set only.
function compare(root, skillText) {
  const dir = path.join(root, 'agents');
  const texts = Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
    .map((f) => [f.slice(0, -3), fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n')]));
  const named = lockAgents(skillText, root);
  const run = suiteRunningAgents(texts);
  return { named, run, onlyNamed: named.filter((n) => !run.includes(n)), onlyRun: run.filter((n) => !named.includes(n)) };
}

test('the lock paragraph names exactly the agents that run suites', () => {
  // The comparison first, on planted mismatches.
  const files = { 'agents/run-a.md': suiteAgent('implement'), 'agents/run-b.md': suiteAgent('shared'), 'agents/quiet-c.md': quietAgent('implement') };
  const stale = inFixture(files, (root) => compare(root, skill(['run-a', 'quiet-c'])));
  assert.deepEqual(stale.onlyNamed, ['quiet-c'], 'a paragraph naming an agent that runs no suite is reported');
  assert.deepEqual(stale.onlyRun, ['run-b'], 'an agent that runs suites and is not named is reported');
  const same = inFixture(files, (root) => compare(root, skill(['run-a', 'run-b'])));
  assert.deepEqual([same.onlyNamed, same.onlyRun], [[], []], 'matching sets are accepted');

  // The real repo.
  const real = compare(repoRoot, fs.readFileSync(path.join(repoRoot, 'skills', 'implement', 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n'));
  assert.ok(real.named.length >= 7 && real.run.length >= 7, 'companion: the derivation found seven, not none');
  assert.deepEqual(real.onlyNamed, [], 'the SKILL paragraph names an agent whose text runs no suite');
  assert.deepEqual(real.onlyRun, [], 'an agent whose text runs suites is not named by the SKILL paragraph');
  assert.deepEqual(real.named, real.run, 'the agents that run build, test, Observe, feedback-loop and migrate-forward commands are exactly these seven');
});
