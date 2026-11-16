'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  reconcileSettings,
  isHarnessHook,
  buildSettings,
  backfillManifest,
} = require('../install.js');
const updater = require('../lib/updater.js');

// ── HB-1: plan-lint-check.js is still recognised as a harness hook ───────────
// F73 #83 retired the hook, but it stays in HARNESS_HOOK_SCRIPTS: that is what lets reconcileSettings
// recognise it in an old settings.json as a harness hook and strip it.

test('updater_StillRecognisesPlanLintCheckAsAHarnessHook_SoReconcileCanStripIt', () => {
  assert.equal(
    isHarnessHook({ type: 'command', command: 'node "/h/catalog-trigger.js"' }),
    true,
    'control: catalog-trigger.js must be recognised as a harness hook',
  );
  assert.equal(
    isHarnessHook({ type: 'command', command: 'node "/h/plan-lint-check.js"' }),
    true,
    'plan-lint-check.js must still be recognised as a harness hook so an old settings.json loses it',
  );
});

// ── AC4 (F73 #83): the old settings.json runs a hook whose file is gone ──────

const countPlanLint = (settings) => {
  let count = 0;
  for (const event of Object.values(settings.hooks || {})) {
    for (const group of event) {
      for (const h of (group.hooks || [])) if ((h.command || '').includes('plan-lint')) count++;
    }
  }
  return count;
};

test('Reconcile_DropsThePlanLintHookFromInstalledSettings', () => {
  const generated = buildSettings({ hooksUnix: '/h', sessionStartMsg: 'hi', workRoot: '', isGlobal: false });
  assert.ok(JSON.stringify(generated).includes('catalog-trigger.js'), 'companion: the generated settings were read');

  // An installed settings.json from before #83: the generated hooks, plan-lint among them, and one
  // hook of the person's own that must survive.
  const installed = {
    hooks: {
      PostToolUse: [
        {
          matcher: 'Write|Edit',
          hooks: [
            { type: 'command', command: 'node "/h/catalog-trigger.js"' },
            { type: 'command', command: 'node "/h/drift-check.js"' },
            { type: 'command', command: 'node "/h/plan-lint-check.js"' },
          ],
        },
        { matcher: 'Write', hooks: [{ type: 'command', command: 'node "/mine/my-own-hook.js"' }] },
      ],
    },
  };
  assert.equal(countPlanLint(installed), 1, 'companion: the installed settings run plan-lint once');

  const reconciled = reconcileSettings(installed, generated);
  assert.equal(countPlanLint(reconciled), 0, 'the reconciled settings run no plan-lint hook');
  assert.ok(JSON.stringify(reconciled).includes('my-own-hook.js'), 'a hook of the person\'s own is kept');
  assert.ok(JSON.stringify(reconciled).includes('catalog-trigger.js'), 'the other harness hooks are kept');

  assert.equal(countPlanLint(reconcileSettings(reconciled, generated)), 0, 'and a second reconcile is the same (idempotent)');
});

// ── AC4: the retired lists and what removeRetired takes out of an old install ──

test('Retired_ListsNameTheExecutorTroubleshootAndPlanLint', () => {
  assert.ok(updater.RETIRED_SKILLS.includes('story'), 'companion: the earlier retirements are still listed');
  assert.ok(updater.RETIRED_SKILLS.includes('troubleshoot'), '/troubleshoot is a retired skill');
  for (const a of ['story-executor-agent.md', 'troubleshoot-investigator.md']) {
    assert.ok(updater.RETIRED_AGENTS.includes(a), `${a} is a retired agent`);
  }
  assert.deepEqual(updater.RETIRED_HOOKS, ['plan-lint-check.js', 'lib/plan-lint.js'], 'the plan-lint hook and its lib are retired hooks');
  // The executor must not make an old install look like an enterprise one.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-marker-'));
  try {
    fs.mkdirSync(path.join(dir, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'agents', 'story-executor-agent.md'), '# old', 'utf8');
    assert.equal(backfillManifest(dir, { harnessVersion: '2.0.0' }).detected.workflowPack, 'solo');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Retired_VerifyInstallNoLongerRequiresTheRetiredAgents', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'updater.js'), 'utf8').replace(/\r\n/g, '\n');
  const required = src.slice(src.indexOf('const required = ['), src.indexOf('];', src.indexOf('const required = [')));
  assert.ok(required.includes("'agents/story-builder.md'"), 'companion: the required list was read');
  assert.ok(!required.includes('story-executor-agent'), 'verifyInstall must not require the executor');
  assert.ok(!required.includes('troubleshoot-investigator'), 'verifyInstall must not require the troubleshoot investigator');
});

test('Retired_RemoveRetiredTakesOutTheSkillAgentsAndHooksAndNamesThem', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-all-'));
  const logged = [];
  const origLog = console.log;
  try {
    fs.mkdirSync(path.join(target, 'skills', 'troubleshoot'), { recursive: true });
    fs.writeFileSync(path.join(target, 'skills', 'troubleshoot', 'SKILL.md'), 'old');
    fs.mkdirSync(path.join(target, 'skills', 'implement'), { recursive: true });
    fs.writeFileSync(path.join(target, 'skills', 'implement', 'SKILL.md'), 'keep');
    fs.mkdirSync(path.join(target, 'agents'), { recursive: true });
    for (const a of ['story-executor-agent.md', 'troubleshoot-investigator.md', 'story-builder.md']) fs.writeFileSync(path.join(target, 'agents', a), 'x');
    fs.mkdirSync(path.join(target, 'hooks', 'lib'), { recursive: true });
    for (const h of ['plan-lint-check.js', path.join('lib', 'plan-lint.js'), 'safety-check.js']) fs.writeFileSync(path.join(target, 'hooks', h), 'x');

    // The previous install recorded these as the harness's own (S5: only recorded or harness-worded ones go).
    fs.writeFileSync(path.join(target, '.harness-manifest.json'), JSON.stringify({ installedFiles: [
      'skills/troubleshoot/SKILL.md', 'agents/story-executor-agent.md', 'agents/troubleshoot-investigator.md',
      'hooks/plan-lint-check.js', 'hooks/lib/plan-lint.js',
    ] }));
    console.log = (...a) => logged.push(a.join(' '));
    updater.removeRetired(target);
    console.log = origLog;

    for (const gone of [['skills', 'troubleshoot'], ['agents', 'story-executor-agent.md'], ['agents', 'troubleshoot-investigator.md'],
      ['hooks', 'plan-lint-check.js'], ['hooks', 'lib', 'plan-lint.js']]) {
      assert.ok(!fs.existsSync(path.join(target, ...gone)), `${gone.join('/')} is removed`);
    }
    for (const kept of [['skills', 'implement', 'SKILL.md'], ['agents', 'story-builder.md'], ['hooks', 'safety-check.js']]) {
      assert.ok(fs.existsSync(path.join(target, ...kept)), `${kept.join('/')} is kept`);
    }
    const line = logged.find((l) => /Retired: removed/.test(l)) || '';
    for (const name of ['/troubleshoot', 'story-executor-agent', 'troubleshoot-investigator', 'plan-lint-check.js']) {
      assert.ok(line.includes(name), `the Retired line names ${name}: ${line}`);
    }
  } finally {
    console.log = origLog;
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('Retired_AUsersOwnSkillOfARetiredName_SurvivesAnUpdateAndIsNamed', () => {
  // S5: only what the harness installed goes. A user's own skills/troubleshoot is left, with a note.
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-own-'));
  const logged = [];
  const origLog = console.log;
  try {
    const own = path.join(target, 'skills', 'troubleshoot', 'SKILL.md');
    fs.mkdirSync(path.dirname(own), { recursive: true });
    fs.writeFileSync(own, '---\nname: troubleshoot\ndescription: My own notes for chasing flaky builds\n---\nmine\n');
    fs.mkdirSync(path.join(target, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(target, 'agents', 'story-executor-agent.md'), '---\nname: story-executor-agent\ndescription: my own agent\n---\n');
    fs.writeFileSync(path.join(target, '.harness-manifest.json'), JSON.stringify({ installedFiles: ['skills/implement/SKILL.md'] }));
    console.log = (...a) => logged.push(a.join(' '));
    updater.removeRetired(target);
    console.log = origLog;
    assert.ok(fs.existsSync(own), 'the user\'s own skill is still there');
    assert.ok(fs.existsSync(path.join(target, 'agents', 'story-executor-agent.md')), 'and so is their own agent');
    const note = logged.find((l) => /troubleshoot/.test(l) && /not .*harness|left/i.test(l)) || '';
    assert.ok(note, `a note names it: ${logged.join(' / ')}`);

    // Companion 1: the same folder, recorded by the previous install, is removed.
    fs.writeFileSync(path.join(target, '.harness-manifest.json'), JSON.stringify({ installedFiles: ['skills/troubleshoot/SKILL.md'] }));
    updater.removeRetired(target);
    assert.ok(!fs.existsSync(path.dirname(own)), 'recorded as installed: removed');

    // Companion 2: nothing records it, but it carries the harness's own description: removed.
    fs.mkdirSync(path.dirname(own), { recursive: true });
    fs.writeFileSync(own, '---\nname: troubleshoot\ndescription: Deep behavioral bug investigation — system compiles but does the wrong thing.\n---\n');
    fs.writeFileSync(path.join(target, '.harness-manifest.json'), JSON.stringify({ installedFiles: [] }));
    updater.removeRetired(target);
    assert.ok(!fs.existsSync(path.dirname(own)), 'the harness\'s own text: removed');
  } finally {
    console.log = origLog;
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('Retired_ABackfilledManifestListingTheUsersOwnSkill_DoesNotGetItDeleted', () => {
  // backfillManifest records every file it finds, whoever wrote it, so a backfilled manifest proves
  // nothing about who installed skills/troubleshoot: only the harness's own text may remove it.
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-backfill-'));
  const origLog = console.log;
  try {
    const own = path.join(target, 'skills', 'troubleshoot', 'SKILL.md');
    fs.mkdirSync(path.dirname(own), { recursive: true });
    fs.writeFileSync(own, '---\nname: troubleshoot\ndescription: My own notes for chasing flaky builds\n---\nmine\n');
    const { manifest } = backfillManifest(target, { harnessVersion: '2.0.0' });
    assert.ok(manifest.installedFiles.includes('skills/troubleshoot/SKILL.md'), 'companion: the backfill did list the user\'s file');
    assert.equal(manifest.backfilled, true, 'a backfilled manifest says so');
    console.log = () => {};
    updater.removeRetired(target);
    console.log = origLog;
    assert.ok(fs.existsSync(own), 'the user\'s own skill survives');
    // Companion: the same backfilled manifest still removes an item that carries the harness's own text.
    fs.writeFileSync(own, '---\nname: troubleshoot\ndescription: Deep behavioral bug investigation — system compiles but does the wrong thing.\n---\n');
    console.log = () => {};
    updater.removeRetired(target);
    console.log = origLog;
    assert.ok(!fs.existsSync(path.dirname(own)), 'the harness\'s own text is still removed');
    // And a real (not backfilled) manifest is trusted, as before.
    fs.mkdirSync(path.dirname(own), { recursive: true });
    fs.writeFileSync(own, 'mine again');
    fs.writeFileSync(path.join(target, '.harness-manifest.json'), JSON.stringify({ installedFiles: ['skills/troubleshoot/SKILL.md'] }));
    console.log = () => {};
    updater.removeRetired(target);
    console.log = origLog;
    assert.ok(!fs.existsSync(path.dirname(own)), 'a recorded, not backfilled, manifest is trusted');
  } finally {
    console.log = origLog;
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('Retired_HarnessTextKeysAreExactlyTheRetiredLists', () => {
  const expected = [
    ...updater.RETIRED_SKILLS.map((s) => `skills/${s}`),
    ...updater.RETIRED_AGENTS.map((a) => `agents/${a}`),
    ...updater.RETIRED_HOOKS.map((h) => `hooks/${h}`),
  ].sort();
  assert.ok(updater.HARNESS_TEXT, 'HARNESS_TEXT is exported');
  assert.deepEqual(Object.keys(updater.HARNESS_TEXT).sort(), expected, 'a retired item with no text pattern, or a pattern for an item not retired, is a drift');
  assert.equal(expected.length, 10, 'companion: the lists were read, not empty');
});

test('Retired_OnlyAHookRemoved_PrintsNoEmptyReplacementParentheses', () => {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'retired-hook-'));
  const logged = [];
  const origLog = console.log;
  try {
    fs.mkdirSync(path.join(target, 'hooks'), { recursive: true });
    fs.writeFileSync(path.join(target, 'hooks', 'plan-lint-check.js'), 'x');
    fs.writeFileSync(path.join(target, '.harness-manifest.json'), JSON.stringify({ installedFiles: ['hooks/plan-lint-check.js'] }));
    console.log = (...a) => logged.push(a.join(' '));
    updater.removeRetired(target);
    console.log = origLog;
    const line = logged.find((l) => /Retired: removed/.test(l)) || '';
    assert.ok(line.includes('plan-lint-check.js'), `companion: the hook is named: ${line}`);
    assert.ok(!line.includes('()'), `no empty replacement part: ${line}`);
    assert.ok(!/\(\s*\)/.test(line), `no empty parentheses: ${line}`);
  } finally {
    console.log = origLog;
    fs.rmSync(target, { recursive: true, force: true });
  }
});

// ── Story 6j2mgp3qGcrM58q2 AC3, AC20, AC21, AC22: the renames and the update ──

const RENAMED_OLD = [
  'skills/plan-features/references/story-template.md',
  'skills/ralph-prd/ralph.sh',
  'skills/local-test/examples/local-test-dotnet.ps1',
  'hooks/SECURITY.md',
];
const RENAMED_NEW = [
  'skills/plan-features/reference/story-template.md',
  'skills/ralph-prd/bin/ralph.sh',
  'skills/local-test/templates/local-test-dotnet.ps1',
  'hooks/README.md',
];

const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const SECURITY_BASE = 'the security note as the base release shipped it\n';
const sha = (text) => crypto.createHash('sha256').update(text).digest('hex');
// The real list, with the SECURITY.md entry's hash swapped for the hash of this test's content.
const RENAMED_FOR_TEST = () => updater.RENAMED.map(([o, n, h]) => (o === 'hooks/SECURITY.md' ? [o, n, sha(SECURITY_BASE)] : [o, n, h]));

// An old install with every old path planted unchanged (the bytes the harness has at the new path), and the
// harness source it is updated from. `edited` lists old paths the person changed.
function renameFixture({ backfilled = false, edited = [] } = {}) {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'renamed-'));
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'renamed-source-'));
  const put = (root, rel, text) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  };
  RENAMED_OLD.forEach((old, i) => {
    const text = old === 'hooks/SECURITY.md' ? SECURITY_BASE : `content of ${RENAMED_NEW[i]}`;
    put(source, RENAMED_NEW[i], `content of ${RENAMED_NEW[i]}`);
    put(target, RENAMED_NEW[i], `content of ${RENAMED_NEW[i]}`);
    put(target, old, edited.includes(old) ? `${text}\nmy own edit` : text);
  });
  put(target, 'skills/implement/SKILL.md', 'content of skill');
  fs.writeFileSync(path.join(target, '.harness-manifest.json'), JSON.stringify(backfilled
    ? { backfilled: true, installedFiles: RENAMED_OLD }
    : { installedFiles: RENAMED_OLD }));
  return { target, source, done: () => { fs.rmSync(target, { recursive: true, force: true }); fs.rmSync(source, { recursive: true, force: true }); } };
}
function captureLog(fn) {
  const logged = [];
  const orig = console.log;
  console.log = (...a) => logged.push(a.join(' '));
  try { fn(); } finally { console.log = orig; }
  return logged;
}
const removeRenamed = (fx) => {
  assert.equal(typeof updater.removeRenamed, 'function', 'updater.js must export removeRenamed');
  return captureLog(() => updater.removeRenamed(fx.target, fx.source, [], RENAMED_FOR_TEST()));
};

test('Renamed_UpdateRemovesTheRenamedFoldersFromAnExistingInstall (AC20, AC21, AC22)', () => {
  const fx = renameFixture();
  try {
    const logged = removeRenamed(fx);
    const gone = [...RENAMED_OLD, 'skills/plan-features/references', 'skills/local-test/examples'];
    for (const g of gone) assert.ok(!fs.existsSync(path.join(fx.target, g)), `${g} still exists`);
    for (const kept of [...RENAMED_NEW, 'skills/implement/SKILL.md']) {
      assert.ok(fs.existsSync(path.join(fx.target, kept)), `${kept} was removed`);
    }
    // One moved: line per entry, printed without any verbose option.
    const moved = logged.filter((l) => /moved: /.test(l));
    assert.equal(moved.length, 4, logged.join('\n'));
    for (const old of RENAMED_OLD) {
      assert.ok(moved.some((l) => l.includes(old)), `no moved: line names ${old}`);
    }
  } finally {
    fx.done();
  }
});

test('Renamed_UpdateNeverRemovesAnEditedPathOrOneReachedThroughALink (AC20)', () => {
  // The person edited two of them. Both are recorded in the old manifest, and both are kept, with a note.
  const editedOld = ['skills/local-test/examples/local-test-dotnet.ps1', 'hooks/SECURITY.md'];
  for (const backfilled of [false, true]) {
    const fx = renameFixture({ backfilled, edited: editedOld });
    try {
      const logged = removeRenamed(fx);
      for (const rel of editedOld) {
        assert.ok(fs.existsSync(path.join(fx.target, rel)), `an edited ${rel} was removed (backfilled: ${backfilled})`);
        assert.ok(logged.some((l) => /left/.test(l) && l.includes(rel)), `no note named the kept ${rel}: ${logged.join('\n')}`);
      }
      assert.ok(!fs.existsSync(path.join(fx.target, 'skills/ralph-prd/ralph.sh')), 'an unchanged old file stayed');
      assert.ok(!fs.existsSync(path.join(fx.target, 'skills/plan-features/references')), 'an unchanged old folder stayed');
    } finally {
      fx.done();
    }
  }

  // skills/ is a link into the harness source: nothing behind it may be touched.
  const fx = renameFixture();
  const behind = fs.mkdtempSync(path.join(os.tmpdir(), 'renamed-src-'));
  try {
    fs.cpSync(path.join(fx.target, 'skills'), path.join(behind, 'skills'), { recursive: true });
    fs.rmSync(path.join(fx.target, 'skills'), { recursive: true, force: true });
    fs.symlinkSync(path.join(behind, 'skills'), path.join(fx.target, 'skills'), 'dir');
    removeRenamed(fx);
    assert.ok(fs.existsSync(path.join(behind, 'skills/ralph-prd/ralph.sh')), 'a file behind a link was removed');
    assert.ok(fs.existsSync(path.join(behind, 'skills/local-test/examples/local-test-dotnet.ps1')), 'a file behind a link was removed');
  } finally {
    fx.done();
    fs.rmSync(behind, { recursive: true, force: true });
  }
});

test('Renamed_UpdateRemovesAnUnchangedOldFileEvenFromABackfilledManifest (AC20)', () => {
  const fx = renameFixture({ backfilled: true, edited: ['skills/ralph-prd/ralph.sh'] });
  try {
    const logged = removeRenamed(fx);
    for (const gone of ['skills/local-test/examples/local-test-dotnet.ps1', 'skills/plan-features/references', 'hooks/SECURITY.md']) {
      assert.ok(!fs.existsSync(path.join(fx.target, gone)), `${gone} stayed although it is the harness's own content`);
    }
    assert.ok(fs.existsSync(path.join(fx.target, 'skills/ralph-prd/ralph.sh')), 'an edited file was removed');
    assert.ok(logged.some((l) => l.includes('skills/ralph-prd/ralph.sh') && /left/.test(l)), logged.join('\n'));
  } finally {
    fx.done();
  }
});

test('Renamed_AnOldFileThatIsTheSourceWithItsPlaceholdersFilledInIsTheHarnessOwn (AC20)', () => {
  const fx = renameFixture();
  try {
    const subs = [['YOUR_PROJECT_NAME', 'My Project']];
    const rel = 'skills/local-test/templates/docker-compose-dotnet.yml';
    const old = 'skills/local-test/examples/docker-compose-dotnet.yml';
    const put = (root, r, text) => { fs.mkdirSync(path.dirname(path.join(root, r)), { recursive: true }); fs.writeFileSync(path.join(root, r), text); };
    put(fx.source, rel, '# emulators for YOUR_PROJECT_NAME\n');
    put(fx.target, old, '# emulators for My Project\n');
    put(fx.target, 'skills/local-test/examples/other.yml', '# emulators for My Project and my own edit\n');
    put(fx.source, 'skills/local-test/templates/other.yml', '# emulators for YOUR_PROJECT_NAME\n');
    const logged = captureLog(() => updater.removeRenamed(fx.target, fx.source, subs, RENAMED_FOR_TEST()));
    assert.ok(!fs.existsSync(path.join(fx.target, old)), 'a filled-in unchanged old file stayed');
    assert.ok(fs.existsSync(path.join(fx.target, 'skills/local-test/examples/other.yml')), 'an edited filled-in file was removed');
    assert.ok(logged.some((l) => /left/.test(l) && l.includes('other.yml')), logged.join('\n'));
  } finally {
    fx.done();
  }
});

test('Renamed_TheBaseReleaseHashOfHooksSecurityIsTheRealFilesHash', (t) => {
  let base;
  try {
    base = execFileSync('git', ['show', '321f444:hooks/SECURITY.md'], { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { t.skip('the base release is not in this clone'); return; }
  const entry = updater.RENAMED.find(([o]) => o === 'hooks/SECURITY.md');
  assert.ok(entry && entry[2], 'hooks/SECURITY.md carries the hash of its base-release content');
  assert.equal(entry[2], crypto.createHash('sha256').update(base).digest('hex'));
});

// ── through the installer: a removed call must turn these red ────────────────

const REPO = path.resolve(__dirname, '..', '..');
const INSTALL_JS = path.join(REPO, 'install', 'install.js');
const runInstallJs = (args, home) => execFileSync('node', [INSTALL_JS, ...args], {
  timeout: 60_000, stdio: ['pipe', 'pipe', 'pipe'], input: '', encoding: 'utf8',
  env: { ...process.env, HOME: home, USERPROFILE: home },
});
// The yml carries a YOUR_PROJECT_NAME placeholder the installer fills in, so its installed copy differs from the source's.
const OLD_FILES = {
  'skills/ralph-prd/ralph.sh': 'skills/ralph-prd/bin/ralph.sh',
  'skills/local-test/examples/local-test-dotnet.ps1': 'skills/local-test/templates/local-test-dotnet.ps1',
  'skills/local-test/examples/docker-compose-dotnet.yml': 'skills/local-test/templates/docker-compose-dotnet.yml',
};
const EDITED_OLD = 'skills/local-test/examples/local-test-dotnet.ps1';
const SUBSTITUTED_OLD = 'skills/local-test/examples/docker-compose-dotnet.yml';

function installedProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'renamed-e2e-'));
  const src = path.join(root, 'src');
  for (const part of ['skills', 'agents', 'hooks', 'rules', 'trackers', 'code-platform', 'templates', 'VERSION', 'CHANGELOG.md']) {
    if (fs.existsSync(path.join(REPO, part))) fs.cpSync(path.join(REPO, part), path.join(src, part), { recursive: true });
  }
  const project = path.join(root, 'project');
  fs.mkdirSync(path.join(project, '.git'), { recursive: true });
  runInstallJs(['--yes', '--project', project, '--name', 'Tester', '--project-name', 'renamed', '--local', src], root);
  return { root, src, project, claude: path.join(project, '.claude') };
}
function plantOld(claude, record) {
  for (const [old, now] of Object.entries(OLD_FILES)) {
    const dest = path.join(claude, ...old.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(claude, ...now.split('/')), dest);
  }
  fs.appendFileSync(path.join(claude, ...EDITED_OLD.split('/')), '\n# my own edit\n');
  if (record) {
    const mp = path.join(claude, '.harness-manifest.json');
    const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
    m.installedFiles = [...m.installedFiles, ...Object.keys(OLD_FILES)];
    fs.writeFileSync(mp, JSON.stringify(m, null, 2));
  }
}
const manifestFiles = (claude) => JSON.parse(fs.readFileSync(path.join(claude, '.harness-manifest.json'), 'utf8')).installedFiles;
const exists = (claude, rel) => fs.existsSync(path.join(claude, ...rel.split('/')));

test('Renamed_RunUpdateRemovesAnUnchangedOldFileAndKeepsAnEditedOneAcrossTwoUpdates (AC3, AC20)', () => {
  const { root, src, project, claude } = installedProject();
  try {
    plantOld(claude, true);
    const update = () => runInstallJs(['--update', '--project', project, '--source', src, '--local', src, '--yes'], root);
    const first = update();
    assert.ok(!exists(claude, 'skills/ralph-prd/ralph.sh'), 'an unchanged old file stayed after --update');
    assert.ok(!exists(claude, SUBSTITUTED_OLD), 'an unchanged old file whose placeholders the installer filled in stayed after --update');
    assert.ok(exists(claude, EDITED_OLD), 'an edited old file was removed by --update');
    assert.match(first, /left skills\/local-test\/examples\/local-test-dotnet\.ps1/, 'no note named the kept file');
    assert.ok(!manifestFiles(claude).includes(EDITED_OLD), 'a kept old file was recorded as the harness\'s own');

    update();
    assert.ok(exists(claude, EDITED_OLD), 'the kept file was removed by the second --update');
    assert.ok(!manifestFiles(claude).includes(EDITED_OLD), 'a kept old file is in the second manifest');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Renamed_FreshInstallOverAnOldInstallRemovesAnUnchangedOldFile (AC3, AC20)', () => {
  const { root, src, project, claude } = installedProject();
  try {
    plantOld(claude, false);
    runInstallJs(['--yes', '--project', project, '--name', 'Tester', '--project-name', 'renamed', '--local', src], root);
    assert.ok(!exists(claude, 'skills/ralph-prd/ralph.sh'), 'an unchanged old file stayed after install over it');
    assert.ok(!exists(claude, SUBSTITUTED_OLD), 'an unchanged old file whose placeholders the installer filled in stayed after install over it');
    assert.ok(exists(claude, EDITED_OLD), 'an edited old file was removed by install');
    assert.ok(!manifestFiles(claude).includes(EDITED_OLD), 'a kept old file was recorded as the harness\'s own');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
