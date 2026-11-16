'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { repoRoot, EXEMPT_SKILLS, FM, block, withBlock, inFixture } = require('./helpers.js');
const { readInterface, checkInterfaces, checkAgentOutputs, callersOf, checkSharedInputs, checkSkillUsage } = require('../lib/boundaries.js');

test('check 4 — every skill and agent has a 4-part Interface block (AC1, AC14, AC3, AC4, AC7, AC9, AC11)', () => {
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


test('only frontend-design is exempt (AC1)', () => {
  // Read from the repo: without the exemption exactly the one bundle folder is reported, with it nothing.
  const open = checkInterfaces(repoRoot, { exempt: [] });
  assert.equal(open.length, 1, open.join('\n'));
  assert.ok(open[0].startsWith('skills/frontend-design'), open[0]);
  assert.deepEqual(checkInterfaces(repoRoot, { exempt: EXEMPT_SKILLS }), []);
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

