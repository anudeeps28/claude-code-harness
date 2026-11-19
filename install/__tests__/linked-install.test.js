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
const LINKED = ['skills', 'agents', 'hooks', 'rules'];

// HOME points into the test's temp root: an update writes its snapshot under ~/.claude and prunes
// all but the newest three, so a test run must never touch the person's real snapshots.
function runInstallJs(args, home) {
  return execFileSync('node', [INSTALL_JS, ...args], {
    timeout: 30_000, stdio: ['pipe', 'pipe', 'pipe'], input: '', encoding: 'utf8',
    env: { ...process.env, HOME: home, USERPROFILE: home },
  });
}

// The installer is handed the real repo as its source (`--local`) and reads it itself; this test looks only at
// the installed output in a temp project. The links do not point at the real repo: the installer's own copy-mode
// install makes a private copy of the four dirs, and the links point there, so a regression in the updater's
// linked-dir handling can only damage that copy. No link may resolve under the real repo.

function hashTree(dir) {
  const h = crypto.createHash('sha256');
  for (const f of walk(dir, { match: () => true })) {
    h.update(path.relative(dir, f));
    h.update(fs.readFileSync(f));
  }
  return h.digest('hex');
}

// The link target is the installer's own private copy of the source: a copy-mode enterprise install (every pack's
// skills, as the real source holds) into a temp folder. A solo project is then installed and its four static dirs
// turned into symlinks to that copy, as scripts/dogfood.js does with the source.
function makeLinkedInstall() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'linked-install-'));
  const src = REPO;
  const linkTarget = path.join(root, 'link-target');
  const project = path.join(root, 'project');
  const copyProject = path.join(root, 'copy');
  for (const p of [project, copyProject]) fs.mkdirSync(path.join(p, '.git'), { recursive: true });
  runInstallJs(['--yes', '--project', copyProject, '--pack', 'enterprise', '--name', 'Tester', '--project-name', 'copy', '--local', src], root);
  runInstallJs(['--yes', '--project', project, '--name', 'Tester', '--project-name', 'linked', '--local', src], root);
  const claudeDir = path.join(project, '.claude');
  fs.mkdirSync(linkTarget);
  for (const d of LINKED) {
    fs.renameSync(path.join(copyProject, '.claude', d), path.join(linkTarget, d));
    fs.rmSync(path.join(claudeDir, d), { recursive: true, force: true });
    fs.symlinkSync(path.join(linkTarget, d), path.join(claudeDir, d));
  }
  return { root, src, project, claudeDir, linkTarget };
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
  const { root, src, project, claudeDir, linkTarget } = makeLinkedInstall();
  try {
    // An old manifest crossing into the modes era, with a todo.md the crossing archives.
    const manifestPath = path.join(claudeDir, '.harness-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    delete manifest.trackerMirror;
    manifest.harnessVersion = '0.0.1';
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    fs.mkdirSync(path.join(project, 'tasks'), { recursive: true });
    fs.writeFileSync(path.join(project, 'tasks', 'todo.md'), '# mine\n');

    // The linked source is looked at through the links in the installed project (they lead to the private copy).
    const before = Object.fromEntries(LINKED.map((d) => [d, hashTree(path.join(claudeDir, d))]));
    assert.ok(LINKED.every((d) => fs.realpathSync(path.join(claudeDir, d)) === fs.realpathSync(path.join(linkTarget, d))),
      'companion: the links lead to the private copy, not the real repo');
    assert.ok(walk(path.join(claudeDir, 'skills'), { match: () => true }).length > 0, 'companion: the source copy has skills');

    const out = runInstallJs(['--update', '--project', project, '--source', src, '--local', src, '--yes'], root);

    for (const d of LINKED) {
      assert.strictEqual(hashTree(path.join(claudeDir, d)), before[d], `source ${d}/ is unchanged by the update`);
      assert.ok(fs.lstatSync(path.join(claudeDir, d)).isSymbolicLink(), `.claude/${d} is still a link`);
    }
    // Nothing the update could write lies under the real repo: every link and the project itself resolve elsewhere.
    const underRepo = (p) => { const r = fs.realpathSync(p); const repo = fs.realpathSync(REPO); return r === repo || r.startsWith(repo + path.sep); };
    for (const d of LINKED) assert.ok(!underRepo(path.join(claudeDir, d)), `.claude/${d} resolves outside the real repo`);
    assert.ok(!underRepo(claudeDir), 'the installed .claude resolves outside the real repo');
    assert.match(out, /Linked:\s+skills/, 'the update says it left the linked dirs alone');
    // The source holds every pack's skills, so a linked solo install sees enterprise ones by design.
    assert.ok(fs.existsSync(path.join(claudeDir, 'skills', 'sprint-plan')), 'companion: an enterprise skill is visible through the link');
    assert.doesNotMatch(out, /\[PACK\]/, 'no pack warning for skills reached through a link');
    assert.doesNotMatch(out, /verification FAILED/, 'the linked install verifies clean');

    const after = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const version = fs.readFileSync(path.join(REPO, 'VERSION'), 'utf8').trim();
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
