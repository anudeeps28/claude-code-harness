'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  agentOwners, checkOwners, checkRulesTable,
  readInterface, checkInterfaces, checkPending, namedFiles, checkCallableParts, checkAgentOutputs,
  callersOf, checkSharedInputs, checkSkillUsage,
} = require('../lib/boundaries.js');

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

// ---- Story #6j2mgm8WpCqR6rgR: Interface blocks ----

// Modules still without an Interface block. Later stories shrink this; the last one deletes it.
const PENDING = [
  'skills/local-test', 'skills/pa', 'skills/plan', 'skills/prd-critique', 'skills/prototype',
  'skills/ralph-prd', 'skills/research', 'skills/sprint-plan', 'skills/sync-tasks',
  'skills/sync-tracker', 'skills/tdd', 'skills/triage', 'skills/update-harness', 'skills/wayfinder',
  'skills/zoom-out',
];
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

test('every skill and agent has a 4-part Interface block (AC1, AC14, AC3, AC4, AC7, AC9, AC11)', () => {
  const skills = fs.readdirSync(path.join(repoRoot, 'skills'), { withFileTypes: true })
    .filter((d) => d.isDirectory()).map((d) => d.name);
  assert.ok(skills.includes('implement'), 'skills/implement must be found');
  assert.deepEqual(checkInterfaces(repoRoot, { pending: PENDING, exempt: EXEMPT_SKILLS }), []);
});

test('interface check names a module whose block is missing, misplaced or lacks a part (AC1, AC2, AC6, AC8, AC13, AC14)', () => {
  inFixture({
    'agents/prover.md': FM + 'body only\n',
    'skills/x/SKILL.md': FM + '\n# x\n\n' + block(),
    'agents/y.md': withBlock({ 'Never breaks': null }),
    'agents/empty.md': withBlock({ Inputs: '' }),
    'agents/five.md': withBlock({ 'Depends on': 'skills/x' }),
    'agents/twice.md': withBlock({}, '\n# T\n\n' + block()),
    'agents/good.md': withBlock({}),
    'skills/pend/SKILL.md': FM + 'nothing\n',
    'skills/frontend-design/SKILL.md': FM + 'nothing\n',
  }, (root) => {
    const problems = checkInterfaces(root, { pending: ['skills/pend'], exempt: ['frontend-design'] });
    const has = (id, word) => problems.some((p) => p.includes(id) && (!word || p.includes(word)));
    assert.ok(has('agents/prover.md', 'Interface'), problems.join('\n'));
    assert.ok(has('skills/x', 'right after the frontmatter'), problems.join('\n'));
    assert.ok(has('agents/y.md', 'Never breaks'), problems.join('\n'));
    assert.ok(has('agents/empty.md', 'Inputs'), problems.join('\n'));
    assert.ok(has('agents/five.md', 'Depends on'), problems.join('\n'));
    assert.ok(has('agents/twice.md', 'more than one'), problems.join('\n'));
    assert.ok(!has('agents/good.md'), 'a correct block must not be reported: ' + problems.join('\n'));
    assert.ok(!has('skills/pend'), 'a pending module is skipped: ' + problems.join('\n'));
    assert.ok(!has('frontend-design'), 'an exempt skill is skipped: ' + problems.join('\n'));
    assert.equal(problems.length, 6, problems.join('\n'));
  });
});

test('interface block must sit right after the frontmatter, not within some line count (AC6)', () => {
  inFixture({
    'agents/late.md': FM + 'a\nb\n\n' + block(),
    'agents/first.md': FM + '\n\n' + block(),
  }, (root) => {
    const problems = checkInterfaces(root, { pending: [], exempt: [] });
    assert.ok(problems.some((p) => p.includes('agents/late.md')), problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('agents/first.md')), 'blank lines before the block are fine: ' + problems.join('\n'));
  });
});

test('readInterface reads the four parts of the block that follows the frontmatter (AC1, AC8, AC10, AC11)', () => {
  const r = readInterface(withBlock({ Inputs: 'arg one', Outputs: 'file two', 'Callable parts': 'bin/a.js', 'Never breaks': 'never pushes to main' }));
  assert.equal(r.found, true);
  assert.equal(r.firstAfterFrontmatter, true);
  assert.equal(r.parts.inputs.trim(), 'arg one');
  assert.equal(r.parts.outputs.trim(), 'file two');
  assert.equal(r.parts.callable.trim(), 'bin/a.js');
  assert.equal(r.parts.neverBreaks.trim(), 'never pushes to main');
  const none = readInterface(FM + 'body\n');
  assert.equal(none.found, false);
});

test('every skill\'s Callable parts list the files other modules name (AC2, AC5, AC10, AC15)', () => {
  const named = namedFiles(repoRoot, 'implement');
  assert.ok(named.includes('bin/worktree.js'), 'worktree.js is named by rules/wave-execution.md: ' + named.join(','));
  assert.deepEqual(checkCallableParts(repoRoot, { pending: PENDING, exempt: EXEMPT_SKILLS }), []);
});

test('callable parts check finds pointers from rules, hooks and templates and requires them in the Callable parts label (AC5, AC10, AC15)', () => {
  inFixture({
    'skills/s/SKILL.md': withBlock({ Inputs: 'uses skills/s/bin/inprose.js', 'Callable parts': 'bin/listed.js' }),
    'skills/s/bin/listed.js': '// x\n',
    'skills/s/bin/inprose.js': '// x\n',
    'skills/s/bin/fromhook.js': '// x\n',
    'skills/s/bin/fromtpl.js': '// x\n',
    'skills/s/bin/own.js': '// skills/s/bin/own.js names itself\n',
    'rules/r.md': 'Run `skills/s/bin/listed.js` and `skills/s/bin/inprose.js` and skills/s/bin/ghost.js\n',
    'hooks/h.js': "require('../skills/s/bin/fromhook.js'); // skills/s/bin/fromhook.js\n",
    'templates/t.md': 'see skills/s/bin/fromtpl.js\n',
  }, (root) => {
    assert.deepEqual(namedFiles(root, 's').sort(), ['bin/fromhook.js', 'bin/fromtpl.js', 'bin/inprose.js', 'bin/listed.js']);
    const problems = checkCallableParts(root, { pending: [], exempt: [] });
    const has = (w) => problems.some((p) => p.includes(w));
    assert.ok(has('skills/s/bin/inprose.js'), 'a name in Inputs is not in Callable parts: ' + problems.join('\n'));
    assert.ok(has('skills/s/bin/fromhook.js') && has('hooks/h.js'), problems.join('\n'));
    assert.ok(has('skills/s/bin/fromtpl.js'), problems.join('\n'));
    assert.ok(!has('listed.js'), 'a listed file is not reported: ' + problems.join('\n'));
    assert.ok(!has('ghost.js') && !has('own.js'), problems.join('\n'));
    assert.equal(problems.length, 3, problems.join('\n'));
  });
});

test('/implement Never breaks cites the accepted ADRs (AC2, AC11, AC15)', () => {
  const text = fs.readFileSync(path.join(repoRoot, 'skills', 'implement', 'SKILL.md'), 'utf8');
  const { parts } = readInterface(text);
  assert.ok(parts.neverBreaks && parts.neverBreaks.length > 0, 'implement has a Never breaks part');
  for (const adr of ['ADR-0001', 'ADR-0004', 'ADR-0005', 'ADR-0006']) {
    assert.ok(parts.neverBreaks.includes(adr), `${adr} missing from Never breaks`);
  }
  assert.ok(!parts.neverBreaks.includes('ADR-0002') && !parts.neverBreaks.includes('ADR-0003'), 'superseded ADRs must not be cited');
  assert.ok(!/ADR-000[1456]/.test(parts.inputs + parts.outputs), 'the ids must be in Never breaks, not elsewhere');
});

test('pending list names only modules still without a block (AC3, AC16)', () => {
  assert.deepEqual(checkPending(repoRoot, PENDING), []);
  inFixture({
    'agents/done.md': withBlock({}),
    'agents/todo.md': FM + 'body\n',
  }, (root) => {
    const problems = checkPending(root, ['agents/done', 'agents/todo', 'agents/ghost']);
    assert.ok(problems.some((p) => p.includes('agents/done') && p.includes('has an Interface block') && p.includes('remove it from PENDING')), problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('agents/ghost') && p.includes('does not exist')), problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('agents/todo')), problems.join('\n'));
    assert.equal(problems.length, 2, problems.join('\n'));
  });
});

test('no agent is pending and the exempt list is only frontend-design (AC1, AC3)', () => {
  // The one non-empty sentinel for PENDING: drop it when PENDING reaches zero (story 5, the last skills).
  assert.ok(PENDING.length > 0, 'the skills are still pending, so the filter below has something to filter');
  assert.deepEqual(PENDING.filter((id) => id.startsWith('agents/')), []);
  assert.deepEqual(EXEMPT_SKILLS, ['frontend-design']);
});

test('every shared agent\'s Inputs name each calling skill (AC2)', () => {
  assert.deepEqual(callersOf(repoRoot, 'evaluator-agent').sort(), ['evaluate', 'implement']);
  assert.deepEqual(checkSharedInputs(repoRoot, { pending: PENDING }), []);
  const shared = (inputs) => withBlock({ Inputs: inputs }).replace('name: x', 'name: x\nowner: shared');
  inFixture({
    'skills/implement/SKILL.md': 'spawns `shared-a` and `shared-b`\n',
    'skills/debug/SKILL.md': 'spawns shared-a\n',
    'agents/shared-a.md': shared('from /implement: a plan path'),
    'agents/shared-b.md': shared('from /implement: a plan path'),
    'agents/own.md': withBlock({ Inputs: 'a plan path' }).replace('name: x', 'name: x\nowner: implement'),
    // owner: shared with a block that omits a caller: only the pending guard keeps it out of the report.
    'agents/pend.md': shared('a plan path'),
    'skills/pendcaller/SKILL.md': 'Spawn `pend` here\n',
  }, (root) => {
    assert.deepEqual(callersOf(root, 'shared-a').sort(), ['debug', 'implement']);
    const problems = checkSharedInputs(root, { pending: ['agents/pend'] });
    assert.ok(problems.some((p) => p.includes('agents/shared-a.md') && p.includes('/debug')), problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('agents/pend.md')), problems.join('\n'));
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.equal(checkSharedInputs(root, { pending: [] }).filter((p) => p.includes('agents/pend.md')).length, 1);
  });
});

test('the real callers of the shared and sprint-plan agents are found (finding 1)', () => {
  assert.deepEqual(callersOf(repoRoot, 'evaluator-agent').sort(), ['evaluate', 'implement']);
  assert.deepEqual(callersOf(repoRoot, 'coverage-auditor-agent').sort(), ['coverage-audit', 'implement']);
  assert.deepEqual(callersOf(repoRoot, 'debug-agent').sort(), ['debug', 'implement']);
  for (const a of ['sprint-plan-docs-reader', 'sprint-plan-tracker-reader', 'sprint-plan-gap-analyzer']) {
    assert.deepEqual(callersOf(repoRoot, a), ['sprint-plan'], a);
  }
});

test('callersOf finds launch, start, run, "Agent X:" and a name on the line after the verb, not examples (finding 1)', () => {
  inFixture({
    'skills/l/SKILL.md': 'Launch a `shared-b` with a brief\n',
    'skills/n/SKILL.md': 'Spawn the reviewer:\n`shared-b` (foreground)\n',
    'skills/s/SKILL.md': 'Start `shared-b`\n',
    'skills/r/SKILL.md': 'Then run the `shared-b` agent\n',
    'skills/a/SKILL.md': '**Agent A: `shared-b`** (foreground)\n',
    'skills/ex/SKILL.md': '- **Skill or agent:** [e.g., story-builder, shared-b]\n\nThe brief of `shared-b` names a path.\n',
    'skills/path/SKILL.md': 'Spawn from `agents/shared-b.md`\n',
  }, (root) => {
    assert.deepEqual(callersOf(root, 'shared-b').sort(), ['a', 'l', 'n', 'r', 's']);
  });
});

test('a skill named only inside a path does not satisfy the calling-skill check (finding 2)', () => {
  const shared = (inputs) => withBlock({ Inputs: inputs }).replace('name: x', 'name: x\nowner: shared');
  inFixture({
    'skills/debug/SKILL.md': 'Spawn `shared-p` and `shared-q`\n',
    'agents/shared-p.md': shared('reads skills/debug/SKILL.md and rules/debug'),
    'agents/shared-q.md': shared('from `/debug`: a path'),
  }, (root) => {
    const problems = checkSharedInputs(root, { pending: [] });
    assert.ok(problems.some((p) => p.includes('agents/shared-p.md') && p.includes('/debug')), problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('agents/shared-q.md')), problems.join('\n'));
    assert.equal(problems.length, 1, problems.join('\n'));
  });
});

test('none (person-launched) satisfies the STATUS check only for owner: person (AC3)', () => {
  const withOwner = (owner, outputs) => withBlock({ Outputs: outputs }).replace('name: x', `name: x\nowner: ${owner}`);
  inFixture({
    'agents/ok-person.md': withOwner('person', 'none (person-launched); the person sees a summary'),
    'agents/bad-shared.md': withOwner('shared', 'none (person-launched)'),
    'agents/bad-skill.md': withOwner('implement', 'none (person-launched)'),
    'agents/person-status.md': withOwner('person', 'starts with the STATUS: line'),
  }, (root) => {
    const problems = checkAgentOutputs(root, { pending: [] });
    assert.ok(!problems.some((p) => p.includes('agents/ok-person.md')), problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('agents/bad-shared.md')), problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('agents/bad-skill.md')), problems.join('\n'));
    assert.equal(problems.length, 2, problems.join('\n'));
  });
});

test('every agent\'s Outputs give its STATUS: line (AC3, AC9)', () => {
  assert.deepEqual(checkAgentOutputs(repoRoot, { pending: PENDING }), []);
  inFixture({
    'agents/ok.md': withBlock({ Outputs: 'starts with the STATUS: line' }),
    'agents/elsewhere.md': withBlock({ Inputs: 'STATUS: here', Outputs: 'a report' }, '\nSTATUS: DONE in the body\n'),
    'agents/pend.md': FM + 'x\n',
  }, (root) => {
    const problems = checkAgentOutputs(root, { pending: ['agents/pend'] });
    assert.ok(problems.some((p) => p.includes('agents/elsewhere.md')), problems.join('\n'));
    assert.equal(problems.length, 1, problems.join('\n'));
  });
});

// ---- Review fixes ----

test('namedFiles resolves <skill-dir> and bare bin/ pointers in an owner agent (finding 1)', () => {
  inFixture({
    'skills/s/SKILL.md': withBlock({}),
    'skills/s/bin/x.js': '// x\n',
    'skills/s/bin/y.js': '// y\n',
    'skills/s/bin/z.js': '// z\n',
    'skills/s/bin/folderonly.js': '// f\n',
    'skills/s/reference/r.md': 'r\n',
    'skills/t/SKILL.md': withBlock({}),
    'skills/t/bin/t.js': '// t\n',
    'agents/a.md': withBlock({}, '\nRun `<skill-dir>/bin/x.js` and `bin/y.js`, see reference/r.md and ${CLAUDE_SKILL_DIR}/bin/z.js; scripts in `<skill-dir>/bin`.\n').replace('name: x', 'name: x\nowner: s'),
    'agents/shared.md': withBlock({}, '\nuse bin/t.js and <skill-dir>/bin/t.js\n').replace('name: x', 'name: x\nowner: shared'),
    'rules/two.md': 'The <skill-dir> is the /s skill folder here and the /t skill folder there. <skill-dir>/bin/t.js and <skill-dir>/bin/x.js\n',
    'rules/one.md': 'The <skill-dir> is the /t skill folder. Run <skill-dir>/bin/t.js\n',
  }, (root) => {
    assert.deepEqual(namedFiles(root, 's').sort(), ['bin/x.js', 'bin/y.js', 'bin/z.js', 'reference/r.md']);
    assert.deepEqual(namedFiles(root, 't'), ['bin/t.js']);
    const problems = checkCallableParts(root, { pending: [], exempt: [] });
    assert.ok(problems.some((p) => p.includes('skills/s/bin/y.js') && p.includes('agents/a.md')), problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('skills/s/') && p.includes('rules/two.md')), 'an ambiguous <skill-dir> is not attributed: ' + problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('skills/t/bin/t.js') && p.includes('rules/one.md')), problems.join('\n'));
  });
});

test('agent Outputs must name STATUS: as the start of the report (finding 3)', () => {
  inFixture({
    'agents/neg.md': withBlock({ Outputs: 'no STATUS: line' }),
    'agents/start.md': withBlock({ Outputs: 'The report starts with a `STATUS:` line' }),
    'agents/first.md': withBlock({ Outputs: 'STATUS: line, then findings' }),
    'agents/neg2.md': withBlock({ Outputs: 'does not start with `STATUS:`' }),
    'agents/neg3.md': withBlock({ Outputs: 'no line that starts with STATUS:' }),
    'agents/begins.md': withBlock({ Outputs: 'begins with the `STATUS:` line' }),
  }, (root) => {
    const problems = checkAgentOutputs(root, { pending: [] });
    assert.ok(problems.some((p) => p.includes('agents/neg.md')), problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('agents/neg2.md')), problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('agents/neg3.md')), problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('agents/start.md') || p.includes('agents/first.md') || p.includes('agents/begins.md')), problems.join('\n'));
    assert.equal(problems.length, 3, problems.join('\n'));
  });
});

test('readInterface rejects a duplicated label and ignores headings in code fences (finding 4)', () => {
  inFixture({
    'agents/dup.md': withBlock({}, '\nmore\n').replace('**Outputs:**', '**Inputs:** again\n**Outputs:**'),
    'agents/fence.md': withBlock({}, '\n```\n## Interface\n```\n'),
  }, (root) => {
    const problems = checkInterfaces(root, { pending: [], exempt: [] });
    assert.ok(problems.some((p) => p.includes('agents/dup.md') && p.includes('Inputs') && p.includes('more than once')), problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('agents/fence.md')), problems.join('\n'));
    assert.equal(problems.length, 1, problems.join('\n'));
  });
  const fenced = readInterface(FM + '\n```\n## Interface\n```\n\n' + block());
  assert.equal(fenced.firstAfterFrontmatter, false);
  assert.equal(fenced.headings, 1);
});

// ---- Story #6j2mgmFRCfPR3H2R: the 17 skills from /plan-features and architect to improve-harness ----

const STORY4_SKILLS = [
  'plan-features', 'architect', 'architect-critique', 'babysit-pr', 'calibrate', 'coverage-audit',
  'debug', 'decision-brief', 'deploy', 'design-artifacts', 'evaluate', 'explain-in-parts', 'grill-me',
  'grill-with-docs', 'hackathon', 'improve-codebase-architecture', 'improve-harness',
];

test('none of the 17 skills of this story is pending any more (AC1, AC2, AC3)', () => {
  assert.equal(STORY4_SKILLS.length, 17);
  for (const name of STORY4_SKILLS) {
    assert.ok(fs.existsSync(path.join(repoRoot, 'skills', name, 'SKILL.md')), `skills/${name}/SKILL.md exists`);
    assert.ok(!PENDING.includes(`skills/${name}`), `skills/${name} is still in PENDING`);
  }
});

test('every skill\'s Interface gives its usage and its tasks/ files (AC1, AC2, AC3)', () => {
  assert.deepEqual(checkSkillUsage(repoRoot, { pending: PENDING, exempt: EXEMPT_SKILLS }), []);
});

test('skill usage check names a skill whose Inputs lack /<name> or whose Outputs name no tasks/ path (AC1, AC2, AC3)', () => {
  const skill = (over) => withBlock(over);
  inFixture({
    'skills/good/SKILL.md': skill({ Inputs: 'run `/good <id>`; reads tasks/x.md', Outputs: 'writes tasks/good/out.md' }),
    'skills/nofiles/SKILL.md': skill({ Inputs: '`/nofiles`', Outputs: 'no tasks/ files; a report' }),
    'skills/nousage/SKILL.md': skill({ Inputs: 'a file under skills/nousage/ only', Outputs: 'writes tasks/n.md' }),
    'skills/nooutput/SKILL.md': skill({ Inputs: '`/nooutput`', Outputs: 'a report only' }),
    'skills/other/SKILL.md': skill({ Inputs: '`/another-one`', Outputs: 'writes tasks/o.md' }),
  }, (root) => {
    const problems = checkSkillUsage(root, { pending: [], exempt: [] });
    const named = (n) => problems.filter((p) => p.includes(`skills/${n}`));
    assert.equal(named('good').length, 0, problems.join('\n'));
    assert.equal(named('nofiles').length, 0, problems.join('\n'));
    assert.equal(named('nousage').length, 1, problems.join('\n'));
    assert.equal(named('nooutput').length, 1, problems.join('\n'));
    assert.equal(named('other').length, 1, problems.join('\n'));
    assert.equal(problems.length, 3, problems.join('\n'));
  });
});

test('skill usage check rejects path-like usages and loose tasks/ mentions, and keeps the real phrasings (AC1, AC2, AC3)', () => {
  const skill = (over) => withBlock(over);
  inFixture({
    'skills/good/SKILL.md': skill({ Inputs: 'run `/good [<id|branch>]`.', Outputs: 'writes tasks/good/out.md' }),
    'skills/dotend/SKILL.md': skill({ Inputs: 'Run `/dotend`. Or /dotend.', Outputs: 'no tasks/ files. A report.' }),
    'skills/dotext/SKILL.md': skill({ Inputs: 'see /dotext.md', Outputs: 'writes tasks/d.md' }),
    'skills/goodish/SKILL.md': skill({ Inputs: 'run /goodish-x', Outputs: 'writes tasks/g.md' }),
    'skills/pathy/SKILL.md': skill({ Inputs: 'run /pathy/x', Outputs: 'writes tasks/p.md' }),
    'skills/space/SKILL.md': skill({ Inputs: '`/space`', Outputs: 'writes tasks/ only' }),
    'skills/sub/SKILL.md': skill({ Inputs: '`/sub`', Outputs: 'writes subtasks/x' }),
    'skills/docs/SKILL.md': skill({ Inputs: '`/docs`', Outputs: 'writes docs/tasks/x and skills/x/tasks/y' }),
    'skills/longer/SKILL.md': skill({ Inputs: '`/longer`', Outputs: 'a report; there are no tasks/ files missing' }),
  }, (root) => {
    const problems = checkSkillUsage(root, { pending: [], exempt: [] });
    const named = (n) => problems.filter((p) => p.includes(`skills/${n}/`));
    assert.equal(named('good').length, 0, problems.join('\n'));
    assert.equal(named('dotend').length, 0, problems.join('\n'));
    for (const n of ['dotext', 'goodish', 'pathy', 'space', 'sub', 'docs', 'longer']) {
      assert.equal(named(n).length, 1, `${n}: ${problems.join('\n')}`);
    }
    assert.equal(problems.length, 7, problems.join('\n'));
  });
});

test('shared-input check does not count a path-like mention of a calling skill (AC1)', () => {
  const shared = (inputs) => withBlock({ Inputs: inputs }).replace('name: x', 'name: x\nowner: shared');
  inFixture({
    'skills/debug/SKILL.md': 'Spawn `shared-r` and `shared-s`\n',
    'agents/shared-r.md': shared('see /debug/foo and /debug.md'),
    'agents/shared-s.md': shared('from `/debug`. Then more'),
  }, (root) => {
    const problems = checkSharedInputs(root, { pending: [] });
    assert.ok(problems.some((p) => p.includes('agents/shared-r.md') && p.includes('/debug')), problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('agents/shared-s.md')), problems.join('\n'));
  });
});
