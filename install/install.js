#!/usr/bin/env node
// Claude Code Kit — cross-platform installer (Windows, macOS, Linux).
// Zero runtime deps. Mirrors install.sh behaviour 1:1.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const readline = require('node:readline');
const { spawnSync } = require('node:child_process');

const { walk } = require('../hooks/lib/walk.js');

const REPO_DIR = path.resolve(__dirname, '..');
const IS_WINDOWS = process.platform === 'win32';

// ── Node version gate ────────────────────────────────────────────────────────
const major = parseInt(process.versions.node.split('.')[0], 10);
if (!Number.isFinite(major) || major < 20) {
  console.error(`  Error: Node.js >= 20 required. Found: ${process.version}`);
  console.error('  Install from https://nodejs.org');
  process.exit(1);
}

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
let mode = '';
let projectDir = '';
let uninstall = false;
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--global') mode = 'global';
  else if (a === '--project') {
    mode = 'project';
    const next = args[i + 1];
    if (next && !next.startsWith('-')) { projectDir = next; i++; }
  } else if (a === '--uninstall') uninstall = true;
  else if (a === '--dry-run') dryRun = true;
  else if (a === '--help' || a === '-h') {
    console.log(`  Usage:
    node install/install.js                     # interactive install
    node install/install.js --global            # global install
    node install/install.js --project /my/app   # project install
    node install/install.js --uninstall         # remove installed files
    node install/install.js --dry-run           # show what would be done
`);
    process.exit(0);
  } else if (!projectDir) { projectDir = a; mode = 'project'; }
}

// ── Minimal readline prompt helper ───────────────────────────────────────────
// rl/ask are only created when we actually run the installer (not on require-for-tests).
let rl = null;
const ask = (q) => new Promise((resolve) => rl.question(q, (ans) => resolve(ans)));

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('\n  claude-code-harness');
  console.log('  ────────────────────────────────────────────────────────────────\n');

  if (!mode) {
    console.log('  Install mode:\n');
    console.log('    1) Global  — skills available in every project  (~/.claude/)');
    console.log('    2) Project — install into one specific project\n');
    const choice = (await ask('  Choice [1/2]: ')).trim();
    console.log('');
    mode = choice === '1' ? 'global' : 'project';
  }

  if (mode === 'project' && !projectDir) {
    projectDir = (await ask('  Project path: ')).trim();
    console.log('');
  }

  if (mode === 'project') {
    if (!fs.existsSync(projectDir) || !fs.statSync(projectDir).isDirectory()) {
      console.error(`  Error: Directory not found: ${projectDir}`);
      process.exit(1);
    }
  }
  const target = mode === 'project'
    ? path.join(projectDir, '.claude')
    : path.join(os.homedir(), '.claude');

  // ── Uninstall ──────────────────────────────────────────────────────────────
  if (uninstall) {
    await runUninstall(target);
    rl.close();
    return;
  }

  // Git-repo warning
  if (mode === 'project' && !fs.existsSync(path.join(projectDir, '.git'))) {
    console.log(`  Warning: ${projectDir} does not appear to be a git repository.`);
    const go = (await ask('  Continue anyway? [y/N]: ')).trim().toLowerCase();
    console.log('');
    if (go !== 'y') process.exit(1);
  }

  // ── Workflow pack ──────────────────────────────────────────────────────────
  console.log('  Workflow pack:\n');
  console.log('    1) Enterprise — sprints, stories, team coordination (/story, /sprint-plan)');
  console.log('    2) Solo       — issues, simple priorities (/implement, /plan)\n');
  const packChoice = (await ask('  Choice [1/2]: ')).trim();
  console.log('');
  const workflowPack = packChoice === '2' ? 'solo' : 'enterprise';

  // ── Tracker ────────────────────────────────────────────────────────────────
  let tracker;
  if (workflowPack === 'enterprise') {
    console.log('  Issue tracker:\n');
    console.log('    1) Azure DevOps  (uses az devops CLI)');
    console.log('    2) GitHub        (uses gh CLI)\n');
    const trackerChoice = (await ask('  Choice [1/2]: ')).trim();
    console.log('');
    tracker = trackerChoice === '2' ? 'github' : 'ado';
  } else {
    tracker = 'github';
    console.log('  Tracker: GitHub (default for solo workflow)\n');
  }

  // ── Preflight ──────────────────────────────────────────────────────────────
  console.log('  Checking prerequisites...');
  let missing = 0;
  missing += checkTool('jq', 'https://jqlang.github.io/jq/download/');
  if (tracker === 'ado') missing += checkTool('az', 'https://aka.ms/installazurecli (then: az extension add --name azure-devops)');
  else missing += checkTool('gh', 'https://cli.github.com');
  if (missing > 0) {
    console.error('\n  Error: Missing prerequisites above. Install them and re-run the installer.');
    process.exit(1);
  }
  console.log('');

  // ── Personalization ────────────────────────────────────────────────────────
  console.log('  Personalization (press Enter to skip and fill in manually later):\n');
  const userName    = (await ask('    Your name                              : ')).trim() || 'YOUR_NAME';
  const projectName = (await ask('    Project name (human-readable)           : ')).trim() || 'YOUR_PROJECT_NAME';

  let adoProject = 'YOUR_ADO_PROJECT';
  let adoRepo = 'YOUR_ADO_REPO';
  let adoOrgPath = 'YOUR_ADO_ORG_PATH';
  if (workflowPack === 'enterprise' && tracker === 'ado') {
    adoProject = (await ask('    ADO project name                       : ')).trim() || adoProject;
    adoRepo    = (await ask('    ADO repo name                          : ')).trim() || adoRepo;
    adoOrgPath = (await ask('    ADO org path (sprint IterationPath)    : ')).trim() || adoOrgPath;
  }

  let orgName = 'YOUR_ORG', leadDev = 'YOUR_LEAD_DEV', infraPerson = 'YOUR_INFRA_PERSON',
      devopsPerson = 'YOUR_DEVOPS_PERSON', qaPerson = 'YOUR_QA_PERSON';
  if (workflowPack === 'enterprise') {
    console.log('');
    console.log('    Team (press Enter to skip — leaves placeholders in skill text):');
    orgName      = (await ask('    Org / company short name               : ')).trim() || orgName;
    leadDev      = (await ask('    Lead developer name (architecture)     : ')).trim() || leadDev;
    infraPerson  = (await ask('    Infrastructure / cloud person          : ')).trim() || infraPerson;
    devopsPerson = (await ask('    DevOps / CI/CD / deployments person    : ')).trim() || devopsPerson;
    qaPerson     = (await ask('    QA / UAT person                        : ')).trim() || qaPerson;
  }

  let workRoot = '';
  if (mode === 'global') {
    workRoot = (await ask('    Work root (folder containing projects) : ')).trim() || 'C:\\YOUR_WORK_FOLDER';
  }

  const harnessRepoPath = (await ask(`    Harness repo path [${REPO_DIR}]: `)).trim() || REPO_DIR;
  console.log('');

  // ── Dry run ────────────────────────────────────────────────────────────────
  if (dryRun) {
    printDryRun({ mode, target, workflowPack, tracker, userName, adoProject, adoRepo, adoOrgPath, workRoot, projectDir });
    rl.close();
    return;
  }

  // ── Overwrite warning ──────────────────────────────────────────────────────
  console.log(`  Installing to: ${target}\n`);
  const hasExisting = ['skills', 'agents', 'hooks'].some((d) => fs.existsSync(path.join(target, d)));
  if (hasExisting) {
    console.log(`  An existing installation was detected at ${target}.`);
    console.log('  Skills, agents, hooks, and rules will be overwritten with the latest versions.');
    console.log('  Task files (tasks/) will NOT be overwritten.\n');
    const go = (await ask('  Continue with upgrade? [y/N]: ')).trim().toLowerCase();
    console.log('');
    if (go !== 'y') { console.log('  Aborted.'); rl.close(); return; }
  }

  // ── Copy files ─────────────────────────────────────────────────────────────
  for (const d of ['skills', 'agents', 'hooks', 'rules', 'trackers/active']) {
    fs.mkdirSync(path.join(target, d), { recursive: true });
  }

  console.log('  Copying skills...');
  copyDirsWithLog(path.join(REPO_DIR, 'skills'), path.join(target, 'skills'), 'skills');

  console.log(`  Copying tracker adapter (${tracker})...`);
  copyGlob(path.join(REPO_DIR, 'trackers', tracker), path.join(target, 'trackers/active'), /\.sh$/);
  chmodExecutables(path.join(target, 'trackers/active'));

  const trackerLibSrc = path.join(REPO_DIR, 'trackers/lib');
  if (fs.existsSync(trackerLibSrc)) {
    fs.mkdirSync(path.join(target, 'trackers/lib'), { recursive: true });
    copyGlob(trackerLibSrc, path.join(target, 'trackers/lib'), /\.sh$/);
  }

  console.log('  Copying agents...');
  copyFilesWithLog(path.join(REPO_DIR, 'agents'), path.join(target, 'agents'), /\.md$/, 'agents');

  console.log('  Copying hooks...');
  copyFilesWithLog(path.join(REPO_DIR, 'hooks'), path.join(target, 'hooks'), null, 'hooks', /* filesOnly */ true);
  const hooksLibSrc = path.join(REPO_DIR, 'hooks/lib');
  if (fs.existsSync(hooksLibSrc)) {
    fs.mkdirSync(path.join(target, 'hooks/lib'), { recursive: true });
    copyGlob(hooksLibSrc, path.join(target, 'hooks/lib'), /\.js$/);
    console.log('    Installed: hooks/lib/');
  }

  console.log('  Copying rules...');
  copyFilesWithLog(path.join(REPO_DIR, 'rules'), path.join(target, 'rules'), /\.md$/, 'rules');

  // Task templates (project installs only)
  if (mode === 'project') {
    fs.mkdirSync(path.join(projectDir, 'tasks/stories'), { recursive: true });
    console.log(`  Copying task templates (${workflowPack} pack)...`);
    const taskTemplateDir = workflowPack === 'solo'
      ? path.join(REPO_DIR, 'templates/tasks-solo')
      : path.join(REPO_DIR, 'templates/tasks');
    copyTemplatesNoClobber(taskTemplateDir, path.join(projectDir, 'tasks'), 'tasks');
    copyTemplatesNoClobber(
      path.join(REPO_DIR, 'templates/tasks/stories'),
      path.join(projectDir, 'tasks/stories'),
      'tasks/stories',
    );
  }

  // ── Path variables for placeholders ────────────────────────────────────────
  const hooksUnix = mode === 'global'
    ? `${os.homedir().replace(/\\/g, '/')}/.claude/hooks`
    : toUnixPath(path.join(target, 'hooks'));
  const hooksWin  = toWinPath(mode === 'global'
    ? path.join(os.homedir(), '.claude', 'hooks')
    : path.join(target, 'hooks'));

  const projectRootBash = mode === 'global' ? '$(pwd)' : toUnixPath(projectDir);
  // projectRootWin is reserved for future Windows-specific placeholder expansion.

  // ── Placeholder substitution ───────────────────────────────────────────────
  console.log('');
  console.log('  Configuring placeholders...');

  const substitutions = buildSubstitutions({
    hooksUnix, hooksWin, projectRootBash,
    projectName, userName,
    adoProject, adoRepo, adoOrgPath,
    orgName, leadDev, infraPerson, devopsPerson, qaPerson,
    harnessRepoPath, workRoot, isGlobal: mode === 'global',
  });

  const sedDirs = ['skills', 'agents', 'hooks', 'rules', 'trackers']
    .map((d) => path.join(target, d))
    .filter((d) => fs.existsSync(d));
  for (const dir of sedDirs) substituteInTree(dir, substitutions);

  // ── settings.json ──────────────────────────────────────────────────────────
  console.log('  Generating settings.json...');
  const settingsFile = path.join(target, 'settings.json');
  if (fs.existsSync(settingsFile)) {
    fs.copyFileSync(settingsFile, `${settingsFile}.bak`);
    console.log('  (Backed up existing settings.json to settings.json.bak)');
  }
  const sessionStartMsg = workflowPack === 'solo'
    ? 'SESSION START: Before doing anything else — read tasks/notes.md and tasks/plan.md'
    : 'SESSION START: Before doing anything else — read tasks/lessons.md, todo.md, pr-queue.md, and flags-and-notes.md';

  const settings = buildSettings({ hooksUnix, workflowPack, sessionStartMsg, workRoot, isGlobal: mode === 'global' });
  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n', 'utf8');

  // ── Verify ─────────────────────────────────────────────────────────────────
  verifyInstall(target, sedDirs);

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log('\n  ────────────────────────────────────────────────────────────────');
  console.log('  claude-code-harness installed successfully.');
  console.log(`  Workflow pack: ${workflowPack}\n`);
  if (mode === 'global') console.log('  Skills are now available in every project on this machine.');
  else console.log(`  Skills installed in: ${projectDir}`);
  if (workflowPack === 'solo') {
    console.log("  Get started: /implement #42  or  /implement 'add dark mode'");
    console.log('  Plan your work: /plan');
  } else {
    console.log('  Get started: /story <story-id>');
    console.log('  Plan a sprint: /sprint-plan <N>');
  }
  console.log('');

  reportUnfilled({ userName, projectName, tracker, workflowPack,
    adoProject, adoRepo, adoOrgPath, orgName, leadDev, infraPerson, devopsPerson, qaPerson });

  rl.close();
}

if (require.main === module) {
  main().catch((err) => {
    console.error('  Installer failed:', err && err.stack ? err.stack : String(err));
    if (rl) rl.close();
    process.exit(1);
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function checkTool(tool, hint) {
  // spawnSync with shell:true so Windows finds .cmd shims (gh.cmd, az.cmd).
  // Tool name is a static literal, not user input — no shell-injection risk.
  const res = spawnSync(`${tool} --version`, { shell: true, stdio: 'ignore' });
  if (res.status === 0) { console.log(`  [OK]      ${tool}`); return 0; }
  console.log(`  [MISSING] ${tool} — ${hint}`);
  return 1;
}

function copyDirsWithLog(srcRoot, destRoot, label) {
  if (!fs.existsSync(srcRoot)) return;
  for (const entry of fs.readdirSync(srcRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const destPath = path.join(destRoot, entry.name);
    const existed = fs.existsSync(destPath);
    console.log(`    ${existed ? 'Updating:  ' : 'Installing:'} ${label}/${entry.name}`);
    fs.cpSync(path.join(srcRoot, entry.name), destPath, { recursive: true, force: true });
  }
}

function copyFilesWithLog(srcRoot, destRoot, nameRegex, label, filesOnly = false) {
  if (!fs.existsSync(srcRoot)) return;
  for (const entry of fs.readdirSync(srcRoot, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (nameRegex && !nameRegex.test(entry.name)) continue;
    if (filesOnly && entry.isDirectory()) continue;
    const destPath = path.join(destRoot, entry.name);
    const existed = fs.existsSync(destPath);
    console.log(`    ${existed ? 'Updating:  ' : 'Installing:'} ${label}/${entry.name}`);
    fs.copyFileSync(path.join(srcRoot, entry.name), destPath);
  }
}

function copyGlob(srcDir, destDir, regex) {
  if (!fs.existsSync(srcDir)) return;
  for (const name of fs.readdirSync(srcDir)) {
    if (!regex.test(name)) continue;
    fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
  }
}

function copyTemplatesNoClobber(srcDir, destDir, label) {
  if (!fs.existsSync(srcDir)) return;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const destPath = path.join(destDir, entry.name);
    if (fs.existsSync(destPath)) {
      console.log(`    Skipped (exists): ${label}/${entry.name}`);
    } else {
      fs.copyFileSync(path.join(srcDir, entry.name), destPath);
      console.log(`    Created: ${label}/${entry.name}`);
    }
  }
}

function chmodExecutables(dir) {
  if (IS_WINDOWS) return; // no-op on Windows
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith('.sh')) {
      try { fs.chmodSync(path.join(dir, name), 0o755); } catch { /* ignore */ }
    }
  }
}

function toUnixPath(p) {
  // /c/Users/foo for C:\Users\foo (git-bash convention) — hook commands are bash.
  if (!IS_WINDOWS) return p;
  const norm = p.replace(/\\/g, '/');
  return norm.replace(/^([a-zA-Z]):\//, (_, drv) => `/${drv.toLowerCase()}/`);
}

function toWinPath(p) {
  // Accept both native Windows paths (C:\...) and git-bash style (/c/...),
  // regardless of host OS — this runs in tests and in production on either.
  const m = p.match(/^\/([a-zA-Z])\/(.*)$/);
  if (m) return `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, '\\')}`;
  return p.replace(/\//g, '\\');
}

// Substitution is order-sensitive: the compound keys that include
// "YOUR_PROJECT_ROOT" as a prefix MUST be replaced before the bare key.
function buildSubstitutions(opts) {
  const subs = [
    ['YOUR_PROJECT_ROOT/.claude/hooks', opts.hooksUnix],
    ['YOUR_PROJECT_ROOT\\.claude\\hooks', opts.hooksWin],
    ['YOUR_PROJECT_ROOT', opts.projectRootBash],
    ['YOUR_PROJECT_NAME', opts.projectName],
    ['YOUR_NAME', opts.userName],
    ['YOUR_ADO_PROJECT', opts.adoProject],
    ['YOUR_ADO_REPO', opts.adoRepo],
    ['YOUR_ADO_ORG_PATH', opts.adoOrgPath],
    ['YOUR_ORG', opts.orgName],
    ['YOUR_LEAD_DEV', opts.leadDev],
    ['YOUR_INFRA_PERSON', opts.infraPerson],
    ['YOUR_DEVOPS_PERSON', opts.devopsPerson],
    ['YOUR_QA_PERSON', opts.qaPerson],
    ['YOUR_HARNESS_REPO_PATH', opts.harnessRepoPath],
  ];
  if (opts.isGlobal && opts.workRoot) {
    subs.push(['C:\\YOUR_WORK_FOLDER', opts.workRoot]);
  }
  return subs;
}

function substituteInTree(dir, subs) {
  const files = walk(dir, { match: (full) => /\.(md|sh|js|json|yaml|yml)$/i.test(full) });
  for (const file of files) substituteInFile(file, subs);
}

function substituteInFile(file, subs) {
  let content;
  try { content = fs.readFileSync(file, 'utf8'); } catch { return; }
  const original = content;
  for (const [key, value] of subs) content = content.split(key).join(value);
  if (content !== original) fs.writeFileSync(file, content, 'utf8');
}

function buildSettings({ hooksUnix, sessionStartMsg, workRoot, isGlobal }) {
  const nodeCmd = (script) => `node "${hooksUnix}/${script}"`;
  const settings = {
    hooks: {
      PreToolUse: [{ matcher: 'Bash|Write', hooks: [{ type: 'command', command: nodeCmd('safety-check.js') }] }],
      PostToolUse: [{
        matcher: 'Write|Edit',
        hooks: [
          { type: 'command', command: nodeCmd('catalog-trigger.js') },
          { type: 'command', command: nodeCmd('drift-check.js') },
        ],
      }],
      PreCompact: [{ matcher: '*', hooks: [{ type: 'command', command: nodeCmd('pre-compact.js') }] }],
      SessionStart: [{ matcher: '*', hooks: [{ type: 'command', command: `echo "${sessionStartMsg}"` }] }],
      SessionEnd: [{ matcher: '*', hooks: [{ type: 'command', command: nodeCmd('session-log.js') }] }],
    },
  };
  if (isGlobal && workRoot) {
    settings.env = { CLAUDE_HARNESS_WORK_ROOT: workRoot };
  }
  return settings;
}

function verifyInstall(target, sedDirs) {
  console.log('  Verifying installation...');
  let fail = 0;
  const required = [
    'skills/story/SKILL.md',
    'hooks/safety-check.js',
    'rules/code-style.md',
    'trackers/active/get-issue.sh',
    'trackers/lib/retry.sh',
  ];
  for (const rel of required) {
    if (!fs.existsSync(path.join(target, rel))) {
      console.log(`  [MISSING] ${rel}`);
      fail++;
    }
  }
  // Dev-only artefacts must not have leaked in.
  const forbidden = ['package.json', 'node_modules', 'eslint.config.js', '__tests__', 'coverage'];
  for (const name of forbidden) {
    if (fs.existsSync(path.join(target, name))) {
      console.log(`  [LEAKED]  ${name} — dev-only artefact found in install`);
      fail++;
    }
  }
  if (fail === 0) console.log('  [OK] All critical files present, no dev artefacts leaked');

  console.log('  Scanning for unresolved placeholders...');
  let orphans = 0;
  const scanExt = /\.(md|sh|js|json|yaml|yml)$/i;
  for (const dir of sedDirs) {
    const files = walk(dir, { match: (full) => scanExt.test(full) });
    for (const file of files) {
      if (orphans >= 20) break;
      let text;
      try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
      const lines = text.split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('YOUR_')) {
          console.log(`  [PLACEHOLDER] ${file}:${i + 1}: ${lines[i].trim()}`);
          orphans++;
          if (orphans >= 20) break;
        }
      }
    }
  }
  if (orphans === 0) console.log('  [OK] All placeholders resolved');
  else {
    console.log('');
    console.log(`  [WARN] ${orphans} unresolved placeholder(s) found.`);
    console.log('  Run the installer again with correct values, or edit manually.');
    console.log('  See CONFIGURE.md for the full placeholder reference.');
  }
  console.log('');
}

function reportUnfilled(opts) {
  const unfilled = [];
  if (opts.userName === 'YOUR_NAME') unfilled.push('YOUR_NAME');
  if (opts.projectName === 'YOUR_PROJECT_NAME') unfilled.push('YOUR_PROJECT_NAME');
  if (opts.tracker === 'ado') {
    if (opts.adoProject === 'YOUR_ADO_PROJECT') unfilled.push('YOUR_ADO_PROJECT');
    if (opts.adoRepo === 'YOUR_ADO_REPO') unfilled.push('YOUR_ADO_REPO');
    if (opts.adoOrgPath === 'YOUR_ADO_ORG_PATH') unfilled.push('YOUR_ADO_ORG_PATH');
  }
  if (opts.workflowPack === 'enterprise') {
    if (opts.orgName === 'YOUR_ORG') unfilled.push('YOUR_ORG');
    if (opts.leadDev === 'YOUR_LEAD_DEV') unfilled.push('YOUR_LEAD_DEV');
    if (opts.infraPerson === 'YOUR_INFRA_PERSON') unfilled.push('YOUR_INFRA_PERSON');
    if (opts.devopsPerson === 'YOUR_DEVOPS_PERSON') unfilled.push('YOUR_DEVOPS_PERSON');
    if (opts.qaPerson === 'YOUR_QA_PERSON') unfilled.push('YOUR_QA_PERSON');
  }
  if (unfilled.length) {
    console.log(`  Note: Some values were left at their defaults: ${unfilled.join(' ')}`);
    console.log('  See CONFIGURE.md to fill them in manually.\n');
  }
}

function printDryRun(ctx) {
  console.log('  ── DRY RUN (no files will be modified) ──\n');
  console.log(`  Mode:          ${ctx.mode}`);
  console.log(`  Target:        ${ctx.target}`);
  console.log(`  Workflow pack: ${ctx.workflowPack}`);
  console.log(`  Tracker:       ${ctx.tracker}`);
  console.log(`  User:          ${ctx.userName}`);
  if (ctx.tracker === 'ado') {
    console.log(`  ADO project:   ${ctx.adoProject}`);
    console.log(`  ADO repo:      ${ctx.adoRepo}`);
    console.log(`  ADO org path:  ${ctx.adoOrgPath}`);
  }
  if (ctx.mode === 'global') console.log(`  Work root:     ${ctx.workRoot}`);
  console.log('');
  const count = (p, m = () => true) => {
    if (!fs.existsSync(p)) return 0;
    return fs.readdirSync(p, { withFileTypes: true }).filter(m).length;
  };
  const skillCount   = count(path.join(REPO_DIR, 'skills'),  (e) => e.isDirectory());
  const agentCount   = count(path.join(REPO_DIR, 'agents'),  (e) => e.isFile() && e.name.endsWith('.md'));
  const hookCount    = count(path.join(REPO_DIR, 'hooks'),   (e) => e.isFile());
  const ruleCount    = count(path.join(REPO_DIR, 'rules'),   (e) => e.isFile() && e.name.endsWith('.md'));
  const trackerCount = count(path.join(REPO_DIR, 'trackers', ctx.tracker), (e) => e.isFile() && e.name.endsWith('.sh'));
  console.log('  Would copy:');
  console.log(`    ${skillCount} skills → ${ctx.target}/skills/`);
  console.log(`    ${agentCount} agents → ${ctx.target}/agents/`);
  console.log(`    ${hookCount} hooks → ${ctx.target}/hooks/`);
  console.log(`    ${ruleCount} rules → ${ctx.target}/rules/`);
  console.log(`    ${trackerCount} tracker scripts (${ctx.tracker}) → ${ctx.target}/trackers/active/`);
  if (ctx.mode === 'project') console.log(`    task templates → ${ctx.projectDir}/tasks/`);
  console.log('');
  console.log(`  Would generate: ${ctx.target}/settings.json`);
  console.log('  Would replace placeholders: YOUR_NAME, YOUR_PROJECT_NAME, YOUR_ADO_*\n');
  console.log('  Run without --dry-run to install.');
}

async function runUninstall(target) {
  console.log(`  Uninstalling from: ${target}\n`);
  const anyPresent = ['skills', 'hooks', 'agents'].some((d) => fs.existsSync(path.join(target, d)));
  if (!anyPresent) {
    console.log(`  Nothing to uninstall — no skills, hooks, or agents found at ${target}`);
    return;
  }
  console.log('  This will remove:');
  for (const d of ['skills', 'agents', 'hooks', 'rules', 'trackers']) console.log(`    - ${target}/${d}/`);
  console.log('\n  This will NOT remove:');
  console.log('    - settings.json (your hook configuration)');
  console.log('    - tasks/ files (your project data)\n');
  const go = (await ask('  Continue? [y/N]: ')).trim().toLowerCase();
  if (go !== 'y') { console.log('  Cancelled.'); return; }

  const stamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15);
  const backupDir = path.join(path.dirname(target), `claude-code-harness-backup-${stamp}`);
  fs.mkdirSync(backupDir, { recursive: true });
  for (const d of ['skills', 'agents', 'hooks', 'rules', 'trackers']) {
    const src = path.join(target, d);
    if (fs.existsSync(src)) {
      fs.cpSync(src, path.join(backupDir, d), { recursive: true });
      fs.rmSync(src, { recursive: true, force: true });
      console.log(`  Removed: ${d}/`);
    }
  }
  console.log('');
  console.log(`  Backup saved to: ${backupDir}`);
  console.log(`  To restore: copy the contents of "${backupDir}" back into "${target}"`);
  console.log('');
  console.log('  Uninstall complete. settings.json and tasks/ were preserved.');
}

// Exported for unit tests — must come last so all helpers are defined.
module.exports = { buildSubstitutions, substituteInFile, toUnixPath, toWinPath, buildSettings };
