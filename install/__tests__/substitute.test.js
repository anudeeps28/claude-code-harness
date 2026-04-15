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
