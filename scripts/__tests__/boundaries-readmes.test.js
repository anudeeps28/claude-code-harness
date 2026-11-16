'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { repoRoot, inFixture } = require('./helpers.js');
const { CODE_MODULES, checkReadmes, requiredExports, checkReadmeCallable } = require('../lib/boundaries.js');

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

