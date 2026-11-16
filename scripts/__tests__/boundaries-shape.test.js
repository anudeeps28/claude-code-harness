'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const boundaries = require('../lib/boundaries.js');
const { repoRoot, EXEMPT_SKILLS, withBlock, inFixture } = require('./helpers.js');

function run(root, options) {
  assert.equal(typeof boundaries.checkShape, 'function', 'boundaries.js must export checkShape');
  return boundaries.checkShape(root, options);
}
const skillProblems = (list) => list.filter((p) => p.startsWith('skills/'));
const codeProblems = (list) => list.filter((p) => !p.startsWith('skills/') && !p.startsWith('agents/'));

test('check 4 — every skill folder has the standard shape (AC1, AC2, AC4, AC5, AC6, AC13, AC14, AC16, AC17, AC18)', () => {
  const problems = skillProblems(run(repoRoot, { exempt: EXEMPT_SKILLS }));
  assert.deepEqual(problems, []);
  // Companion: the scan really saw skill folders, including the three that were renamed.
  assert.ok(fs.readdirSync(path.join(repoRoot, 'skills')).length > 10, 'no skill folders were found');
  assert.ok(fs.existsSync(path.join(repoRoot, 'skills/plan-features/SKILL.md')), 'plan-features was not found');
});

test('check 4 — every code module has README.md and only what its Interface names (AC9, AC10, AC11, AC12, AC13, AC16, AC17, AC19, AC21)', () => {
  const problems = codeProblems(run(repoRoot, { exempt: EXEMPT_SKILLS }));
  assert.deepEqual(problems, []);
  // Companion: every code module is really there with a README.
  for (const mod of ['hooks', 'trackers', 'code-platform', 'install', 'scripts']) {
    assert.ok(fs.existsSync(path.join(repoRoot, mod, 'README.md')), `${mod}/README.md was not found`);
  }
});

test('check 4 — the renamed files sit in their standard folders and keep their mode (AC4, AC5, AC6)', () => {
  for (const rel of [
    'skills/plan-features/reference/ado-commands.md',
    'skills/local-test/templates/docker-compose-dotnet.yml',
    'skills/ralph-prd/bin/ralph.sh',
    'skills/ralph-prd/bin/ralph.ps1',
  ]) {
    assert.ok(fs.existsSync(path.join(repoRoot, rel)), `${rel} does not exist`);
  }
  const mode = fs.statSync(path.join(repoRoot, 'skills/ralph-prd/bin/ralph.sh')).mode;
  assert.ok((mode & 0o100) !== 0, 'skills/ralph-prd/bin/ralph.sh lost its executable bit');
});

test('check 4 names an odd entry in a skill folder (AC1, AC7, AC13, AC14, AC15, AC18)', () => {
  inFixture({
    'skills/s/SKILL.md': withBlock({}),
    'skills/s/examples/x': 'x',
    'skills/s/bin/run.sh': 'x',
    'skills/s/reference/r.md': 'x',
    'skills/s/templates/t.md': 'x',
    'skills/s/__tests__/t.test.js': 'x',
    'skills/s/.DS_Store': 'x',
    'skills/frontend-design/anything': 'x',
  }, (root) => {
    const problems = skillProblems(run(root, { exempt: EXEMPT_SKILLS }));
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('skills/s/examples'), problems[0]);
    assert.ok(problems[0].includes('standard shape'), problems[0]);
  });
  inFixture({ 'skills/frontend-design/anything': 'x' }, (root) => {
    assert.deepEqual(skillProblems(run(root, { exempt: EXEMPT_SKILLS })), []);
    // Companion: without the exemption the same folder is named, so the exemption is what spared it.
    assert.ok(skillProblems(run(root, { exempt: [] })).some((p) => p.includes('skills/frontend-design')));
  });
});

test('check 4 lists a skill folder that has no SKILL.md (AC2)', () => {
  inFixture({ 'skills/s/stray.txt': 'x' }, (root) => {
    const problems = skillProblems(run(root));
    assert.ok(problems.some((p) => p.includes('skills/s/stray.txt')), problems.join('\n'));
  });
});

test('check 4 names a code module with no README (AC9, AC10, AC19)', () => {
  inFixture({ 'hooks/lib/x.js': 'x' }, (root) => {
    const problems = codeProblems(run(root)).filter((p) => p.startsWith('hooks'));
    assert.ok(problems.includes('hooks: no README.md'), problems.join('\n'));
  });
});

test('check 4 allows a code module only what its Interface block names (AC11, AC12, AC13, AC19)', () => {
  const readme = (callable) => `# M\n\nIntro mentions none and extra here.\n\n## Interface\n\n**Inputs:** a\n**Outputs:** b\n**Callable parts:** ${callable}\n**Never breaks:** c\n\n## Body\n\nbody names stray.js too\n`;
  inFixture({
    'trackers/README.md': readme('The adapter folders `ado/` and `github/` hold scripts.'),
    'trackers/ado/a.sh': 'x',
    'trackers/github/a.sh': 'x',
    'trackers/lib/l.sh': 'x',
    'trackers/__tests__/t.test.js': 'x',
    'trackers/__fixtures__/f.json': 'x',
    'trackers/stray.js': 'x',
    'trackers/extra/e.sh': 'x',
  }, (root) => {
    const problems = codeProblems(run(root)).filter((p) => p.startsWith('trackers'));
    assert.equal(problems.length, 3, problems.join('\n'));
    for (const odd of ['trackers/__fixtures__', 'trackers/stray.js', 'trackers/extra']) {
      assert.ok(problems.some((p) => p.includes(odd)), `${odd} was not named: ${problems.join('\n')}`);
    }
  });
});

test('check 4 names a stray entry whose name only appears as a plain word in the Interface block (AC11, AC12)', () => {
  const readme = '# M\n\n## Interface\n\n**Inputs:** a\n**Outputs:** b\n**Callable parts:** the `ado/` folder is active, and tests and scripts run it.\n**Never breaks:** c\n';
  inFixture({
    'trackers/README.md': readme,
    'trackers/ado/a.sh': 'x',
    'trackers/active/a.sh': 'x',
    'trackers/scripts/s.sh': 'x',
  }, (root) => {
    const problems = codeProblems(run(root)).filter((p) => p.startsWith('trackers'));
    assert.equal(problems.length, 2, problems.join('\n'));
    for (const odd of ['trackers/active', 'trackers/scripts']) {
      assert.ok(problems.some((p) => p.includes(odd)), `${odd} was not named: ${problems.join('\n')}`);
    }
  });
});

test('check 4 allows only agent files and __tests__ in agents/ (AC8)', () => {
  inFixture({
    'agents/a.md': 'x',
    'agents/__tests__/a.test.js': 'x',
    'agents/notes.txt': 'x',
  }, (root) => {
    const problems = run(root).filter((p) => p.startsWith('agents/'));
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('agents/notes.txt'), problems[0]);
  });
});

test('check 4 never treats rules/ or templates/ as a module (AC1)', () => {
  inFixture({
    'rules/odd/x.md': 'x',
    'templates/odd/x.md': 'x',
    'docs/odd/x.md': 'x',
    'examples/odd/x.md': 'x',
  }, (root) => {
    assert.deepEqual(run(root), []);
  });
});

test('no reference to the old paths remains (AC20, AC22)', () => {
  // Assembled so that this file does not contain the old paths itself.
  const old = ['plan-features/' + 'references', 'local-test/' + 'examples', 'ralph-prd/ralph' + '\\.(sh|ps1)', 'hooks/' + 'SECURITY\\.md'].join('|');
  let out = '';
  try {
    out = execFileSync('git', ['grep', '-n', '-E', old, '--', '.',
      ':(exclude)install/lib/updater.js', ':(exclude)CHANGELOG.md', ':(exclude)install/__tests__/updater.test.js',
      ':(exclude)tasks'], { cwd: repoRoot, encoding: 'utf8' });
  } catch (e) {
    if (e.status !== 1) throw e;
  }
  assert.equal(out, '');
  // Companion: git grep really searched this repo (it finds a word that is surely tracked).
  assert.ok(execFileSync('git', ['grep', '-l', 'checkSkillUsage', '--', 'scripts'], { cwd: repoRoot, encoding: 'utf8' }).length > 0);
});
