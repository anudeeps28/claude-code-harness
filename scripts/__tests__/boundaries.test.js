'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const boundaries = require('../lib/boundaries.js');
const {
  agentOwners, checkOwners, checkRulesTable,
  readInterface, checkInterfaces, namedFiles, checkCallableParts, checkAgentOutputs,
  callersOf, checkSharedInputs, checkSkillUsage,
  CODE_MODULES, checkReadmes, requiredExports, checkReadmeCallable,
  moduleIds, checkAdrModules, checkAdrCitations, checkAcceptedAdrsCited,
} = boundaries;

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
  assert.ok(skills.includes('frontend-design'), 'the exempt folder is among the folders scanned');
  for (const name of skills.filter((s) => !EXEMPT_SKILLS.includes(s))) {
    assert.ok(fs.existsSync(path.join(repoRoot, 'skills', name, 'SKILL.md')), `skills/${name}/ has no SKILL.md`);
  }
  assert.deepEqual(checkInterfaces(repoRoot, { exempt: EXEMPT_SKILLS }), []);
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
    'skills/frontend-design/SKILL.md': FM + 'nothing\n',
  }, (root) => {
    const problems = checkInterfaces(root, { exempt: ['frontend-design'] });
    const has = (id, word) => problems.some((p) => p.includes(id) && (!word || p.includes(word)));
    assert.ok(has('agents/prover.md', 'Interface'), problems.join('\n'));
    assert.ok(has('skills/x', 'right after the frontmatter'), problems.join('\n'));
    assert.ok(has('agents/y.md', 'Never breaks'), problems.join('\n'));
    assert.ok(has('agents/empty.md', 'Inputs'), problems.join('\n'));
    assert.ok(has('agents/five.md', 'Depends on'), problems.join('\n'));
    assert.ok(has('agents/twice.md', 'more than one'), problems.join('\n'));
    assert.ok(!has('agents/good.md'), 'a correct block must not be reported: ' + problems.join('\n'));
    assert.ok(!has('frontend-design'), 'an exempt skill is skipped: ' + problems.join('\n'));
    assert.equal(problems.length, 6, problems.join('\n'));
  });
});

test('interface block must sit right after the frontmatter, not within some line count (AC6)', () => {
  inFixture({
    'agents/late.md': FM + 'a\nb\n\n' + block(),
    'agents/first.md': FM + '\n\n' + block(),
  }, (root) => {
    const problems = checkInterfaces(root, { exempt: [] });
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
  assert.deepEqual(checkCallableParts(repoRoot, { exempt: EXEMPT_SKILLS }), []);
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
    const problems = checkCallableParts(root, { exempt: [] });
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

test('only frontend-design is exempt (AC1)', () => {
  // Read from the repo: without the exemption exactly the one bundle folder is reported, with it nothing.
  const open = checkInterfaces(repoRoot, { exempt: [] });
  assert.equal(open.length, 1, open.join('\n'));
  assert.ok(open[0].startsWith('skills/frontend-design'), open[0]);
  assert.deepEqual(checkInterfaces(repoRoot, { exempt: EXEMPT_SKILLS }), []);
});

// The word is assembled so that this file itself does not contain it.
const WAITING_WORD = new RegExp('PEN' + 'DING', 'i');

test('no check takes a skip list (AC2)', () => {
  const files = ['scripts/__tests__/boundaries.test.js', 'scripts/lib/boundaries.js', 'scripts/lib/interface.js', 'scripts/lib/pointers.js', 'scripts/lib/readmes.js', 'scripts/lib/adrs.js'];
  for (const rel of files) {
    const text = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    assert.ok(text.length > 0, `${rel} was read`);
    assert.ok(!WAITING_WORD.test(text), `${rel} still has a list of modules without a block`);
  }
  // A list under another name, or passed another way, still needs a second parameter: every exported
  // check takes the repo root alone (the options object is a defaulted parameter, which `.length` skips).
  const checks = Object.entries(boundaries).filter(([name]) => name.startsWith('check'));
  assert.ok(checks.length >= 7, 'the exports include the checks');
  for (const [name, fn] of checks) assert.equal(fn.length, 1, `${name} takes more than the repo root`);
  // And the options object takes `exempt` only.
  inFixture({ 'skills/s/SKILL.md': withBlock({}) }, (root) => {
    for (const fn of [checkInterfaces, checkCallableParts, checkSkillUsage]) {
      assert.throws(() => fn(root, { skip: ['s'] }), /skip/, `${fn.name} accepted the option "skip"`);
      assert.doesNotThrow(() => fn(root, { exempt: ['s'] }));
    }
  });
});

test('a skill is named by its frontmatter name when it has one, else its folder (AC1)', () => {
  const skill = (name, inputs) => `---\nname: ${name}\ndescription: d\n---\n\n` + block({ Inputs: inputs, Outputs: 'writes tasks/x.md' });
  inFixture({
    'skills/ralph-x/SKILL.md': skill('prd', '`/prd <feature>`'),
    'skills/wrong-x/SKILL.md': skill('wname', '`/wrong-x <feature>`'),
    'skills/same/SKILL.md': skill('same', '`/same`'),
  }, (root) => {
    const problems = checkSkillUsage(root, { exempt: [] });
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('skills/wrong-x') && problems[0].includes('/wname'), problems[0]);
  });
  inFixture({
    'skills/ralph-x/SKILL.md': skill('prd', '`/prd`') + 'Spawn `shared-r`\n',
    'agents/shared-r.md': withBlock({ Inputs: 'from `/prd`' }).replace('name: x', 'name: x\nowner: shared'),
  }, (root) => {
    assert.deepEqual(checkSharedInputs(root), []);
  });
});

test('every shared agent\'s Inputs name each calling skill (AC2)', () => {
  assert.deepEqual(callersOf(repoRoot, 'evaluator-agent').sort(), ['evaluate', 'implement']);
  assert.deepEqual(checkSharedInputs(repoRoot), []);
  const shared = (inputs) => withBlock({ Inputs: inputs }).replace('name: x', 'name: x\nowner: shared');
  inFixture({
    'skills/implement/SKILL.md': 'spawns `shared-a` and `shared-b`\n',
    'skills/debug/SKILL.md': 'spawns shared-a\n',
    'agents/shared-a.md': shared('from /implement: a plan path'),
    'agents/shared-b.md': shared('from /implement: a plan path'),
    'agents/own.md': withBlock({ Inputs: 'a plan path' }).replace('name: x', 'name: x\nowner: implement'),
  }, (root) => {
    assert.deepEqual(callersOf(root, 'shared-a').sort(), ['debug', 'implement']);
    const problems = checkSharedInputs(root);
    assert.ok(problems.some((p) => p.includes('agents/shared-a.md') && p.includes('/debug')), problems.join('\n'));
    assert.equal(problems.length, 1, problems.join('\n'));
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
    const problems = checkSharedInputs(root);
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
    const problems = checkAgentOutputs(root);
    assert.ok(!problems.some((p) => p.includes('agents/ok-person.md')), problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('agents/bad-shared.md')), problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('agents/bad-skill.md')), problems.join('\n'));
    assert.equal(problems.length, 2, problems.join('\n'));
  });
});

test('every agent\'s Outputs give its STATUS: line (AC3, AC9)', () => {
  assert.deepEqual(checkAgentOutputs(repoRoot), []);
  inFixture({
    'agents/ok.md': withBlock({ Outputs: 'starts with the STATUS: line' }),
    'agents/elsewhere.md': withBlock({ Inputs: 'STATUS: here', Outputs: 'a report' }, '\nSTATUS: DONE in the body\n'),
  }, (root) => {
    const problems = checkAgentOutputs(root);
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
    const problems = checkCallableParts(root, { exempt: [] });
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
    const problems = checkAgentOutputs(root);
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
    const problems = checkInterfaces(root, { exempt: [] });
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

test('the 17 skills of story 4 exist and carry an Interface block (AC1)', () => {
  assert.equal(STORY4_SKILLS.length, 17);
  for (const name of STORY4_SKILLS) {
    const file = path.join(repoRoot, 'skills', name, 'SKILL.md');
    assert.ok(fs.existsSync(file), `skills/${name}/SKILL.md exists`);
    assert.equal(readInterface(fs.readFileSync(file, 'utf8')).found, true, `skills/${name} has an Interface block`);
  }
});

test('every skill\'s Interface gives its usage and its tasks/ files (AC1, AC2, AC3)', () => {
  assert.deepEqual(checkSkillUsage(repoRoot, { exempt: EXEMPT_SKILLS }), []);
});

test('skill usage check names a skill whose Inputs lack /<name> or whose Outputs name no tasks/ path (AC1, AC2, AC3)', () => {
  // no name: line, so the folder name is the command
  const skill = (over) => withBlock(over).replace('name: x\n', '');
  inFixture({
    'skills/good/SKILL.md': skill({ Inputs: 'run `/good <id>`; reads tasks/x.md', Outputs: 'writes tasks/good/out.md' }),
    'skills/nofiles/SKILL.md': skill({ Inputs: '`/nofiles`', Outputs: 'no tasks/ files; a report' }),
    'skills/nousage/SKILL.md': skill({ Inputs: 'a file under skills/nousage/ only', Outputs: 'writes tasks/n.md' }),
    'skills/nooutput/SKILL.md': skill({ Inputs: '`/nooutput`', Outputs: 'a report only' }),
    'skills/other/SKILL.md': skill({ Inputs: '`/another-one`', Outputs: 'writes tasks/o.md' }),
  }, (root) => {
    const problems = checkSkillUsage(root, { exempt: [] });
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
  // no name: line, so the folder name is the command
  const skill = (over) => withBlock(over).replace('name: x\n', '');
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
    const problems = checkSkillUsage(root, { exempt: [] });
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
    const problems = checkSharedInputs(root);
    assert.ok(problems.some((p) => p.includes('agents/shared-r.md') && p.includes('/debug')), problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('agents/shared-s.md')), problems.join('\n'));
  });
});

// ---- Story 6: front-door READMEs for the five code modules ----

const README_PARTS = ['Inputs', 'Outputs', 'Callable parts', 'Never breaks'];
const readmeText = (over = {}, intro = 'Purpose of the module.') => {
  const parts = README_PARTS.filter((k) => over[k] !== null)
    .map((k) => `**${k}:** ${over[k] === undefined ? 'something' : over[k]}`).join('\n\n');
  return `# Mod\n\n${intro}\n\n## Interface\n\n${parts}\n`;
};
const allReadmes = (override = {}) => Object.fromEntries(
  CODE_MODULES.map((m) => [`${m}/README.md`, override[m] === undefined ? readmeText() : override[m]]));

test('the code modules are the five the rule names (AC3)', () => {
  assert.deepEqual([...CODE_MODULES].sort(), ['code-platform', 'hooks', 'install', 'scripts', 'trackers']);
});

test('every code module README has the 4 parts (AC1, AC2, AC3)', () => {
  assert.deepEqual(checkReadmes(repoRoot), []);
  for (const m of CODE_MODULES) assert.ok(fs.existsSync(path.join(repoRoot, m, 'README.md')), `${m}/README.md exists`);
});

test('README check names a module whose README lacks a part (AC1, AC2)', () => {
  inFixture(allReadmes({ hooks: readmeText({ 'Never breaks': null }) }), (root) => {
    const problems = checkReadmes(root);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('hooks') && problems[0].includes('Never breaks'), problems.join('\n'));
  });
});

test('README check rejects the four words as prose, an empty label, a missing file or a missing purpose line (AC2)', () => {
  const prose = '# Mod\n\nPurpose.\n\n## Interface\n\nIt has Inputs, Outputs, Callable parts and Never breaks.\n';
  const outside = readmeText({ 'Never breaks': null }) + '\n## Notes\n\n**Never breaks:** outside the Interface section\n';
  inFixture(allReadmes({
    hooks: prose,
    trackers: outside,
    'code-platform': readmeText({ Outputs: '' }),
    install: readmeText({}, ''),
  }), (root) => {
    fs.rmSync(path.join(root, 'scripts', 'README.md'));
    const problems = checkReadmes(root);
    const named = (m) => problems.filter((p) => p.includes(m));
    assert.ok(named('hooks').length >= 1, problems.join('\n'));
    assert.ok(named('trackers').some((p) => p.includes('Never breaks')), problems.join('\n'));
    assert.ok(named('code-platform').some((p) => p.includes('Outputs')), problems.join('\n'));
    assert.ok(named('install').length >= 1, problems.join('\n'));
    assert.ok(named('scripts').length >= 1, problems.join('\n'));
  });
});

test('README check passes five complete READMEs (AC1, AC3)', () => {
  inFixture(allReadmes(), (root) => assert.deepEqual(checkReadmes(root), []));
});

test('README check takes the repo root and an exempt-only options object (AC2)', () => {
  assert.equal(checkReadmes.length, 1);
  assert.equal(checkReadmeCallable.length, 1);
  inFixture(allReadmes(), (root) => {
    assert.throws(() => checkReadmes(root, { skip: ['hooks'] }), /skip/);
  });
});

test('requiredExports finds files another module requires, including relative paths (AC4)', () => {
  inFixture({
    'hooks/lib/walk.js': 'module.exports = {};\n',
    'hooks/lib/private.js': 'module.exports = {};\n',
    'hooks/lib/inner.js': "require('./private.js');\n",
    'install/lib/copy.js': "const w = require('../../hooks/lib/walk.js');\n",
  }, (root) => {
    const found = requiredExports(root, 'hooks');
    assert.ok(found.some((f) => f.file === 'hooks/lib/walk.js' && f.requiredBy.includes('install/lib/copy.js')),
      JSON.stringify(found));
    assert.ok(!found.some((f) => f.file === 'hooks/lib/private.js'), JSON.stringify(found));
    assert.equal(found.length, 1, JSON.stringify(found));
  });
});

test('every code module\'s Callable parts list what other modules require from it (AC4)', () => {
  assert.deepEqual(checkReadmeCallable(repoRoot), []);
  const hooks = requiredExports(repoRoot, 'hooks');
  assert.ok(hooks.some((f) => f.file === 'hooks/lib/walk.js' && f.requiredBy.includes('install/lib/copy.js')),
    'the scan finds hooks/lib/walk.js required by install/lib/copy.js: ' + JSON.stringify(hooks));
});

test('Callable-parts check names an unlisted required file with its requirer (AC4)', () => {
  const files = {
    ...allReadmes({ hooks: readmeText({ 'Callable parts': '`lib/other.js`' }) }),
    'hooks/lib/walk.js': 'module.exports = {};\n',
    'install/lib/copy.js': "const w = require('../../hooks/lib/walk.js');\n",
  };
  inFixture(files, (root) => {
    const problems = checkReadmeCallable(root);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('hooks/lib/walk.js') && problems[0].includes('install/lib/copy.js'), problems.join('\n'));
  });
  inFixture({ ...files, 'hooks/README.md': readmeText({ 'Callable parts': '`lib/walk.js` (`walk`)' }) },
    (root) => assert.deepEqual(checkReadmeCallable(root), []));
});

// ---- Story 6 review fixes: what the require scan can and cannot resolve ----

const WALK = { 'hooks/lib/walk.js': 'module.exports = {};\n' };
const requiredBy = (root, mod = 'hooks') => requiredExports(root, mod).map((f) => `${f.file} <- ${f.requiredBy.join(',')}`);

test('a non-literal require, require.resolve or import() is reported with file and line (AC4)', () => {
  const cases = {
    'path.join': "const path = require('node:path');\nconst w = require(path.join(__dirname, '..', '..', 'hooks', 'lib', 'walk.js'));\n",
    'template string': 'const n = "walk";\nconst w = require(`../../hooks/lib/${n}.js`);\n',
    'require.resolve': "const a = 1;\nconst w = require.resolve(somewhere + '/walk.js');\n",
    'dynamic import': "const a = 1;\nconst w = import('../../hooks/lib/' + name);\n",
  };
  for (const [label, text] of Object.entries(cases)) {
    inFixture({ ...allReadmes(), ...WALK, 'install/lib/copy.js': text }, (root) => {
      const problems = checkReadmeCallable(root);
      assert.equal(problems.length, 1, `${label}: ${problems.join('\n')}`);
      assert.ok(problems[0].includes('install/lib/copy.js:2') && problems[0].includes('cannot check a non-literal require'),
        `${label}: ${problems.join('\n')}`);
    });
  }
});

test('a literal require.resolve, import() and static import are resolved like require (AC4)', () => {
  const cases = {
    'require.resolve': "const p = require.resolve('../../hooks/lib/walk.js');\n",
    'dynamic import': "const w = import('../../hooks/lib/walk.js');\n",
    'static import': "import { walk } from '../../hooks/lib/walk.js';\n",
    'multi-line static import': "import {\n  walk,\n} from '../../hooks/lib/walk.js';\n",
    'side-effect import': "import '../../hooks/lib/walk.js';\n",
    're-export': "export { walk } from '../../hooks/lib/walk.js';\n",
  };
  for (const [label, text] of Object.entries(cases)) {
    inFixture({ ...allReadmes(), ...WALK, 'install/lib/copy.mjs': text }, (root) => {
      assert.deepEqual(requiredBy(root), ['hooks/lib/walk.js <- install/lib/copy.mjs'], label);
      const problems = checkReadmeCallable(root);
      assert.equal(problems.length, 1, `${label}: ${problems.join('\n')}`);
      assert.ok(problems[0].includes('hooks/lib/walk.js') && problems[0].includes('install/lib/copy.mjs'), label);
    });
  }
});

test('bare package names and a method named import raise no unresolved-require problem (AC4)', () => {
  inFixture({ ...allReadmes(), ...WALK, 'install/lib/copy.js': "const fs = require('node:fs');\nconst e = require('eslint');\nconst o = obj.import(x);\n" },
    (root) => assert.deepEqual(checkReadmeCallable(root), []));
});

test('requiredExports does not mistake a sibling folder, and resolves index.js, and a missing extension (AC4)', () => {
  inFixture({
    ...WALK,
    'hooks-old/lib/walk.js': 'module.exports = {};\n',
    'hooks/lib/dir/index.js': 'module.exports = {};\n',
    'install/lib/old.js': "require('../../hooks-old/lib/walk.js');\n",
    'install/lib/noext.js': "require('../../hooks/lib/walk');\n",
    'install/lib/dir.js': "require('../../hooks/lib/dir');\n",
  }, (root) => {
    assert.deepEqual(requiredBy(root), [
      'hooks/lib/dir/index.js <- install/lib/dir.js',
      'hooks/lib/walk.js <- install/lib/noext.js',
    ]);
    assert.deepEqual(requiredBy(root, 'hooks-old'), ['hooks-old/lib/walk.js <- install/lib/old.js']);
  });
});

test('requiredExports ignores a target that escapes the root even when a real file is there (AC4)', () => {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'boundaries-outer-'));
  try {
    fs.mkdirSync(path.join(outer, 'hooks', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(outer, 'hooks', 'lib', 'walk.js'), 'module.exports = {};\n');
    const root = path.join(outer, 'repo');
    fs.mkdirSync(path.join(root, 'install', 'lib'), { recursive: true });
    fs.writeFileSync(path.join(root, 'install', 'lib', 'outside.js'), "require('../../../hooks/lib/walk.js');\n");
    assert.deepEqual(requiredBy(root), []);
    assert.deepEqual(requiredBy(root, '..'), []);
  } finally {
    fs.rmSync(outer, { recursive: true, force: true });
  }
});

test('the scan skips tasks, .claude and _local at the repo root only, and node_modules and .git at any depth (AC4)', () => {
  const req = "require('../../hooks/lib/walk.js');\n";
  inFixture({
    ...WALK,
    'tasks/a.js': req.replace('../../', '../'),
    '.claude/a.js': req.replace('../../', '../'),
    '_local/a.js': req.replace('../../', '../'),
    'install/node_modules/a.js': req.replace('../../', '../../'),
    'install/.git/a.js': req,
    'install/__tests__/a.js': req,
    'install/tasks/a.js': req,
  }, (root) => {
    assert.deepEqual(requiredBy(root), ['hooks/lib/walk.js <- install/tasks/a.js']);
  });
});

test('the real repo has no non-literal require outside __tests__ (AC4)', () => {
  assert.deepEqual(checkReadmeCallable(repoRoot).filter((p) => p.includes('non-literal')), []);
  assert.ok(requiredExports(repoRoot, 'hooks').length > 0, 'the scan found hooks files required elsewhere');
});

// ---- Story #6j2mgmXcV4mmxHw2: ADRs name their modules (check 7) ----

const adr = (n, { status = 'accepted', modules = 'skillx' } = {}) =>
  `# ADR-${n} - t\n\n- **Status:** ${status}\n- **Date:** 2026-01-01\n- **Decided by:** x\n` +
  (modules === null ? '' : `- **Modules:** ${modules}\n`) + '\n## Context\n\nbody\n';
const TEMPLATE_OK = '# ADR-NNNN - t\n\n- **Status:** proposed\n- **Date:** d\n- **Decided by:** x\n- **Modules:** [module, module]\n';
const adrBase = (over = {}) => ({
  'skills/skillx/SKILL.md': withBlock({ 'Never breaks': 'one commit (ADR-0001)' }),
  'agents/agenty.md': agent('skillx'),
  'docs/adr/0001-a.md': adr('0001'),
  'templates/docs/adr/0000-template.md': TEMPLATE_OK,
  ...over,
});

test('moduleIds lists skill folders, agent names and the code modules (AC1)', () => {
  inFixture({ 'skills/skillx/SKILL.md': withBlock({}), 'agents/agenty.md': agent('skillx') }, (root) => {
    const ids = moduleIds(root);
    for (const id of ['skillx', 'agenty', 'hooks', 'scripts', 'install']) assert.ok(ids.includes(id), `${id} in ${ids.join(',')}`);
    assert.ok(!ids.includes('nosuchmodule'));
  });
});

test('every ADR has a Modules: line (AC1, AC5, AC6, L72, L206)', () => {
  const files = fs.readdirSync(path.join(repoRoot, 'docs', 'adr')).filter((f) => f.endsWith('.md') && f !== 'README.md');
  const numbered = files.filter((f) => /^\d{4}-.*\.md$/.test(f));
  assert.ok(numbered.length > 0, 'the ADRs are there to be checked');
  assert.deepEqual(files, numbered, 'every ADR file is named NNNN-*.md');
  for (const f of numbered) {
    const header = fs.readFileSync(path.join(repoRoot, 'docs', 'adr', f), 'utf8').split(/\r?\n## /)[0];
    assert.ok(/^- \*\*Modules:\*\*\s*\S/m.test(header), `${f} has a Modules line in its header`);
  }
  assert.deepEqual(checkAdrModules(repoRoot), []);
});

test('an ADR with an unknown module id is named with the id (AC3, L73)', () => {
  inFixture(adrBase({ 'docs/adr/0007-b.md': adr('0007', { modules: 'skillx, nosuchmodule' }) }), (root) => {
    const problems = checkAdrModules(root);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('0007') && problems[0].includes('nosuchmodule'), problems[0]);
  });
});

test('an ADR with no Modules: line in its header, or only one in its body, is named; a future ADR is checked too (AC2, AC5, AC6, L72, L206)', () => {
  const bodyOnly = adr('0008', { modules: null }) + '\nModules: skillx\n- **Modules:** skillx\n';
  inFixture(adrBase({ 'docs/adr/0007-b.md': adr('0007', { modules: null }), 'docs/adr/0008-c.md': bodyOnly }), (root) => {
    const problems = checkAdrModules(root);
    assert.ok(problems.some((p) => p.includes('0007')), problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('0008')), 'a Modules line below the header does not count: ' + problems.join('\n'));
    assert.equal(problems.length, 2, problems.join('\n'));
  });
});

test('the ADR template must carry a Modules: line, and its placeholder is accepted only there (AC6)', () => {
  const noLine = TEMPLATE_OK.replace(/- \*\*Modules:\*\*.*\n/, '');
  inFixture(adrBase({ 'templates/docs/adr/0000-template.md': noLine }), (root) => {
    const problems = checkAdrModules(root);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('0000-template'), problems[0]);
  });
  inFixture(adrBase({ 'docs/adr/0007-b.md': adr('0007', { modules: '[module, module]' }) }), (root) => {
    const problems = checkAdrModules(root);
    assert.ok(problems.some((p) => p.includes('0007')), 'the placeholder is not a real ADR value: ' + problems.join('\n'));
  });
  inFixture(adrBase(), (root) => assert.deepEqual(checkAdrModules(root), []));
});

test('every ADR cited in an Interface block exists and is not superseded (AC4, AC7, L205)', () => {
  assert.deepEqual(checkAdrCitations(repoRoot, { exempt: EXEMPT_SKILLS }), []);
});

test('a block citing a superseded or a missing ADR is named with the module and the ADR (AC4, AC7, L205)', () => {
  inFixture(adrBase({
    'docs/adr/0002-b.md': adr('0002', { status: 'superseded by ADR-0001' }),
    'agents/agenty.md': FM.replace('x', 'agenty') + '\n' + block({ 'Never breaks': 'one thing (ADR-0002)' }) + '\nbody\n',
    'agents/agentz.md': FM.replace('x', 'agentz') + '\n' + block({ 'Never breaks': 'another (ADR-0099)' }) + '\nbody\n',
    'scripts/README.md': '# Scripts\n\nPurpose.\n\n' + block({ Outputs: 'cites one (ADR-0098) here' }),
  }), (root) => {
    const problems = checkAdrCitations(root, { exempt: [] });
    const has = (m, a, w) => problems.some((p) => p.includes(m) && p.includes(a) && p.includes(w));
    assert.ok(has('agents/agenty', 'ADR-0002', 'superseded'), problems.join('\n'));
    assert.ok(has('agents/agentz', 'ADR-0099', 'does not exist'), problems.join('\n'));
    assert.ok(has('scripts', 'ADR-0098', 'does not exist'), 'READMEs are scanned too: ' + problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('ADR-0001')), 'an accepted, existing ADR is fine: ' + problems.join('\n'));
    assert.equal(problems.length, 3, problems.join('\n'));
  });
});

test('every accepted ADR is cited by a Never breaks promise (AC1, L71)', () => {
  assert.deepEqual(checkAcceptedAdrsCited(repoRoot), []);
});

test('an accepted ADR cited nowhere, or only outside Never breaks, is named; a superseded one need not be cited (L71)', () => {
  inFixture(adrBase({
    'docs/adr/0002-b.md': adr('0002'),
    'docs/adr/0003-c.md': adr('0003'),
    'docs/adr/0004-d.md': adr('0004', { status: 'superseded by ADR-0001' }),
    'skills/skillx/SKILL.md': withBlock({ 'Never breaks': 'one commit (ADR-0001)', Inputs: 'a file (ADR-0003)' }),
  }), (root) => {
    const problems = checkAcceptedAdrsCited(root);
    assert.ok(problems.some((p) => p.includes('ADR-0002')), problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('ADR-0003')), 'a citation in Inputs does not count: ' + problems.join('\n'));
    assert.equal(problems.length, 2, problems.join('\n'));
  });
});

test('the ADR checks take the repo root and an exempt-only options object (AC4)', () => {
  for (const fn of [checkAdrModules, checkAdrCitations, checkAcceptedAdrsCited]) {
    assert.equal(fn.length, 1, `${fn.name} takes more than the repo root`);
  }
  inFixture(adrBase(), (root) => {
    for (const fn of [checkAdrModules, checkAdrCitations, checkAcceptedAdrsCited]) {
      assert.throws(() => fn(root, { skip: ['s'] }), /skip/, `${fn.name} accepted the option "skip"`);
    }
  });
});

// ---- Story #6j2mgmXcV4mmxHw2: ADR check hardening (review findings A-G) ----

const withNever = (text) => ({ 'skills/skillx/SKILL.md': withBlock({ 'Never breaks': text }) });
const agentWith = (name, over) => ({ [`agents/${name}.md`]: FM.replace('x', name) + '\n' + block(over) + '\nbody\n' });
const NO_EXEMPT = { exempt: [] };

test('a malformed ADR token in an Interface block is named with the module and the token (finding A)', () => {
  inFixture(adrBase({
    ...agentWith('agenta', { 'Never breaks': 'one (ADR 0001)' }),
    ...agentWith('agentb', { 'Never breaks': 'two (adr-0001)' }),
    ...agentWith('agentc', { 'Never breaks': 'three (ADR-1)' }),
    ...agentWith('agentd', { Outputs: 'four (ADR-00011)' }),
  }), (root) => {
    const problems = checkAdrCitations(root, NO_EXEMPT);
    const has = (m, t) => problems.some((p) => p.includes(m) && p.includes(`"${t}"`));
    assert.ok(has('agents/agenta', 'ADR 0001'), problems.join('\n'));
    assert.ok(has('agents/agentb', 'adr-0001'), problems.join('\n'));
    assert.ok(has('agents/agentc', 'ADR-1'), problems.join('\n'));
    assert.ok(has('agents/agentd', 'ADR-00011'), 'ADR-00011 is not read as 0001: ' + problems.join('\n'));
    assert.equal(problems.length, 4, problems.join('\n'));
  });
});

test('a malformed token does not satisfy an accepted ADR (finding A)', () => {
  inFixture(adrBase({ ...withNever('one commit (ADR 0001) and (ADR-00011)') }), (root) => {
    const problems = checkAcceptedAdrsCited(root);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('ADR-0001'), problems[0]);
  });
});

test('only an ADR id in a parenthetical of ADR ids is a citation; other mentions are not (finding B)', () => {
  inFixture(adrBase({
    'docs/adr/0002-b.md': adr('0002', { status: 'superseded by ADR-0001' }),
    'docs/adr/0003-c.md': adr('0003'),
    ...agentWith('agenta', { 'Never breaks': 'a promise (not ADR-0003)' }),
    ...agentWith('agentb', { 'Never breaks': 'a promise (replaces ADR-0002)' }),
    ...agentWith('agentc', { 'Never breaks': 'a promise, see ADR-0002' }),
  }), (root) => {
    assert.deepEqual(checkAdrCitations(root, NO_EXEMPT), []);
    const unmet = checkAcceptedAdrsCited(root);
    assert.ok(unmet.some((p) => p.includes('ADR-0003')), 'a mention does not satisfy the check: ' + unmet.join('\n'));
  });
});

test('a parenthetical of several ADR ids cites each of them (finding B)', () => {
  inFixture(adrBase({
    'docs/adr/0002-b.md': adr('0002', { status: 'superseded by ADR-0001' }),
    'docs/adr/0003-c.md': adr('0003'),
    ...withNever('one (ADR-0001, ADR-0003)'),
    ...agentWith('agenta', { 'Never breaks': 'old (ADR-0002)' }),
  }), (root) => {
    assert.deepEqual(checkAcceptedAdrsCited(root), []);
    const problems = checkAdrCitations(root, NO_EXEMPT);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('agents/agenta') && problems[0].includes('ADR-0002') && problems[0].includes('superseded'), problems[0]);
  });
});

test('ADR text inside a code fence is skipped (finding B)', () => {
  const fenced = 'one commit (ADR-0001)\n```\n(ADR-0099) and ADR 12\n```';
  inFixture(adrBase({ ...withNever(fenced) }), (root) => {
    assert.deepEqual(checkAdrCitations(root, NO_EXEMPT), []);
    assert.deepEqual(checkAcceptedAdrsCited(root), []);
  });
});

test('a missing Status, a duplicate number and a stray file in docs/adr are named (finding C)', () => {
  inFixture(adrBase({
    'docs/adr/0002-b.md': adr('0002').replace(/- \*\*Status:\*\*.*\n/, ''),
    'docs/adr/0003-c.md': adr('0003'),
    'docs/adr/0003-d.md': adr('0003'),
    'docs/adr/007-x.md': adr('0007'),
    'docs/adr/00008-y.md': adr('0008'),
    'docs/adr/notes.md': '# notes\n',
    'docs/adr/README.md': '# index\n',
  }), (root) => {
    const problems = checkAdrModules(root);
    const has = (...parts) => problems.some((p) => parts.every((x) => p.includes(x)));
    assert.ok(has('0002-b.md', 'Status'), problems.join('\n'));
    assert.ok(has('0003-d.md', '0003-c.md'), 'both files of a duplicate number are named: ' + problems.join('\n'));
    assert.ok(has('007-x.md'), problems.join('\n'));
    assert.ok(has('00008-y.md'), problems.join('\n'));
    assert.ok(has('notes.md'), problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('docs/adr/README.md')), 'README.md is allowed: ' + problems.join('\n'));
    assert.equal(problems.length, 5, problems.join('\n'));
  });
});

test('the Status is its first word: proposed, accepted or superseded in any case, else a problem (finding D)', () => {
  const ok = ['proposed', 'accepted (2026-10-06): built', 'Accepted (supersedes ADR-0002)', '**Superseded** by ADR-0005', 'SUPERSEDED by ADR-0005', 'proposed | accepted | superseded by ADR-XXXX'];
  for (const status of ok) {
    inFixture(adrBase({ 'docs/adr/0002-b.md': adr('0002', { status }) }), (root) => {
      assert.deepEqual(checkAdrModules(root), [], `status "${status}"`);
    });
  }
  for (const status of ['draft', 'acceptedish', 'rejected: no', '(accepted)']) {
    inFixture(adrBase({ 'docs/adr/0002-b.md': adr('0002', { status }) }), (root) => {
      const problems = checkAdrModules(root);
      assert.equal(problems.length, 1, `status "${status}": ${problems.join('\n')}`);
      assert.ok(problems[0].includes('0002-b.md') && problems[0].includes('Status'), problems[0]);
    });
  }
});

test('a decorated or lower-case superseded status still makes a citation a problem; "Accepted (supersedes ...)" does not (finding D)', () => {
  inFixture(adrBase({
    'docs/adr/0002-b.md': adr('0002', { status: '**Superseded** by ADR-0001' }),
    'docs/adr/0003-c.md': adr('0003', { status: 'Accepted (supersedes ADR-0002)', modules: 'skillx, agentb' }),
    ...agentWith('agenta', { 'Never breaks': 'old (ADR-0002)' }),
    ...agentWith('agentb', { 'Never breaks': 'new (ADR-0003)' }),
  }), (root) => {
    const problems = checkAdrCitations(root, NO_EXEMPT);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('agents/agenta') && problems[0].includes('superseded'), problems[0]);
    assert.deepEqual(checkAcceptedAdrsCited(root).filter((p) => p.includes('ADR-0003')), [], 'an accepted ADR is not read as superseded');
  });
});

test('the template Modules value must be the placeholder, read by the same parser as the ADRs (finding E)', () => {
  const swap = (v) => TEMPLATE_OK.replace('[module, module]', v);
  for (const v of ['skillx', 'implement, scripts']) {
    inFixture(adrBase({ 'templates/docs/adr/0000-template.md': swap(v) }), (root) => {
      const problems = checkAdrModules(root);
      assert.equal(problems.length, 1, `value "${v}": ${problems.join('\n')}`);
      assert.ok(problems[0].includes('0000-template') && problems[0].includes('placeholder'), problems[0]);
    });
  }
  const fencedOnly = '# ADR-NNNN - t\n\n- **Status:** proposed\n```\n- **Modules:** [module, module]\n```\n';
  inFixture(adrBase({ 'templates/docs/adr/0000-template.md': fencedOnly }), (root) => {
    const problems = checkAdrModules(root);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('0000-template'), problems[0]);
  });
  const { 'templates/docs/adr/0000-template.md': _t, ...noTemplate } = adrBase();
  inFixture(noTemplate, (root) => {
    assert.ok(checkAdrModules(root).some((p) => p.includes('0000-template')));
  });
});

test('a Modules line naming no id is a problem; a Modules line inside a header code fence does not count (findings F, G)', () => {
  const fenced = adr('0003', { modules: null }).replace('- **Decided by:** x\n', '- **Decided by:** x\n```\n- **Modules:** skillx\n```\n');
  inFixture(adrBase({
    'docs/adr/0002-b.md': adr('0002', { modules: ',' }),
    'docs/adr/0003-c.md': fenced,
  }), (root) => {
    const problems = checkAdrModules(root);
    assert.ok(problems.some((p) => p.includes('0002-b.md') && /no module/i.test(p)), problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('0003-c.md') && p.includes('no - **Modules:** line')), problems.join('\n'));
    assert.equal(problems.length, 2, problems.join('\n'));
  });
});

test('a module citing an ADR whose Modules line does not name it is reported with the module and the ADR (story-pr-agent / ADR-0005)', () => {
  inFixture(adrBase({
    'docs/adr/0002-b.md': adr('0002', { modules: 'skillx' }),
    ...agentWith('agentq', { 'Never breaks': 'one thing (ADR-0002)' }),
    ...agentWith('agentr', { 'Never breaks': 'a mention only, see ADR-0002 here' }),
  }), (root) => {
    const problems = checkAdrCitations(root, NO_EXEMPT);
    assert.ok(problems.some((p) => p.includes('agentq') && p.includes('ADR-0002') && p.includes('Modules')), problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('agentr')), 'a mention is not a citation: ' + problems.join('\n'));
    assert.equal(problems.length, 1, problems.join('\n'));
  });
  inFixture(adrBase({
    'docs/adr/0002-b.md': adr('0002', { modules: 'skillx, agentq' }),
    ...agentWith('agentq', { 'Never breaks': 'one thing (ADR-0002)' }),
  }), (root) => assert.deepEqual(checkAdrCitations(root, NO_EXEMPT), []));
});
