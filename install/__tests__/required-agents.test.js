'use strict';
// What the installer itself says: which agents verifyInstall requires, which skills and agents it retires, and
// that the settings it generates carry no plan-lint hook. Moved out of the /implement probes
// (skills/implement/__tests__/{feature-review,one-build-skill,one-loop,stories-in-sequence-docs}.probe.test.js,
// story #6j2mgpH6529FcgJ2, check 5): a promise written in the install module's own files is asserted in the
// install module's own tests, under the same test names and messages.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const UPDATER = fs.readFileSync(path.join(__dirname, '..', 'lib', 'updater.js'), 'utf8').replace(/\r\n/g, '\n');
const INSTALL = fs.readFileSync(path.join(__dirname, '..', 'install.js'), 'utf8').replace(/\r\n/g, '\n');

function mustMatch(content, re, message) { assert.ok(re.test(content), message); }

function requiredList(updaterSource) {
  const from = updaterSource.indexOf('const required = [');
  const to = updaterSource.indexOf('];', from);
  assert.ok(from > -1 && to > from, 'updater.js has verifyInstall required list');
  // Comment lines hold apostrophes, so drop them before reading the quoted paths.
  const body = updaterSource.slice(from, to).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function missingFromRequired(agents, required) {
  return agents.filter((a) => !required.includes(`agents/${a}.md`));
}

// The agents /implement starts are the ones whose frontmatter `owner:` is implement or shared (the agent Interface).
// They are found by that field, so a new agent of either owner fails here until the installer requires it.
function implementAgents(agentsDir) {
  return fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md')).filter((f) => {
    const text = fs.readFileSync(path.join(agentsDir, f), 'utf8').replace(/\r\n/g, '\n');
    const owner = (text.match(/^owner:\s*(\S+)\s*$/m) || [])[1];
    return owner === 'implement' || owner === 'shared';
  }).map((f) => f.slice(0, -3));
}

test('Installer_NewAgentsAndRuleRequired_RunnerRetired', () => {
  // The check first, on a planted list that lacks an agent.
  assert.deepStrictEqual(missingFromRequired(['prover', 'story-builder'], ['agents/prover.md']), ['story-builder'], 'a missing agent is reported');

  const required = requiredList(UPDATER);
  assert.ok(required.includes('skills/implement/SKILL.md'), 'the required list was read');
  const agents = implementAgents(path.join(__dirname, '..', '..', 'agents'));
  assert.ok(agents.length >= 15, `the folder scan found the agents: ${agents.length}`);
  assert.deepStrictEqual(missingFromRequired(agents, required), [], 'every agent in the model table must be in verifyInstall required');
  assert.ok(required.includes('rules/agent-handoff.md'), 'rules/agent-handoff.md is required');

  // The runner is retired, not required.
  const { RETIRED_AGENTS } = require('../lib/updater.js');
  assert.ok(RETIRED_AGENTS.includes('story-runner-agent.md'), 'story-runner-agent.md is in RETIRED_AGENTS');
  assert.ok(!required.includes('agents/story-runner-agent.md'), 'story-runner-agent.md is not required');
});

test('Loosened_IsANamedRegisteredAgentOnTheFasterModel', () => {
  mustMatch(UPDATER, /'agents\/loosened-reviewer-agent\.md'/, 'the installer requires it');
});

test('ProveIt_ProverOnSonnet_DiagnosisOnOpus', () => {
  mustMatch(UPDATER, /'agents\/prover\.md'/, 'the installer requires it');
});

test('Replacements_RosterAndInstallerKnowTheOneBuildSkill', () => {
  // Later retirements join the list (to-issues, 2026-10-06); story and run-tasks stay on it.
  mustMatch(UPDATER, /RETIRED_SKILLS = \['story', 'run-tasks'(, '[a-z-]+')*\]/, 'the updater lists the retired skills');
  mustMatch(UPDATER, /removeRetired\(target\);/, 'an update removes them');
  mustMatch(INSTALL, /removeRetired\(target\);/, 'an install over an old one removes them');
});

test('PlanLint_Retired', () => {
  const { buildSettings } = require('../lib/substitution.js');
  const settings = JSON.stringify(buildSettings({ hooksUnix: '/h', sessionStartMsg: 'hi', workRoot: '', isGlobal: false }));
  mustMatch(settings, /catalog-trigger\.js/, 'companion: the generated settings were read');
  assert.ok(!/plan-lint/.test(settings), 'buildSettings registers no plan-lint hook');
});
