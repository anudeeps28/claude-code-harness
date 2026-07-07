#!/usr/bin/env node
// Claude Code Kit — cross-platform installer (Windows, macOS, Linux).
// Zero runtime deps. Mirrors install.sh behaviour 1:1.

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const readline = require('node:readline');
const { spawnSync } = require('node:child_process');

const { copyDirsWithLog, copyFilesWithLog, copyGlob, copyTemplatesNoClobber, chmodExecutables } = require('./lib/copy.js');
const {
  toUnixPath, toWinPath, buildSubstitutions, substituteInTree, substituteInFile,
  buildSettings, buildManifest, subsFromManifest,
} = require('./lib/substitution.js');
const {
  isHarnessHook, reconcileSettings, verifyInstall, reportUnfilled, printDryRun,
  runCheck: runCheckImpl, runUpdate: runUpdateImpl,
  runSwitchTracker: runSwitchTrackerImpl, backfillManifest: backfillManifestImpl,
  HARNESS_HOOK_SCRIPTS, ENTERPRISE_ONLY_AGENTS,
} = require('./lib/updater.js');

const REPO_DIR = path.resolve(__dirname, '..');
const MANIFEST_SCHEMA_VERSION = 1;

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
let nonInteractive = false;
let checkMode = false;
let updateMode = false;
let switchTracker = '';

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--global') mode = 'global';
  else if (a === '--project') {
    mode = 'project';
    const next = args[i + 1];
    if (next && !next.startsWith('-')) { projectDir = next; i++; }
  } else if (a === '--uninstall') uninstall = true;
  else if (a === '--dry-run') dryRun = true;
  else if (a === '--yes' || a === '-y') nonInteractive = true;
  else if (a === '--check') checkMode = true;
  else if (a === '--update') updateMode = true;
  else if (a === '--switch-tracker') {
    const next = args[i + 1];
    if (next && !next.startsWith('-')) { switchTracker = next; i++; }
  }
  else if (a === '--backfill') { /* triggers backfill — consumed in main */ }
  else if (a === '--skip-pull') { /* consumed by runUpdate */ }
  else if (a === '--seed') { /* handled post-install — seeds lessons.md from ~/.claude/learnings/ */ }
  else if (a === '--help' || a === '-h') {
    console.log(`  Usage:
    node install/install.js                     # interactive install
    node install/install.js --global            # global install
    node install/install.js --project /my/app   # project install
    node install/install.js --yes --global      # non-interactive (solo pack, defaults)
    node install/install.js --uninstall         # remove installed files
    node install/install.js --dry-run           # show what would be done
    node install/install.js --check --project /my/app   # check for updates (read-only)
    node install/install.js --update --project /my/app  # apply updates
`);
    process.exit(0);
  } else if (!projectDir) { projectDir = a; mode = 'project'; }
}

// ── Minimal readline prompt helper ───────────────────────────────────────────
// rl/ask are only created when we actually run the installer (not on require-for-tests).
let rl = null;
const ask = (q) => new Promise((resolve) => rl.question(q, (ans) => resolve(ans)));

// ── Thin wrappers that inject REPO_DIR ───────────────────────────────────────
function runCheck(target) { return runCheckImpl(target, REPO_DIR); }
function runUpdate(target) { return runUpdateImpl(target, { repoDir: REPO_DIR, cliArgs: args }); }
function runSwitchTracker(target, tracker) { return runSwitchTrackerImpl(target, tracker, REPO_DIR); }
function backfillManifest(target, opts = {}) { return backfillManifestImpl(target, opts, REPO_DIR); }

function checkTool(tool, hint) {
  const res = spawnSync(`${tool} --version`, { shell: true, stdio: 'ignore' });
  if (res.status === 0) { console.log(`  [OK]      ${tool}`); return 0; }
  console.log(`  [MISSING] ${tool} — ${hint}`);
  return 1;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (nonInteractive && !mode) {
    console.error('  Error: --yes requires --global or --project <path>');
    process.exit(1);
  }
  if (nonInteractive && mode === 'project' && !projectDir) {
    console.error('  Error: --yes requires --project <path>');
    process.exit(1);
  }

  if (!nonInteractive) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }
  const prompt = (q, fallback) => {
    if (nonInteractive) return Promise.resolve(fallback);
    return ask(q);
  };

  if (!checkMode) {
    console.log('\n  claude-code-harness');
    console.log('  ────────────────────────────────────────────────────────────────\n');
  }

  if (!mode) {
    console.log('  Install mode:\n');
    console.log('    1) Global  — skills available in every project  (~/.claude/)');
    console.log('    2) Project — install into one specific project\n');
    const choice = (await prompt('  Choice [1/2]: ', '2')).trim();
    console.log('');
    mode = choice === '1' ? 'global' : 'project';
  }

  if (mode === 'project' && !projectDir) {
    projectDir = (await prompt('  Project path: ', '')).trim();
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
    if (rl) rl.close();
    return;
  }

  // ── Check mode ─────────────────────────────────────────────────────────────
  if (checkMode) {
    const result = runCheck(target);
    console.log(JSON.stringify(result, null, 2));
    if (rl) rl.close();
    return;
  }

  // ── Update mode ────────────────────────────────────────────────────────────
  if (updateMode) {
    runUpdate(target);
    if (rl) rl.close();
    return;
  }

  // ── Switch tracker mode ────────────────────────────────────────────────────
  if (switchTracker) {
    runSwitchTracker(target, switchTracker);
    if (rl) rl.close();
    return;
  }

  // Git-repo warning
  if (mode === 'project' && !fs.existsSync(path.join(projectDir, '.git'))) {
    console.log(`  Warning: ${projectDir} does not appear to be a git repository.`);
    const go = (await prompt('  Continue anyway? [y/N]: ', 'y')).trim().toLowerCase();
    console.log('');
    if (go !== 'y') process.exit(1);
  }

  // ── Workflow pack ──────────────────────────────────────────────────────────
  console.log('  Workflow pack:\n');
  console.log('    1) Enterprise — sprints, stories, team coordination (/story, /sprint-plan)');
  console.log('    2) Solo       — issues, simple priorities (/implement, /plan)\n');
  const packChoice = (await prompt('  Choice [1/2]: ', '2')).trim();
  console.log('');
  const workflowPack = packChoice === '2' ? 'solo' : 'enterprise';

  // ── Tracker ────────────────────────────────────────────────────────────────
  let tracker;
  if (workflowPack === 'enterprise') {
    console.log('  Issue tracker:\n');
    console.log('    1) Azure DevOps  (uses az devops CLI)');
    console.log('    2) GitHub        (uses gh CLI)');
    console.log('    3) Todoist       (uses td CLI)\n');
    const trackerChoice = (await prompt('  Choice [1/2/3]: ', '2')).trim();
    console.log('');
    tracker = trackerChoice === '1' ? 'ado' : trackerChoice === '3' ? 'todoist' : 'github';
  } else {
    console.log('  Issue tracker:\n');
    console.log('    1) GitHub   (uses gh CLI)');
    console.log('    2) Todoist  (uses td CLI)\n');
    const trackerChoice = (await prompt('  Choice [1/2]: ', '1')).trim();
    console.log('');
    tracker = trackerChoice === '2' ? 'todoist' : 'github';
  }

  // ── Preflight ──────────────────────────────────────────────────────────────
  console.log('  Checking prerequisites...');
  let missing = 0;
  missing += checkTool('jq', 'https://jqlang.github.io/jq/download/');
  if (tracker === 'ado') missing += checkTool('az', 'https://aka.ms/installazurecli (then: az extension add --name azure-devops)');
  else if (tracker === 'todoist') missing += checkTool('td', 'Todoist CLI — install from your package manager or see project README');
  else missing += checkTool('gh', 'https://cli.github.com');
  if (missing > 0) {
    console.error('\n  Error: Missing prerequisites above. Install them and re-run the installer.');
    process.exit(1);
  }
  console.log('');

  // ── Personalization ────────────────────────────────────────────────────────
  console.log('  Personalization (press Enter to skip and fill in manually later):\n');
  const userName    = (await prompt('    Your name                              : ', '')).trim() || 'YOUR_NAME';
  const projectName = (await prompt('    Project name (human-readable)           : ', '')).trim() || 'YOUR_PROJECT_NAME';

  let adoProject = 'YOUR_ADO_PROJECT';
  let adoRepo = 'YOUR_ADO_REPO';
  let adoOrgPath = 'YOUR_ADO_ORG_PATH';
  if (workflowPack === 'enterprise' && tracker === 'ado') {
    adoProject = (await prompt('    ADO project name                       : ', '')).trim() || adoProject;
    adoRepo    = (await prompt('    ADO repo name                          : ', '')).trim() || adoRepo;
    adoOrgPath = (await prompt('    ADO org path (sprint IterationPath)    : ', '')).trim() || adoOrgPath;
  }

  let todoistProject = 'YOUR_TODOIST_PROJECT';
  if (tracker === 'todoist') {
    todoistProject = (await prompt('    Todoist project name                    : ', '')).trim() || todoistProject;
  }

  let orgName, leadDev, infraPerson, devopsPerson, qaPerson;
  if (workflowPack === 'enterprise') {
    orgName = 'YOUR_ORG'; leadDev = 'YOUR_LEAD_DEV'; infraPerson = 'YOUR_INFRA_PERSON';
    devopsPerson = 'YOUR_DEVOPS_PERSON'; qaPerson = 'YOUR_QA_PERSON';
    console.log('');
    console.log('    Team (press Enter to skip — leaves placeholders in skill text):');
    orgName      = (await prompt('    Org / company short name               : ', '')).trim() || orgName;
    leadDev      = (await prompt('    Lead developer name (architecture)     : ', '')).trim() || leadDev;
    infraPerson  = (await prompt('    Infrastructure / cloud person          : ', '')).trim() || infraPerson;
    devopsPerson = (await prompt('    DevOps / CI/CD / deployments person    : ', '')).trim() || devopsPerson;
    qaPerson     = (await prompt('    QA / UAT person                        : ', '')).trim() || qaPerson;
  } else {
    orgName = projectName !== 'YOUR_PROJECT_NAME' ? projectName : 'our';
    leadDev = userName !== 'YOUR_NAME' ? userName : 'the lead dev';
    infraPerson = userName !== 'YOUR_NAME' ? userName : 'the infra person';
    devopsPerson = userName !== 'YOUR_NAME' ? userName : 'the devops person';
    qaPerson = userName !== 'YOUR_NAME' ? userName : 'the QA person';
  }

  // ── PRD output mode ──────────────────────────────────────────────────────
  console.log('  Where should PRDs live?\n');
  console.log('    1) File in repo          — PRD.md (default)');
  console.log('    2) Tracker issue         — published to your issue tracker');
  console.log('    3) Both — file canonical — PRD.md is source of truth, tracker is mirror');
  console.log('    4) Both — tracker canonical — tracker issue is source of truth, file is mirror\n');
  const prdChoice = (await prompt('  Choice [1/2/3/4]: ', '1')).trim();
  console.log('');
  const prdModeMap = { '1': 'file', '2': 'tracker', '3': 'both-file-canonical', '4': 'both-tracker-canonical' };
  const prdMode = prdModeMap[prdChoice] || 'file';

  let workRoot = '';
  if (mode === 'global') {
    workRoot = (await prompt('    Work root (folder containing projects) : ', '')).trim() || 'C:\\YOUR_WORK_FOLDER';
  }

  const harnessRepoPath = (await prompt(`    Harness repo path [${REPO_DIR}]: `, '')).trim() || REPO_DIR;
  console.log('');

  // ── Dry run ────────────────────────────────────────────────────────────────
  if (dryRun) {
    printDryRun({ mode, target, workflowPack, tracker, userName, adoProject, adoRepo, adoOrgPath, workRoot, projectDir }, REPO_DIR);
    if (rl) rl.close();
    return;
  }

  // ── Overwrite warning ──────────────────────────────────────────────────────
  console.log(`  Installing to: ${target}\n`);
  const hasExisting = ['skills', 'agents', 'hooks'].some((d) => fs.existsSync(path.join(target, d)));
  if (hasExisting) {
    console.log(`  An existing installation was detected at ${target}.`);
    console.log('  Skills, agents, hooks, and rules will be overwritten with the latest versions.');
    console.log('  Task files (tasks/) will NOT be overwritten.\n');
    const go = (await prompt('  Continue with upgrade? [y/N]: ', 'y')).trim().toLowerCase();
    console.log('');
    if (go !== 'y') { console.log('  Aborted.'); if (rl) rl.close(); return; }
  }

  // ── Copy files ─────────────────────────────────────────────────────────────
  const installedFiles = [];
  for (const d of ['skills', 'agents', 'hooks', 'rules', 'trackers/active']) {
    fs.mkdirSync(path.join(target, d), { recursive: true });
  }

  console.log('  Copying skills...');
  installedFiles.push(...copyDirsWithLog(path.join(REPO_DIR, 'skills'), path.join(target, 'skills'), 'skills'));

  console.log(`  Copying tracker adapter (${tracker})...`);
  installedFiles.push(...copyGlob(path.join(REPO_DIR, 'trackers', tracker), path.join(target, 'trackers/active'), /\.sh$/, 'trackers/active'));
  chmodExecutables(path.join(target, 'trackers/active'));

  const trackerLibSrc = path.join(REPO_DIR, 'trackers/lib');
  if (fs.existsSync(trackerLibSrc)) {
    fs.mkdirSync(path.join(target, 'trackers/lib'), { recursive: true });
    installedFiles.push(...copyGlob(trackerLibSrc, path.join(target, 'trackers/lib'), /\.sh$/, 'trackers/lib'));
  }

  console.log('  Copying agents...');
  const agentSkip = workflowPack === 'solo' ? ENTERPRISE_ONLY_AGENTS : null;
  installedFiles.push(...copyFilesWithLog(path.join(REPO_DIR, 'agents'), path.join(target, 'agents'), /\.md$/, 'agents', false, agentSkip));

  console.log('  Copying hooks...');
  installedFiles.push(...copyFilesWithLog(path.join(REPO_DIR, 'hooks'), path.join(target, 'hooks'), null, 'hooks', /* filesOnly */ true));
  const hooksLibSrc = path.join(REPO_DIR, 'hooks/lib');
  if (fs.existsSync(hooksLibSrc)) {
    fs.mkdirSync(path.join(target, 'hooks/lib'), { recursive: true });
    installedFiles.push(...copyGlob(hooksLibSrc, path.join(target, 'hooks/lib'), /\.js$/, 'hooks/lib'));
    console.log('    Installed: hooks/lib/');
  }

  console.log('  Copying rules...');
  installedFiles.push(...copyFilesWithLog(path.join(REPO_DIR, 'rules'), path.join(target, 'rules'), /\.md$/, 'rules'));

  // Learnings directories (proactive learning loop)
  const globalLearningsDir = path.join(os.homedir(), '.claude', 'learnings');
  fs.mkdirSync(globalLearningsDir, { recursive: true });
  console.log('    Created: ~/.claude/learnings/');
  if (mode === 'project') {
    const projectLearningsDir = path.join(projectDir, '.claude', 'learnings');
    fs.mkdirSync(projectLearningsDir, { recursive: true });
    console.log(`    Created: ${path.relative(process.cwd(), projectLearningsDir)}/`);
  }

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

    const taskConfigFiles = workflowPack === 'solo'
      ? [path.join(projectDir, 'tasks/notes.md'), path.join(projectDir, 'tasks/tracker-config.md')]
      : [path.join(projectDir, 'tasks/tracker-config.md')];
    for (const taskConfigFile of taskConfigFiles) {
      if (fs.existsSync(taskConfigFile)) {
        substituteInFile(taskConfigFile, [
          ['YOUR_PRD_MODE', prdMode],
          ['YOUR_TODOIST_PROJECT', todoistProject],
        ]);
      }
    }
  }

  // ── CONTEXT.md + ADR convention (project installs only) ───────────────────
  if (mode === 'project') {
    console.log('  Optional: CONTEXT.md + ADR convention\n');
    console.log('    CONTEXT.md — domain glossary, module map, codebase conventions');
    console.log('    docs/adr/  — lightweight records of hard-to-reverse decisions\n');
    const ctxChoice = (await prompt('  Set up CONTEXT.md + ADR convention? [y/N]: ', 'n')).trim().toLowerCase();
    console.log('');
    if (ctxChoice === 'y') {
      const ctxTemplateSrc = path.join(REPO_DIR, 'templates/CONTEXT.md.template');
      const ctxDest = path.join(projectDir, 'CONTEXT.md');
      const adrSrc = path.join(REPO_DIR, 'templates/docs/adr');
      const adrDest = path.join(projectDir, 'docs/adr');

      if (fs.existsSync(ctxDest)) {
        console.log('    Skipped (exists): CONTEXT.md');
      } else {
        fs.copyFileSync(ctxTemplateSrc, ctxDest);
        console.log('    Created: CONTEXT.md');
      }

      fs.mkdirSync(adrDest, { recursive: true });
      copyTemplatesNoClobber(adrSrc, adrDest, 'docs/adr');
    }
  }

  // ── Seed from cross-project learnings store (--seed flag) ──────────────────
  if (mode === 'project' && args.includes('--seed')) {
    const learningsDir = path.join(os.homedir(), '.claude', 'learnings');
    const lessonsFile = path.join(projectDir, 'tasks', 'lessons.md');
    if (fs.existsSync(learningsDir) && fs.existsSync(lessonsFile)) {
      console.log('  Seeding lessons.md from global learnings store...');
      try {
        const files = fs.readdirSync(learningsDir).filter(f => f.endsWith('.json'));
        let seeded = 0;
        const lessonsText = fs.readFileSync(lessonsFile, 'utf8');
        const additions = [];
        for (const f of files) {
          const entry = JSON.parse(fs.readFileSync(path.join(learningsDir, f), 'utf8'));
          if (entry.learning && !lessonsText.includes(entry.learning)) {
            additions.push(`- [${entry.category}] ${entry.learning}`);
            seeded++;
          }
        }
        if (seeded > 0) {
          fs.appendFileSync(lessonsFile,
            '\n\n## Seeded from global learnings\n\n' + additions.join('\n') + '\n');
          console.log(`    Seeded ${seeded} learnings into lessons.md`);
        } else {
          console.log('    No new learnings to seed (all already present or store empty)');
        }
      } catch (e) {
        console.log(`    Seed skipped: ${e.message}`);
      }
    } else {
      console.log('  Seed skipped: no global learnings store or lessons.md not found');
    }
  }

  // ── Path variables for placeholders ────────────────────────────────────────
  const hooksUnix = mode === 'global'
    ? `${os.homedir().replace(/\\/g, '/')}/.claude/hooks`
    : toUnixPath(path.join(target, 'hooks'));
  const hooksWin  = toWinPath(mode === 'global'
    ? path.join(os.homedir(), '.claude', 'hooks')
    : path.join(target, 'hooks'));

  const projectRootBash = mode === 'global' ? '$(pwd)' : toUnixPath(projectDir);

  // ── Placeholder substitution ───────────────────────────────────────────────
  console.log('');
  console.log('  Configuring placeholders...');

  const substitutions = buildSubstitutions({
    hooksUnix, hooksWin, projectRootBash,
    projectName, userName,
    adoProject, adoRepo, adoOrgPath,
    orgName, leadDev, infraPerson, devopsPerson, qaPerson,
    harnessRepoPath, todoistProject, workRoot, isGlobal: mode === 'global',
    prdMode,
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
  installedFiles.push('settings.json');

  // ── Manifest ───────────────────────────────────────────────────────────────
  const harnessVersion = fs.readFileSync(path.join(REPO_DIR, 'VERSION'), 'utf8').trim();
  const now = new Date().toISOString();
  const manifest = buildManifest({
    harnessVersion,
    installMode: mode,
    workflowPack,
    tracker,
    prdMode,
    answers: {
      userName, projectName,
      adoProject, adoRepo, adoOrgPath,
      todoistProject,
      orgName, leadDev, infraPerson, devopsPerson, qaPerson,
      harnessRepoPath, workRoot,
    },
    installedFiles: installedFiles.sort(),
    now,
  });
  const manifestFile = path.join(target, '.harness-manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('  Wrote .harness-manifest.json');

  // ── Verify ─────────────────────────────────────────────────────────────────
  verifyInstall(target, sedDirs, workflowPack);

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

  if (mode === 'project') {
    console.log('  Optional: git worktree workflow');
    console.log('  ────────────────────────────────────────────────────────────────');
    console.log('  A worktree workflow rule was installed at:');
    console.log('    .claude/rules/git-worktrees.md');
    console.log('  To enable parallel-branch development, add this line to CLAUDE.md:');
    console.log('    @.claude/rules/git-worktrees.md');
    console.log('  To disable later, comment that line out. See the rule file for details.\n');
  }

  reportUnfilled({ userName, projectName, tracker, workflowPack,
    adoProject, adoRepo, adoOrgPath, orgName, leadDev, infraPerson, devopsPerson, qaPerson });

  if (rl) rl.close();
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
  const go = nonInteractive ? 'y' : (await ask('  Continue? [y/N]: ')).trim().toLowerCase();
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

if (require.main === module) {
  main().catch((err) => {
    console.error('  Installer failed:', err && err.stack ? err.stack : String(err));
    if (rl) rl.close();
    process.exit(1);
  });
}

// Exported for unit tests — must come last so all helpers are defined.
module.exports = {
  buildSubstitutions, subsFromManifest, substituteInFile, toUnixPath, toWinPath, buildSettings,
  buildManifest, MANIFEST_SCHEMA_VERSION,
  reconcileSettings, isHarnessHook, HARNESS_HOOK_SCRIPTS,
  runCheck, runUpdate, backfillManifest, runSwitchTracker,
};
