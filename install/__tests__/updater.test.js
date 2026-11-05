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
