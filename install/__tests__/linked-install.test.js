'use strict';

// A linked install (`npm run dogfood`): .claude/<dir> is a symlink into the harness source, so the
// source IS the live install. An update must never write through those links — copying a source dir
// onto itself crashed the installer half-way (after it had already archived tasks/todo.md), and the
// placeholder substitution, orphan removal and pack pruning that follow would rewrite or delete the
// harness's own source files.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { walk } = require('../../hooks/lib/walk.js');
const { runCheck, linkedDirs } = require('../lib/updater.js');

const REPO = path.resolve(__dirname, '..', '..');
const INSTALL_JS = path.join(REPO, 'install', 'install.js');
const SOURCE_PARTS = ['skills', 'agents', 'hooks', 'rules', 'trackers', 'code-platform', 'templates', 'VERSION', 'CHANGELOG.md'];
const LINKED = ['skills', 'agents', 'hooks', 'rules'];

// HOME points into the test's temp root: an update writes its snapshot under ~/.claude and prunes
// all but the newest three, so a test run must never touch the person's real snapshots.
function runInstallJs(args, home) {
  return execFileSync('node', [INSTALL_JS, ...args], {
    timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'], input: '', encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
}

// A private copy of the source, so a failing update can only damage the copy, never this repo.
function makeSource(root) {
  const src = path.join(root, 'src');
  for (const part of SOURCE_PARTS) {
    const from = path.join(REPO, part);
    if (fs.existsSync(from)) fs.cpSync(from, path.join(src, part), { recursive: true });
  }
  return src;
}

function hashTree(dir) {
  const h = crypto.createHash('sha256');
  for (const f of walk(dir, { match: () => true })) {
    h.update(path.relative(dir, f));
    h.update(fs.readFileSync(f));
  }
  return h.digest('hex');
}

// Install normally, then turn the four static dirs into symlinks into `src`, as scripts/dogfood.js does.
function makeLinkedInstall() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'linked-install-'));
  const src = makeSource(root);
  const project = path.join(root, 'project');
  fs.mkdirSync(path.join(project, '.git'), { recursive: true });
  runInstallJs(['--yes', '--project', project, '--name', 'Tester', '--project-name', 'linked', '--local', src], root);
  const claudeDir = path.join(project, '.claude');
  for (const d of LINKED) {
    fs.rmSync(path.join(claudeDir, d), { recursive: true, force: true });
    fs.symlinkSync(path.join('..', '..', 'src', d), path.join(claudeDir, d));
  }
  return { root, src, project, claudeDir };
}

test('LinkedInstall_LinkedDirsNamesEverySymlinkedManagedDir', () => {
  const { root, claudeDir } = makeLinkedInstall();
  try {
    const linked = linkedDirs(claudeDir);
    for (const d of LINKED) assert.ok(linked.has(d), `${d} is reported as linked`);
    assert.ok(!linked.has('trackers/active'), 'a copied dir is not reported as linked');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('LinkedInstall_UpdateSucceedsAndLeavesTheSourceUntouched', () => {
  const { root, src, project, claudeDir } = makeLinkedInstall();
  try {
    // An old manifest crossing into the modes era, with a todo.md the crossing archives.
    const manifestPath = path.join(claudeDir, '.harness-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    delete manifest.trackerMirror;
    manifest.harnessVersion = '0.0.1';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    fs.mkdirSync(path.join(project, 'tasks'), { recursive: true });
    fs.writeFileSync(path.join(project, 'tasks', 'todo.md'), '# mine\n');

    const before = Object.fromEntries(LINKED.map((d) => [d, hashTree(path.join(src, d))]));
    assert.ok(walk(path.join(src, 'skills'), { match: () => true }).length > 0, 'companion: the source copy has skills');

    const out = runInstallJs(['--update', '--project', project, '--source', src, '--local', src, '--yes'], root);

    for (const d of LINKED) {
      assert.strictEqual(hashTree(path.join(src, d)), before[d], `source ${d}/ is unchanged by the update`);
      assert.ok(fs.lstatSync(path.join(claudeDir, d)).isSymbolicLink(), `.claude/${d} is still a link`);
    }
    assert.match(out, /Linked:\s+skills/, 'the update says it left the linked dirs alone');
    // The source holds every pack's skills, so a linked solo install sees enterprise ones by design.
    assert.ok(fs.existsSync(path.join(claudeDir, 'skills', 'sprint-plan')), 'companion: an enterprise skill is visible through the link');
    assert.doesNotMatch(out, /\[PACK\]/, 'no pack warning for skills reached through a link');
    assert.doesNotMatch(out, /verification FAILED/, 'the linked install verifies clean');

    const after = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const version = fs.readFileSync(path.join(src, 'VERSION'), 'utf8').trim();
    assert.strictEqual(after.harnessVersion, version, 'the manifest records the new version');
    assert.ok(!after.installedFiles.some((f) => LINKED.some((d) => f.startsWith(`${d}/`))),
      'files reached through a link are not recorded as installed copies');
    assert.ok(after.installedFiles.some((f) => f.startsWith('trackers/active/')), 'companion: copied files are still recorded');
    assert.ok(fs.existsSync(path.join(project, 'tasks', 'todo-manual-backup.md')), 'the modes crossing still archives todo.md');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('LinkedInstall_CheckReportsNoDriftOrOrphansThroughALink', () => {
  const { root, src, claudeDir } = makeLinkedInstall();
  try {
    // A manifest from before the link: it lists the linked files as copies, including one whose
    // source has since been deleted. Neither is drift nor an orphan — the link always serves the source.
    const manifestPath = path.join(claudeDir, '.harness-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const skillFile = manifest.installedFiles.find((f) => f.startsWith('skills/') && f.endsWith('SKILL.md'));
    assert.ok(skillFile, 'companion: the base install recorded skill files');
    manifest.installedFiles.push('skills/long-gone/SKILL.md');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = runCheck(claudeDir, { sourceDir: src });
    assert.ok(!result.error, `check ran: ${result.message || ''}`);
    const throughLink = (f) => LINKED.some((d) => f.startsWith(`${d}/`));
    assert.deepStrictEqual(result.drifted.filter(throughLink), [], 'no drift reported through a link');
    assert.deepStrictEqual(result.orphans.filter(throughLink), [], 'no orphans reported through a link');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
