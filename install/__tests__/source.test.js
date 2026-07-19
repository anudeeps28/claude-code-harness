'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  DEFAULT_REPO_URL,
  normalizeUpdateConfig,
  pinnedRefCandidates,
  resolveSource,
  migrateUpdateConfig,
} = require('../lib/source.js');

// Fresh throwaway temp dir per call, tracked for cleanup.
const tmpDirs = [];
function makeTmp() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cch-src-test-'));
  tmpDirs.push(d);
  return d;
}
test.after(() => {
  for (const d of tmpDirs) { try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* noop */ } }
});

// ── normalizeUpdateConfig ─────────────────────────────────────────────────────

test('normalizeUpdateConfig_Empty_FillsLatestDefaults', () => {
  const cfg = normalizeUpdateConfig(undefined);
  assert.strictEqual(cfg.channel, 'latest');
  assert.strictEqual(cfg.repoUrl, DEFAULT_REPO_URL);
  assert.strictEqual(cfg.pinnedVersion, null);
  assert.strictEqual(cfg.localPath, null);
});

test('normalizeUpdateConfig_UnknownChannel_FallsBackToLatest', () => {
  assert.strictEqual(normalizeUpdateConfig({ channel: 'bogus' }).channel, 'latest');
});

test('normalizeUpdateConfig_TrimsAndPreservesFields', () => {
  const cfg = normalizeUpdateConfig({
    channel: 'pinned', pinnedVersion: '  3.2.0 ', repoUrl: ' https://x/y ', localPath: '  ',
  });
  assert.strictEqual(cfg.channel, 'pinned');
  assert.strictEqual(cfg.pinnedVersion, '3.2.0');
  assert.strictEqual(cfg.repoUrl, 'https://x/y');
  assert.strictEqual(cfg.localPath, null); // whitespace-only → null
});

// ── pinnedRefCandidates ───────────────────────────────────────────────────────

test('pinnedRefCandidates_BareVersion_AddsVPrefixAlternate', () => {
  assert.deepStrictEqual(pinnedRefCandidates('3.2.0'), ['3.2.0', 'v3.2.0']);
});

test('pinnedRefCandidates_VPrefixed_AddsBareAlternate', () => {
  assert.deepStrictEqual(pinnedRefCandidates('v3.2.0'), ['v3.2.0', '3.2.0']);
});

// ── resolveSource: local channel ──────────────────────────────────────────────

test('resolveSource_Local_ReturnsPathWithNoopCleanup', () => {
  const dir = makeTmp();
  fs.writeFileSync(path.join(dir, 'VERSION'), '3.2.0\n');
  const src = resolveSource({ channel: 'local', localPath: dir });
  assert.strictEqual(src.dir, dir);
  assert.strictEqual(src.ephemeral, false);
  src.cleanup(); // must not throw or delete
  assert.ok(fs.existsSync(dir), 'local dir must survive cleanup');
});

test('resolveSource_LocalMissingPath_Throws', () => {
  assert.throws(() => resolveSource({ channel: 'local', localPath: null }), /localPath is not set/);
});

test('resolveSource_LocalNoVersionFile_Throws', () => {
  const dir = makeTmp(); // exists but no VERSION
  assert.throws(() => resolveSource({ channel: 'local', localPath: dir }), /no VERSION file/);
});

// ── resolveSource: latest/pinned via injected fake git ────────────────────────

// Fake git that "clones" by writing a VERSION file into the target dir.
function fakeGitSuccess(version = '9.9.9') {
  return (args) => {
    const target = args[args.length - 1];
    fs.writeFileSync(path.join(target, 'VERSION'), `${version}\n`);
    return { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') };
  };
}

test('resolveSource_Latest_ClonesToTempAndCleansUp', () => {
  const src = resolveSource(
    { channel: 'latest' },
    { runGit: fakeGitSuccess(), mkTempDir: makeTmp },
  );
  assert.strictEqual(src.ephemeral, true);
  assert.ok(fs.existsSync(path.join(src.dir, 'VERSION')));
  src.cleanup();
  assert.ok(!fs.existsSync(src.dir), 'ephemeral dir must be removed by cleanup');
});

test('resolveSource_Latest_UsesShallowCloneNoBranch', () => {
  let captured;
  resolveSource({ channel: 'latest' }, {
    runGit: (args) => { captured = args; return fakeGitSuccess()(args); },
    mkTempDir: makeTmp,
  });
  assert.ok(captured.includes('--depth') && captured.includes('1'), 'must be a shallow clone');
  assert.ok(!captured.includes('--branch'), 'latest must not pin a branch');
});

test('resolveSource_Pinned_PassesBranchTag', () => {
  let captured;
  resolveSource({ channel: 'pinned', pinnedVersion: '3.2.0' }, {
    runGit: (args) => { captured = args; return fakeGitSuccess()(args); },
    mkTempDir: makeTmp,
  });
  const bi = captured.indexOf('--branch');
  assert.ok(bi !== -1, 'pinned must pass --branch');
  assert.strictEqual(captured[bi + 1], '3.2.0');
});

test('resolveSource_Pinned_RetriesVPrefixOnFirstFailure', () => {
  const tried = [];
  const runGit = (args) => {
    const bi = args.indexOf('--branch');
    const ref = args[bi + 1];
    tried.push(ref);
    if (ref === '3.2.0') return { status: 128, stdout: Buffer.from(''), stderr: Buffer.from('not found') };
    // second candidate succeeds
    const target = args[args.length - 1];
    fs.writeFileSync(path.join(target, 'VERSION'), '3.2.0\n');
    return { status: 0, stdout: Buffer.from(''), stderr: Buffer.from('') };
  };
  const src = resolveSource({ channel: 'pinned', pinnedVersion: '3.2.0' }, { runGit, mkTempDir: makeTmp });
  assert.deepStrictEqual(tried, ['3.2.0', 'v3.2.0']);
  assert.ok(fs.existsSync(path.join(src.dir, 'VERSION')));
});

test('resolveSource_CloneFails_ThrowsWithStderr', () => {
  const runGit = () => ({ status: 128, stdout: Buffer.from(''), stderr: Buffer.from('Could not resolve host') });
  assert.throws(
    () => resolveSource({ channel: 'latest' }, { runGit, mkTempDir: makeTmp }),
    /Could not fetch the latest version.*Could not resolve host/s,
  );
});

test('resolveSource_PinnedNoVersion_Throws', () => {
  assert.throws(
    () => resolveSource({ channel: 'pinned', pinnedVersion: null }, { runGit: fakeGitSuccess(), mkTempDir: makeTmp }),
    /pinnedVersion is not set/,
  );
});

// ── migrateUpdateConfig ───────────────────────────────────────────────────────

test('migrateUpdateConfig_LegacyManifest_AddsUpdateBlockRemovesRepoPath', () => {
  const legacy = {
    schemaVersion: 1,
    harnessVersion: '3.1.0',
    answers: { userName: 'Alex', harnessRepoPath: '/nonexistent/path' },
  };
  const { changed, manifest } = migrateUpdateConfig(legacy);
  assert.strictEqual(changed, true);
  assert.ok(manifest.update);
  assert.strictEqual(manifest.schemaVersion, 2, 'schemaVersion bumped to 2');
  assert.strictEqual(manifest.update.channel, 'latest');
  assert.strictEqual(manifest.update.repoUrl, DEFAULT_REPO_URL);
  assert.strictEqual(manifest.answers.harnessRepoPath, undefined);
  assert.strictEqual(manifest.answers.userName, 'Alex', 'other answers preserved');
});

test('migrateUpdateConfig_Immutable_DoesNotMutateInput', () => {
  const legacy = { answers: { harnessRepoPath: '/x' } };
  migrateUpdateConfig(legacy);
  assert.strictEqual(legacy.answers.harnessRepoPath, '/x', 'input must be untouched');
});

test('migrateUpdateConfig_AlreadyMigrated_NoChange', () => {
  const m = { update: { channel: 'latest', repoUrl: DEFAULT_REPO_URL, pinnedVersion: null, localPath: null } };
  const { changed, manifest } = migrateUpdateConfig(m);
  assert.strictEqual(changed, false);
  assert.strictEqual(manifest, m);
});

test('migrateUpdateConfig_PreservesForkRemoteUrl', () => {
  const dir = makeTmp();
  fs.writeFileSync(path.join(dir, 'VERSION'), '3.1.0\n');
  const legacy = { answers: { harnessRepoPath: dir } };
  const runGit = (args) => {
    if (args.includes('remote')) {
      return { status: 0, stdout: Buffer.from('https://github.com/fork/harness.git\n'), stderr: Buffer.from('') };
    }
    return { status: 1, stdout: Buffer.from(''), stderr: Buffer.from('') };
  };
  const { manifest } = migrateUpdateConfig(legacy, { runGit });
  assert.strictEqual(manifest.update.repoUrl, 'https://github.com/fork/harness');
});
