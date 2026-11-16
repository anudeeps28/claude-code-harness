'use strict';
// Shared fixtures for the boundaries-*.test.js files (not a test file itself).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');

// Written by hand from the usage of each agent, not read back from the frontmatter.
const EXPECTED_OWNERS = {
  'story-understand-agent': 'implement',
  'implement-planner-agent': 'implement',
  'story-builder': 'implement',
  'suite-runner': 'implement',
  'story-reviewer': 'implement',
  'prover': 'implement',
  'architect-reviewer-agent': 'implement',
  'security-reviewer-agent': 'implement',
  'loosened-reviewer-agent': 'implement',
  'acceptance-test-agent': 'implement',
  'story-pr-agent': 'implement',
  'tracker-helper': 'implement',
  'debug-agent': 'shared',
  'evaluator-agent': 'shared',
  'coverage-auditor-agent': 'shared',
  'sprint-plan-docs-reader': 'sprint-plan',
  'sprint-plan-gap-analyzer': 'sprint-plan',
  'sprint-plan-tracker-reader': 'sprint-plan',
  'babysit-pr-analyst': 'babysit-pr',
  'babysit-pr-fixer': 'babysit-pr',
  'build-session': 'person',
  'review-session': 'person',
  'chief-operator': 'person',
};

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'boundaries-'));
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
  }
  return root;
}

const agent = (owner) => `---\nname: x\ndescription: d\n${owner ? `owner: ${owner}\n` : ''}---\nbody\n`;

// rules/modules.md "Known exception": skills/frontend-design is a bundle of sub-skills, not one skill.
const EXEMPT_SKILLS = ['frontend-design'];

const FM = '---\nname: x\ndescription: d\n---\n';
const block = (over = {}) => {
  const parts = {
    Inputs: 'a file', Outputs: 'a report', 'Callable parts': 'none', 'Never breaks': 'a promise', ...over,
  };
  return '## Interface\n\n' + Object.entries(parts)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `**${k}:** ${v}`).join('\n') + '\n';
};
const withBlock = (over, body = '\n# Title\n\nbody\n') => FM + '\n' + block(over) + body;

function inFixture(files, fn) {
  const root = fixture(files);
  try {
    return fn(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

module.exports = { repoRoot, EXPECTED_OWNERS, fixture, agent, EXEMPT_SKILLS, FM, block, withBlock, inFixture };
