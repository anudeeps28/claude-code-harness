'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { repoRoot, EXEMPT_SKILLS, withBlock, inFixture } = require('./helpers.js');
const { namedFiles, checkCallableParts } = require('../lib/boundaries.js');

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

