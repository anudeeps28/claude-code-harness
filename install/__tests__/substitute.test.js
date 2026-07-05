'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildSubstitutions,
  substituteInFile,
  toUnixPath,
  toWinPath,
  buildSettings,
  buildManifest,
  MANIFEST_SCHEMA_VERSION,
  reconcileSettings,
  isHarnessHook,
  runCheck,
  backfillManifest,
} = require('../install.js');

// ── buildSubstitutions ────────────────────────────────────────────────────────

test('buildSubstitutions_ProjectRootCompoundKey_OrderedBeforeBareKey', () => {
  // Critical: the "YOUR_PROJECT_ROOT/.claude/hooks" entry must appear before the
  // bare "YOUR_PROJECT_ROOT" entry, otherwise the bare key swallows the prefix
  // and the hooks path is corrupted.
  const subs = buildSubstitutions({
    hooksUnix: '/home/a/.claude/hooks',
    hooksWin: 'C:\\Users\\a\\.claude\\hooks',
    projectRootBash: '/home/a/app',
    projectName: 'App', userName: 'Alex',
    adoProject: 'YOUR_ADO_PROJECT', adoRepo: 'YOUR_ADO_REPO', adoOrgPath: 'YOUR_ADO_ORG_PATH',
    orgName: 'YOUR_ORG', leadDev: 'YOUR_LEAD_DEV', infraPerson: 'YOUR_INFRA_PERSON',
    devopsPerson: 'YOUR_DEVOPS_PERSON', qaPerson: 'YOUR_QA_PERSON',
    harnessRepoPath: '/home/a/harness', workRoot: '', isGlobal: false,
  });
  const keys = subs.map(([k]) => k);
  const compoundIdx = keys.indexOf('YOUR_PROJECT_ROOT/.claude/hooks');
  const bareIdx = keys.indexOf('YOUR_PROJECT_ROOT');
  assert.ok(compoundIdx >= 0, 'compound key present');
  assert.ok(bareIdx >= 0, 'bare key present');
  assert.ok(compoundIdx < bareIdx, 'compound must precede bare key');
});

test('buildSubstitutions_GlobalWithWorkRoot_IncludesWorkFolderEntry', () => {
  const subs = buildSubstitutions({
    hooksUnix: '', hooksWin: '', projectRootBash: '',
    projectName: '', userName: '',
    adoProject: '', adoRepo: '', adoOrgPath: '',
    orgName: '', leadDev: '', infraPerson: '', devopsPerson: '', qaPerson: '',
    harnessRepoPath: '', workRoot: 'D:\\work', isGlobal: true,
  });
  const pair = subs.find(([k]) => k === 'C:\\YOUR_WORK_FOLDER');
  assert.ok(pair, 'work folder substitution present when global + workRoot set');
  assert.equal(pair[1], 'D:\\work');
});

test('buildSubstitutions_ProjectMode_NoWorkFolderEntry', () => {
  const subs = buildSubstitutions({
    hooksUnix: '', hooksWin: '', projectRootBash: '',
    projectName: '', userName: '',
    adoProject: '', adoRepo: '', adoOrgPath: '',
    orgName: '', leadDev: '', infraPerson: '', devopsPerson: '', qaPerson: '',
    harnessRepoPath: '', workRoot: '', isGlobal: false,
  });
  assert.equal(subs.find(([k]) => k === 'C:\\YOUR_WORK_FOLDER'), undefined);
});

// ── substituteInFile ─────────────────────────────────────────────────────────

test('substituteInFile_SingleFileWithAllPlaceholders_AllReplaced', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
  const file = path.join(dir, 'sample.md');
  fs.writeFileSync(file,
    'User: YOUR_NAME\n' +
    'Project: YOUR_PROJECT_NAME\n' +
    'Hooks: YOUR_PROJECT_ROOT/.claude/hooks/safety-check.js\n' +
    'Root: YOUR_PROJECT_ROOT\n',
  );
  const subs = buildSubstitutions({
    hooksUnix: '/h/hooks', hooksWin: 'C:\\h',
    projectRootBash: '/proj',
    projectName: 'MyApp', userName: 'Alex',
    adoProject: '', adoRepo: '', adoOrgPath: '',
    orgName: '', leadDev: '', infraPerson: '', devopsPerson: '', qaPerson: '',
    harnessRepoPath: '', workRoot: '', isGlobal: false,
  });
  substituteInFile(file, subs);
  const out = fs.readFileSync(file, 'utf8');
  assert.match(out, /User: Alex/);
  assert.match(out, /Project: MyApp/);
  assert.match(out, /Hooks: \/h\/hooks\/safety-check\.js/);
  assert.match(out, /Root: \/proj/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('substituteInFile_CompoundKeyNotShadowedByBareKey_HooksPathIntact', () => {
  // Regression guard for the ordering bug described above.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
  const file = path.join(dir, 'settings.md');
  fs.writeFileSync(file, 'node "YOUR_PROJECT_ROOT/.claude/hooks/safety-check.js"\n');
  const subs = buildSubstitutions({
    hooksUnix: '/home/a/.claude/hooks',
    hooksWin: 'C:\\x', projectRootBash: '/home/a/myapp',
    projectName: '', userName: '',
    adoProject: '', adoRepo: '', adoOrgPath: '',
    orgName: '', leadDev: '', infraPerson: '', devopsPerson: '', qaPerson: '',
    harnessRepoPath: '', workRoot: '', isGlobal: false,
  });
  substituteInFile(file, subs);
  const out = fs.readFileSync(file, 'utf8');
  assert.equal(out.trim(), 'node "/home/a/.claude/hooks/safety-check.js"');
  assert.ok(!out.includes('/home/a/myapp/.claude/hooks'),
    'bare YOUR_PROJECT_ROOT must NOT have shadowed the compound key');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('substituteInFile_NoPlaceholders_FileNotRewritten', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'install-test-'));
  const file = path.join(dir, 'plain.md');
  fs.writeFileSync(file, 'no placeholders here\n');
  const beforeMtime = fs.statSync(file).mtimeMs;
  // Force a millisecond gap so any rewrite would be visible.
  const subs = buildSubstitutions({
    hooksUnix: '', hooksWin: '', projectRootBash: '',
    projectName: 'X', userName: 'Y',
    adoProject: '', adoRepo: '', adoOrgPath: '',
    orgName: '', leadDev: '', infraPerson: '', devopsPerson: '', qaPerson: '',
    harnessRepoPath: '', workRoot: '', isGlobal: false,
  });
  substituteInFile(file, subs);
  const afterMtime = fs.statSync(file).mtimeMs;
  assert.equal(beforeMtime, afterMtime, 'file should not be rewritten when no placeholders match');
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── Path conversion ──────────────────────────────────────────────────────────

test('toUnixPath_WindowsDriveLetter_ConvertsToGitBashStyle', () => {
  // Simulating a Windows path even on Unix hosts — function short-circuits on
  // non-win32, so assert conditionally.
  if (process.platform === 'win32') {
    assert.equal(toUnixPath('C:\\Users\\foo\\.claude\\hooks'), '/c/Users/foo/.claude/hooks');
  } else {
    // On Unix, Node paths are already unix-style — function returns as-is.
    assert.equal(toUnixPath('/home/a/.claude/hooks'), '/home/a/.claude/hooks');
  }
});

test('toWinPath_UnixStyleGitBashPath_ConvertsToBackslashed', () => {
  assert.equal(toWinPath('/c/Users/foo/.claude/hooks'), 'C:\\Users\\foo\\.claude\\hooks');
});

// ── buildSettings ────────────────────────────────────────────────────────────

test('buildSettings_GlobalWithWorkRoot_EnvBlockPresent', () => {
  const s = buildSettings({
    hooksUnix: '/h',
    workflowPack: 'enterprise',
    sessionStartMsg: 'hi',
    workRoot: 'D:\\work',
    isGlobal: true,
  });
  assert.equal(s.env.CLAUDE_HARNESS_WORK_ROOT, 'D:\\work');
  assert.ok(s.hooks.PreToolUse);
});

test('buildSettings_ProjectMode_NoEnvBlock', () => {
  const s = buildSettings({
    hooksUnix: '/h',
    workflowPack: 'solo',
    sessionStartMsg: 'hi',
    workRoot: '',
    isGlobal: false,
  });
  assert.equal(s.env, undefined);
});

test('buildSettings_HookCommandsReferenceHooksUnix', () => {
  const s = buildSettings({
    hooksUnix: '/my/hooks',
    workflowPack: 'solo',
    sessionStartMsg: 'hi',
    workRoot: '',
    isGlobal: false,
  });
  const safety = s.hooks.PreToolUse[0].hooks[0].command;
  assert.equal(safety, 'node "/my/hooks/safety-check.js"');
});

test('buildSettings_SessionStart_IncludesStartMsgAndRouterAndContext', () => {
  const s = buildSettings({
    hooksUnix: '/h',
    workflowPack: 'solo',
    sessionStartMsg: 'hi',
    workRoot: '',
    isGlobal: false,
  });
  const cmds = s.hooks.SessionStart[0].hooks.map(h => h.command);
  assert.ok(cmds.includes('node "/h/session-start-msg.js"'), 'session-start-msg hook present');
  assert.ok(cmds.includes('node "/h/session-context.js"'), 'session-context hook preserved');
  assert.ok(cmds.includes('node "/h/session-router.js"'), 'session-router wired');
  assert.equal(cmds.length, 3);
});

test('buildSettings_SerializesToValidJson', () => {
  // Guard: if someone accidentally injects an unescaped backslash via template
  // interpolation, JSON.stringify would throw or produce invalid output.
  const s = buildSettings({
    hooksUnix: 'C:\\Users\\a\\hooks', // contains backslashes
    workflowPack: 'solo',
    sessionStartMsg: 'test',
    workRoot: '',
    isGlobal: false,
  });
  const json = JSON.stringify(s);
  assert.doesNotThrow(() => JSON.parse(json));
  const roundTripped = JSON.parse(json);
  assert.equal(roundTripped.hooks.PreToolUse[0].hooks[0].command,
    'node "C:\\Users\\a\\hooks/safety-check.js"');
});

// ── buildManifest ────────────────────────────────────────────────────────────

test('buildManifest_ContainsAllRequiredFields', () => {
  const m = buildManifest({
    harnessVersion: '2.0.0',
    installMode: 'project',
    workflowPack: 'solo',
    tracker: 'github',
    prdMode: 'file',
    answers: { userName: 'Alex', projectName: 'App' },
    installedFiles: ['skills/implement/SKILL.md', 'hooks/safety-check.js'],
    now: '2026-07-04T00:00:00.000Z',
  });
  assert.equal(m.schemaVersion, MANIFEST_SCHEMA_VERSION);
  assert.equal(m.harnessVersion, '2.0.0');
  assert.equal(m.installMode, 'project');
  assert.equal(m.workflowPack, 'solo');
  assert.equal(m.tracker, 'github');
  assert.equal(m.prdMode, 'file');
  assert.deepStrictEqual(m.answers, { userName: 'Alex', projectName: 'App' });
  assert.deepStrictEqual(m.installedFiles, ['skills/implement/SKILL.md', 'hooks/safety-check.js']);
  assert.equal(m.installedAt, '2026-07-04T00:00:00.000Z');
  assert.equal(m.updatedAt, '2026-07-04T00:00:00.000Z');
});

test('buildManifest_SerializesToValidJson', () => {
  const m = buildManifest({
    harnessVersion: '2.0.0', installMode: 'global', workflowPack: 'enterprise',
    tracker: 'ado', prdMode: 'both-file-canonical',
    answers: { userName: 'Test' }, installedFiles: [], now: new Date().toISOString(),
  });
  const json = JSON.stringify(m, null, 2);
  assert.doesNotThrow(() => JSON.parse(json));
});

// ── isHarnessHook ────────────────────────────────────────────────────────────

test('isHarnessHook_SafetyCheck_True', () => {
  assert.ok(isHarnessHook({ type: 'command', command: 'node "/home/a/.claude/hooks/safety-check.js"' }));
});

test('isHarnessHook_SessionStartEcho_True', () => {
  assert.ok(isHarnessHook({ type: 'command', command: 'echo "SESSION START: read tasks/notes.md"' }));
});

test('isHarnessHook_UserHook_False', () => {
  assert.ok(!isHarnessHook({ type: 'command', command: 'npx prettier --write "$TOOL_INPUT_FILE"' }));
});

// ── reconcileSettings ────────────────────────────────────────────────────────

test('reconcileSettings_PreservesUserEnvAndPermissions', () => {
  const existing = {
    env: { CLAUDE_HARNESS_WORK_ROOT: '/work', MY_VAR: 'value' },
    permissions: { allow: ['Bash(npm test)'] },
    hooks: {
      PreToolUse: [{ matcher: 'Bash|Write', hooks: [
        { type: 'command', command: 'node "/old/hooks/safety-check.js"' },
      ] }],
    },
  };
  const newHarness = buildSettings({ hooksUnix: '/new/hooks', sessionStartMsg: 'hi', workRoot: '', isGlobal: false });
  const result = reconcileSettings(existing, newHarness);
  assert.equal(result.env.MY_VAR, 'value', 'user env preserved');
  assert.deepStrictEqual(result.permissions, { allow: ['Bash(npm test)'] }, 'permissions preserved');
  // Safety check command should use the new path
  const preToolHooks = result.hooks.PreToolUse[0].hooks;
  assert.ok(preToolHooks.some(h => h.command.includes('/new/hooks/safety-check.js')), 'new hook path used');
  assert.ok(!preToolHooks.some(h => h.command.includes('/old/hooks/')), 'old hook path removed');
});

test('reconcileSettings_PreservesUserHooksInSameEvent', () => {
  const existing = {
    hooks: {
      PostToolUse: [{
        matcher: 'Write|Edit',
        hooks: [
          { type: 'command', command: 'node "/old/hooks/drift-check.js"' },
          { type: 'command', command: 'npx prettier --write "$TOOL_INPUT_FILE"' },
        ],
      }],
    },
  };
  const newHarness = buildSettings({ hooksUnix: '/new/hooks', sessionStartMsg: 'hi', workRoot: '', isGlobal: false });
  const result = reconcileSettings(existing, newHarness);
  const postToolHooks = result.hooks.PostToolUse[0].hooks;
  assert.ok(postToolHooks.some(h => h.command.includes('prettier')), 'user hook preserved');
  assert.ok(postToolHooks.some(h => h.command.includes('/new/hooks/catalog-trigger.js')), 'new harness hook present');
  assert.ok(!postToolHooks.some(h => h.command.includes('/old/hooks/')), 'old harness hook removed');
});

test('reconcileSettings_UpgradesFromSingleSessionStartToFull', () => {
  // Simulates an install.sh-era install that only had 1 SessionStart hook (the echo)
  const existing = {
    hooks: {
      SessionStart: [{ matcher: '*', hooks: [
        { type: 'command', command: 'echo "SESSION START: Before doing anything else"' },
      ] }],
    },
  };
  const newHarness = buildSettings({ hooksUnix: '/h', sessionStartMsg: 'hi', workRoot: '', isGlobal: false });
  const result = reconcileSettings(existing, newHarness);
  const sessionHooks = result.hooks.SessionStart[0].hooks;
  assert.equal(sessionHooks.length, 3, 'upgraded to 3 SessionStart hooks');
  assert.ok(sessionHooks.some(h => h.command.includes('session-start-msg.js')));
  assert.ok(sessionHooks.some(h => h.command.includes('session-context.js')));
  assert.ok(sessionHooks.some(h => h.command.includes('session-router.js')));
});

test('reconcileSettings_PreservesUserHooksOnDifferentMatcher', () => {
  const existing = {
    hooks: {
      PreToolUse: [
        { matcher: 'Bash|Write', hooks: [{ type: 'command', command: 'node "/old/hooks/safety-check.js"' }] },
        { matcher: 'Agent', hooks: [{ type: 'command', command: 'my-custom-validator' }] },
      ],
    },
  };
  const newHarness = buildSettings({ hooksUnix: '/h', sessionStartMsg: 'hi', workRoot: '', isGlobal: false });
  const result = reconcileSettings(existing, newHarness);
  assert.ok(result.hooks.PreToolUse.some(g => g.matcher === 'Agent'), 'user group on different matcher preserved');
});

// ── runCheck ─────────────────────────────────────────────────────────────────

test('runCheck_NoManifest_ReturnsNoManifestError', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-test-'));
  try {
    const result = runCheck(dir);
    assert.equal(result.error, 'no-manifest');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runCheck_InvalidManifest_ReturnsInvalidManifestError', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-test-'));
  try {
    fs.writeFileSync(path.join(dir, '.harness-manifest.json'), 'not json', 'utf8');
    const result = runCheck(dir);
    assert.equal(result.error, 'invalid-manifest');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('runCheck_ValidManifest_ReturnsVersionInfo', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'check-test-'));
  const REPO = path.resolve(__dirname, '../..');
  try {
    const manifest = {
      schemaVersion: 1,
      harnessVersion: '1.0.0',
      installMode: 'project',
      workflowPack: 'solo',
      tracker: 'github',
      prdMode: 'file',
      answers: { harnessRepoPath: REPO },
      installedFiles: ['skills/implement/SKILL.md', 'hooks/safety-check.js'],
      installedAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    fs.writeFileSync(path.join(dir, '.harness-manifest.json'), JSON.stringify(manifest), 'utf8');
    const result = runCheck(dir);
    assert.ok(!result.error, 'no error for valid manifest');
    assert.equal(result.currentVersion, '1.0.0');
    assert.ok(result.latestVersion, 'latestVersion present');
    assert.ok(typeof result.behind === 'number', 'behind is a number');
    assert.ok(Array.isArray(result.orphans), 'orphans is an array');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ── backfillManifest ─────────────────────────────────────────────────────────

test('backfillManifest_DetectsSoloPackWhenNoEnterpriseAgents', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-test-'));
  try {
    fs.mkdirSync(path.join(dir, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'agents', 'evaluator-agent.md'), '# test', 'utf8');
    fs.mkdirSync(path.join(dir, 'skills', 'implement'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'skills', 'implement', 'SKILL.md'), '# test', 'utf8');
    const { manifest, detected } = backfillManifest(dir, { harnessVersion: '2.0.0' });
    assert.equal(detected.workflowPack, 'solo');
    assert.equal(manifest.workflowPack, 'solo');
    assert.ok(manifest.installedFiles.includes('agents/evaluator-agent.md'));
    assert.ok(fs.existsSync(path.join(dir, '.harness-manifest.json')));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('backfillManifest_DetectsEnterprisePackWhenEnterpriseAgentsPresent', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-test-'));
  try {
    fs.mkdirSync(path.join(dir, 'agents'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'agents', 'story-understand-agent.md'), '# test', 'utf8');
    const { detected } = backfillManifest(dir, { harnessVersion: '2.0.0' });
    assert.equal(detected.workflowPack, 'enterprise');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('backfillManifest_DetectsGitHubTrackerByDefault', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-test-'));
  try {
    fs.mkdirSync(path.join(dir, 'trackers/active'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'trackers/active', 'get-issue.sh'), '#!/bin/bash\ngh issue view "$1"', 'utf8');
    const { detected } = backfillManifest(dir, { harnessVersion: '2.0.0' });
    assert.equal(detected.tracker, 'github');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('backfillManifest_DetectsTodoistTracker', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-test-'));
  try {
    fs.mkdirSync(path.join(dir, 'trackers/active'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'trackers/active', 'get-issue.sh'), '#!/bin/bash\ntd task view "$1"', 'utf8');
    const { detected } = backfillManifest(dir, { harnessVersion: '2.0.0' });
    assert.equal(detected.tracker, 'todoist');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('backfillManifest_DetectsAdoTracker', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'backfill-test-'));
  try {
    fs.mkdirSync(path.join(dir, 'trackers/active'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'trackers/active', 'get-issue.sh'), '#!/bin/bash\naz boards work-item show --id "$1"', 'utf8');
    const { detected } = backfillManifest(dir, { harnessVersion: '2.0.0' });
    assert.equal(detected.tracker, 'ado');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
