'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { repoRoot, EXEMPT_SKILLS, withBlock, inFixture } = require('./helpers.js');
const boundaries = require('../lib/boundaries.js');
const { namedFiles, checkCallableParts, readInterface } = boundaries;

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

// Check 2 (rules/modules.md "The boundary check", item 2): file pointers. The functions are called through
// the module object so a missing one fails an assertion, not a destructuring.
const fn = (name) => {
  assert.equal(typeof boundaries[name], 'function', `${name} is not exported from scripts/lib/boundaries.js`);
  return boundaries[name];
};

test('check 2 — skills, agents and rules point only at main files or listed files (AC8, AC12, AC14, AC17)', () => {
  const problems = fn('checkFilePointers')(repoRoot, { exempt: EXEMPT_SKILLS });
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('check 2 names a pointer into a code module\'s private file (AC4, AC9, AC13)', () => {
  inFixture({
    'skills/s/SKILL.md': withBlock({}, '\n# T\n\nsee `hooks/lib/private.js` here\n'),
    'hooks/README.md': withBlock({ 'Callable parts': 'the lib/ folder is private' }),
    'hooks/lib/private.js': '// x\n',
  }, (root) => {
    const problems = fn('checkFilePointers')(root, { exempt: [] });
    assert.ok(problems.some((p) => p.includes('skills/s/SKILL.md:') && p.includes('hooks/lib/private.js')), problems.join('\n'));
  });
});

test('check 2 allows main files, listed files, adapter aliases and rules (AC6, AC9)', () => {
  inFixture({
    'skills/s/SKILL.md': withBlock({}, '\n# T\n\nsee agents/x.md, hooks/README.md, `.claude/trackers/active/get-issue.sh`, hooks/listed.js and rules/r.md\n'),
    'agents/x.md': withBlock({}),
    'hooks/README.md': withBlock({ 'Callable parts': 'listed.js' }),
    'hooks/listed.js': '// x\n',
    'trackers/README.md': withBlock({ Inputs: 'get-issue.sh' }),
    'trackers/active/get-issue.sh': '# x\n',
    'rules/r.md': 'rule\n',
  }, (root) => {
    assert.deepEqual(fn('checkFilePointers')(root, { exempt: [] }), []);
  });
});

test('check 2 scans agents/ and rules/ as well as skills/ (AC8)', () => {
  inFixture({
    'skills/s/SKILL.md': withBlock({}),
    'agents/a.md': withBlock({}, '\nuse hooks/lib/inagent.js\n'),
    'rules/r.md': 'one\nuse `hooks/lib/inrule.js`\n',
    'hooks/README.md': withBlock({ 'Callable parts': 'nothing public' }),
  }, (root) => {
    const problems = fn('checkFilePointers')(root, { exempt: [] });
    assert.ok(problems.some((p) => p.startsWith('agents/a.md:') && p.includes('hooks/lib/inagent.js')), problems.join('\n'));
    assert.ok(problems.some((p) => p.startsWith('rules/r.md:2:') && p.includes('hooks/lib/inrule.js')), problems.join('\n'));
  });
});

test('check 2 flags an unlisted adapter script, with or without a .claude/ prefix (AC9)', () => {
  inFixture({
    'skills/s/SKILL.md': withBlock({}, '\n# T\n\nrun `.claude/trackers/active/other.sh` and trackers/active/get-issue.sh and code-platform/active/pr.sh\n'),
    'trackers/README.md': withBlock({ Inputs: 'get-issue.sh' }),
    'code-platform/README.md': withBlock({ Inputs: 'nothing' }),
  }, (root) => {
    const problems = fn('checkFilePointers')(root, { exempt: [] });
    assert.ok(problems.some((p) => p.includes('trackers/active/other.sh') && p.startsWith('skills/s/SKILL.md:')), problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('code-platform/active/pr.sh')), problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('get-issue.sh')), problems.join('\n'));
    assert.equal(problems.length, 2, problems.join('\n'));
  });
});

test('check 2 reads only the Interface block and reports an unparseable README (AC6, AC13)', () => {
  inFixture({
    'skills/s/SKILL.md': withBlock({}, '\n# T\n\nsee hooks/outside.js and hooks/listed.js and scripts/x.js\n'),
    'hooks/README.md': withBlock({ 'Callable parts': 'listed.js' }, '\n# Body\n\nhooks/outside.js is described down here\n'),
    'scripts/README.md': '# scripts\n\nNo interface block here, x.js\n',
  }, (root) => {
    const problems = fn('checkFilePointers')(root, { exempt: [] });
    assert.ok(problems.some((p) => p.includes('hooks/outside.js')), 'a name only outside the Interface is flagged: ' + problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('hooks/listed.js')), problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('scripts/x.js')), 'a README with no parseable Interface lists nothing: ' + problems.join('\n'));
  });
});

test('check 2 ignores a pointer inside a fence and reports the exact line (AC8)', () => {
  inFixture({
    'rules/r.md': 'line one\n```\nhooks/lib/fenced.js\n```\nline five hooks/lib/real.js\n',
    'hooks/README.md': withBlock({ 'Callable parts': 'nothing public' }),
  }, (root) => {
    assert.deepEqual(fn('checkFilePointers')(root, { exempt: [] }),
      ['rules/r.md:5: points at hooks/lib/real.js, which hooks Interface does not list']);
  });
});

test('check 2 skips an exempt skill in both the file and the heading check (AC8)', () => {
  const files = {
    'skills/fd/SKILL.md': withBlock({}, '\n# T\n\nuse scripts/own.js and `skills/implement/SKILL.md`, "Before you start"\n'),
    'skills/implement/SKILL.md': withBlock({}),
    'scripts/README.md': withBlock({ Inputs: 'nothing' }),
  };
  inFixture(files, (root) => {
    assert.ok(fn('checkFilePointers')(root, { exempt: [] }).length === 1, 'not exempt: flagged');
    assert.ok(fn('checkHeadingPointers')(root, { exempt: [] }).length === 1, 'not exempt: flagged');
    assert.deepEqual(fn('checkFilePointers')(root, { exempt: ['fd'] }), []);
    assert.deepEqual(fn('checkHeadingPointers')(root, { exempt: ['fd'] }), []);
  });
});

test('check 2 — a quoted heading pointer names "Interface" (AC2, AC7, AC10, AC15)', () => {
  const problems = fn('checkHeadingPointers')(repoRoot, { exempt: EXEMPT_SKILLS });
  assert.deepEqual(problems, [], problems.join('\n'));
});

test('check 2 names a pointer to a heading other than Interface (AC5, AC7, AC10, AC15)', () => {
  inFixture({
    'skills/implement/SKILL.md': withBlock({}),
    'rules/x.md': 'see `skills/implement/SKILL.md`, "Before you start"\n',
    'rules/bold.md': 'see (`skills/implement/SKILL.md`, **Stuck stories**)\n',
    'rules/curly.md': 'see `skills/implement/SKILL.md` \u201cThe story loop\u201d\n',
    'rules/ok.md': 'see `skills/implement/SKILL.md`, "Interface"\n',
  }, (root) => {
    const problems = fn('checkHeadingPointers')(root, { exempt: [] });
    const x = problems.filter((p) => p.includes('rules/x.md:1'));
    assert.ok(x.length === 1 && x[0].includes('skills/implement/SKILL.md') && x[0].includes('"Before you start"'), problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('rules/bold.md:1') && p.includes('Stuck stories')), 'bold heading: ' + problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('rules/curly.md:1') && p.includes('The story loop')), 'curly quotes: ' + problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('rules/ok.md')), '"Interface" passes: ' + problems.join('\n'));
  });
});

test('check 2 never flags a pointer into rules/ (AC1, AC2, AC3)', () => {
  inFixture({
    'skills/s/SKILL.md': withBlock({}, '\n# T\n\nsee `rules/deferrals.md`, "The ship test", and skills/s/SKILL.md\n'),
    'rules/deferrals.md': 'rule\n',
  }, (root) => {
    assert.deepEqual(fn('checkFilePointers')(root, { exempt: [] }), []);
    assert.deepEqual(fn('checkHeadingPointers')(root, { exempt: [] }), []);
  });
});

test('check 2 — the /implement Interface holds the promises the repointed text cites (AC11, AC16)', () => {
  const iface = readInterface(fs.readFileSync(path.join(repoRoot, 'skills/implement/SKILL.md'), 'utf8'));
  assert.ok(iface.found);
  const never = iface.parts.neverBreaks;
  assert.ok(never.includes('test first'), 'Never breaks: every story is built test first');
  assert.ok(never.includes('go back to `HEAD`'), 'Never breaks: a stuck story\'s paths go back to HEAD');
  assert.ok(never.includes('feature-state.js live'), 'Never breaks: asks before checkout when a Feature session is live');
  assert.ok(iface.parts.outputs.includes('step:'), 'Outputs: executor-state.md holds the saved step: and round:');
});
