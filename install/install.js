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
const MANIFEST_SCHEMA_VERSION = 1;

const HARNESS_HOOK_SCRIPTS = new Set([
  'safety-check.js',
  'catalog-trigger.js',
  'drift-check.js',
  'pre-compact.js',
  'session-context.js',
  'session-router.js',
  'session-log.js',
]);

const ENTERPRISE_ONLY_AGENTS = new Set([
  'story-understand-agent.md',
  'story-plan-agent.md',
  'story-executor-agent.md',
  'story-pr-agent.md',
  'sprint-plan-gap-analyzer.md',
  'sprint-plan-docs-reader.md',
  'sprint-plan-tracker-reader.md',
]);

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
    printDryRun({ mode, target, workflowPack, tracker, userName, adoProject, adoRepo, adoOrgPath, workRoot, projectDir });
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

    // Substitute PRD mode in newly-created task files
    const taskConfigFile = workflowPack === 'solo'
      ? path.join(projectDir, 'tasks/notes.md')
      : path.join(projectDir, 'tasks/tracker-config.md');
    if (fs.existsSync(taskConfigFile)) {
      substituteInFile(taskConfigFile, [['YOUR_PRD_MODE', prdMode]]);
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
  const installed = [];
  if (!fs.existsSync(srcRoot)) return installed;
  for (const entry of fs.readdirSync(srcRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const destPath = path.join(destRoot, entry.name);
    const existed = fs.existsSync(destPath);
    console.log(`    ${existed ? 'Updating:  ' : 'Installing:'} ${label}/${entry.name}`);
    fs.cpSync(path.join(srcRoot, entry.name), destPath, { recursive: true, force: true });
    const files = walk(destPath, { match: () => true });
    for (const f of files) installed.push(`${label}/${path.relative(destRoot, f)}`);
  }
  return installed;
}

function copyFilesWithLog(srcRoot, destRoot, nameRegex, label, filesOnly = false, skipSet = null) {
  const installed = [];
  if (!fs.existsSync(srcRoot)) return installed;
  for (const entry of fs.readdirSync(srcRoot, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (nameRegex && !nameRegex.test(entry.name)) continue;
    if (filesOnly && entry.isDirectory()) continue;
    if (skipSet && skipSet.has(entry.name)) {
      console.log(`    Skipped:   ${label}/${entry.name} (enterprise-only)`);
      continue;
    }
    const destPath = path.join(destRoot, entry.name);
    const existed = fs.existsSync(destPath);
    console.log(`    ${existed ? 'Updating:  ' : 'Installing:'} ${label}/${entry.name}`);
    fs.copyFileSync(path.join(srcRoot, entry.name), destPath);
    installed.push(`${label}/${entry.name}`);
  }
  return installed;
}

function copyGlob(srcDir, destDir, regex, label) {
  const installed = [];
  if (!fs.existsSync(srcDir)) return installed;
  for (const name of fs.readdirSync(srcDir)) {
    if (!regex.test(name)) continue;
    fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
    if (label) installed.push(`${label}/${name}`);
  }
  return installed;
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
    ['YOUR_PRD_MODE', opts.prdMode || 'file'],
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
      SessionStart: [{ matcher: '*', hooks: [
        { type: 'command', command: `echo "${sessionStartMsg}"` },
        { type: 'command', command: nodeCmd('session-context.js') },
        { type: 'command', command: nodeCmd('session-router.js') },
      ] }],
      SessionEnd: [{ matcher: '*', hooks: [{ type: 'command', command: nodeCmd('session-log.js') }] }],
    },
  };
  if (isGlobal && workRoot) {
    settings.env = { CLAUDE_HARNESS_WORK_ROOT: workRoot };
  }
  return settings;
}

function verifyInstall(target, sedDirs, workflowPack = 'enterprise') {
  console.log('  Verifying installation...');
  let fail = 0;
  const required = [
    ...(workflowPack === 'enterprise' ? ['skills/story/SKILL.md'] : ['skills/implement/SKILL.md']),
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

function isHarnessHook(hookEntry) {
  const cmd = hookEntry.command || '';
  if (cmd.startsWith('echo "SESSION START:')) return true;
  for (const script of HARNESS_HOOK_SCRIPTS) {
    if (cmd.includes(script)) return true;
  }
  return false;
}

function reconcileSettings(existingSettings, newHarnessSettings) {
  const result = { ...existingSettings };
  const existingHooks = existingSettings.hooks || {};
  const newHooks = newHarnessSettings.hooks || {};
  const reconciledHooks = {};

  const allEvents = new Set([...Object.keys(existingHooks), ...Object.keys(newHooks)]);

  for (const event of allEvents) {
    const existingGroups = existingHooks[event] || [];
    const newGroups = newHooks[event] || [];

    const userGroups = [];
    for (const group of existingGroups) {
      const userHooksInGroup = (group.hooks || []).filter((h) => !isHarnessHook(h));
      if (userHooksInGroup.length > 0) {
        userGroups.push({ ...group, hooks: userHooksInGroup });
      }
    }

    const merged = [...newGroups];
    for (const userGroup of userGroups) {
      const matchingNew = merged.find((g) => g.matcher === userGroup.matcher);
      if (matchingNew) {
        matchingNew.hooks = [...matchingNew.hooks, ...userGroup.hooks];
      } else {
        merged.push(userGroup);
      }
    }

    if (merged.length > 0) {
      reconciledHooks[event] = merged;
    }
  }

  result.hooks = reconciledHooks;
  return result;
}

function buildManifest({ harnessVersion, installMode, workflowPack, tracker, prdMode, answers, installedFiles, now }) {
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    harnessVersion,
    installMode,
    workflowPack,
    tracker,
    prdMode,
    answers,
    installedFiles,
    installedAt: now,
    updatedAt: now,
  };
}

function runCheck(target) {
  const manifestPath = path.join(target, '.harness-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return { error: 'no-manifest', message: 'No .harness-manifest.json found. Run the installer first, or use --update to backfill.' };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    return { error: 'invalid-manifest', message: `Cannot parse .harness-manifest.json: ${e.message}` };
  }

  const harnessRepoPath = (manifest.answers && manifest.answers.harnessRepoPath) || REPO_DIR;
  if (!fs.existsSync(harnessRepoPath) || !fs.existsSync(path.join(harnessRepoPath, 'VERSION'))) {
    return { error: 'clone-not-found', message: `Harness clone not found at ${harnessRepoPath}. Git clone it and re-run.` };
  }

  const currentVersion = manifest.harnessVersion;
  const latestVersion = fs.readFileSync(path.join(harnessRepoPath, 'VERSION'), 'utf8').trim();

  // Git fetch + check commits behind
  let behind = 0;
  let fetchError = null;
  try {
    const fetchResult = spawnSync('git', ['fetch', '--quiet'], { cwd: harnessRepoPath, timeout: 15000, stdio: 'pipe' });
    if (fetchResult.status !== 0) {
      const stderr = (fetchResult.stderr || '').toString().trim();
      if (stderr.includes('Could not resolve')) fetchError = 'offline';
      else fetchError = stderr || 'fetch failed';
    } else {
      const trackingResult = spawnSync('git', ['rev-parse', '--abbrev-ref', '@{upstream}'], { cwd: harnessRepoPath, timeout: 5000, stdio: 'pipe' });
      if (trackingResult.status === 0) {
        const upstream = trackingResult.stdout.toString().trim();
        const countResult = spawnSync('git', ['rev-list', '--count', `HEAD..${upstream}`], { cwd: harnessRepoPath, timeout: 5000, stdio: 'pipe' });
        if (countResult.status === 0) behind = parseInt(countResult.stdout.toString().trim(), 10) || 0;
      } else {
        fetchError = 'no-upstream';
      }
    }
  } catch (e) {
    fetchError = e.message;
  }

  // Dirty working tree check
  let dirty = false;
  const statusResult = spawnSync('git', ['status', '--porcelain'], { cwd: harnessRepoPath, timeout: 5000, stdio: 'pipe' });
  if (statusResult.status === 0 && statusResult.stdout.toString().trim().length > 0) dirty = true;

  // CHANGELOG excerpt (latest unreleased section)
  let changelogExcerpt = '';
  const changelogPath = path.join(harnessRepoPath, 'CHANGELOG.md');
  if (fs.existsSync(changelogPath)) {
    const cl = fs.readFileSync(changelogPath, 'utf8');
    const unreleasedMatch = cl.match(/## \[Unreleased\]\s*\n([\s\S]*?)(?=\n## \[|$)/i);
    if (unreleasedMatch) changelogExcerpt = unreleasedMatch[1].trim().slice(0, 2000);
  }

  // Orphans: files in manifest.installedFiles that no longer exist in the source
  const orphans = [];
  const sourceFiles = new Set();
  for (const dir of ['skills', 'agents', 'hooks', 'rules']) {
    const srcDir = path.join(harnessRepoPath, dir);
    if (!fs.existsSync(srcDir)) continue;
    const files = walk(srcDir, { match: () => true });
    for (const f of files) sourceFiles.add(`${dir}/${path.relative(srcDir, f)}`);
  }
  for (const installed of (manifest.installedFiles || [])) {
    if (installed === 'settings.json') continue;
    if (installed.startsWith('trackers/')) continue;
    if (!sourceFiles.has(installed)) orphans.push(installed);
  }

  return {
    currentVersion,
    latestVersion,
    behind,
    dirty,
    fetchError,
    changelogExcerpt,
    orphans,
    manifestPath,
  };
}

function runUpdate(target) {
  const manifestPath = path.join(target, '.harness-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('  Error: No .harness-manifest.json found at ' + target);
    console.error('  Run the installer first, or use /update-harness to backfill.');
    process.exit(1);
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    console.error(`  Error: Cannot parse .harness-manifest.json: ${e.message}`);
    process.exit(1);
  }

  const harnessRepoPath = (manifest.answers && manifest.answers.harnessRepoPath) || REPO_DIR;
  if (!fs.existsSync(harnessRepoPath) || !fs.existsSync(path.join(harnessRepoPath, 'VERSION'))) {
    console.error(`  Error: Harness clone not found at ${harnessRepoPath}`);
    console.error('  Git clone it and re-run, or update answers.harnessRepoPath in the manifest.');
    process.exit(1);
  }

  // (1) Snapshot target
  const backupsDir = path.join(os.homedir(), '.claude', '.harness-backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15);
  const snapshotDir = path.join(backupsDir, stamp);
  fs.mkdirSync(snapshotDir, { recursive: true });
  for (const d of ['skills', 'agents', 'hooks', 'rules', 'trackers']) {
    const src = path.join(target, d);
    if (fs.existsSync(src)) fs.cpSync(src, path.join(snapshotDir, d), { recursive: true });
  }
  const settingsFile = path.join(target, 'settings.json');
  if (fs.existsSync(settingsFile)) fs.copyFileSync(settingsFile, path.join(snapshotDir, 'settings.json'));
  fs.copyFileSync(manifestPath, path.join(snapshotDir, '.harness-manifest.json'));
  console.log(`  Snapshot saved to: ${snapshotDir}`);

  // Prune old snapshots (keep last 3)
  const allSnapshots = fs.readdirSync(backupsDir).sort();
  while (allSnapshots.length > 3) {
    const old = allSnapshots.shift();
    fs.rmSync(path.join(backupsDir, old), { recursive: true, force: true });
  }

  // (2) git pull --ff-only (skipped with --skip-pull for testing)
  const skipPull = args.includes('--skip-pull');
  if (!skipPull) {
    const diffResult = spawnSync('git', ['diff', '--name-only', 'HEAD'], { cwd: harnessRepoPath, timeout: 5000, stdio: 'pipe' });
    const stagedResult = spawnSync('git', ['diff', '--name-only', '--cached'], { cwd: harnessRepoPath, timeout: 5000, stdio: 'pipe' });
    const hasDirtyTracked = (diffResult.status === 0 && diffResult.stdout.toString().trim().length > 0)
      || (stagedResult.status === 0 && stagedResult.stdout.toString().trim().length > 0);
    if (hasDirtyTracked) {
      console.error('  Error: Harness clone has uncommitted changes to tracked files.');
      console.error(`  cd ${harnessRepoPath} && git stash`);
      console.error(`  Then re-run the update.`);
      console.error(`  Snapshot at: ${snapshotDir}`);
      process.exit(1);
    }

    const pullResult = spawnSync('git', ['pull', '--ff-only'], { cwd: harnessRepoPath, timeout: 30000, stdio: 'pipe' });
    if (pullResult.status !== 0) {
      const stderr = (pullResult.stderr || '').toString().trim();
      console.error('  Error: git pull --ff-only failed.');
      console.error(`  ${stderr}`);
      console.error(`  Resolve manually: cd ${harnessRepoPath} && git pull --ff-only`);
      console.error(`  Snapshot at: ${snapshotDir}`);
      process.exit(1);
    }
    const pullOut = (pullResult.stdout || '').toString().trim();
    if (pullOut.includes('Already up to date')) {
      console.log('  Already up to date.');
    } else {
      console.log(`  Pulled: ${pullOut.split('\n')[0]}`);
    }
  }

  // (3) Re-copy files from clone
  const installedFiles = [];
  const { workflowPack, tracker } = manifest;
  for (const d of ['skills', 'agents', 'hooks', 'rules', 'trackers/active']) {
    fs.mkdirSync(path.join(target, d), { recursive: true });
  }

  installedFiles.push(...copyDirsWithLog(path.join(harnessRepoPath, 'skills'), path.join(target, 'skills'), 'skills'));

  installedFiles.push(...copyGlob(path.join(harnessRepoPath, 'trackers', tracker || 'github'), path.join(target, 'trackers/active'), /\.sh$/, 'trackers/active'));
  chmodExecutables(path.join(target, 'trackers/active'));

  const trackerLibSrc = path.join(harnessRepoPath, 'trackers/lib');
  if (fs.existsSync(trackerLibSrc)) {
    fs.mkdirSync(path.join(target, 'trackers/lib'), { recursive: true });
    installedFiles.push(...copyGlob(trackerLibSrc, path.join(target, 'trackers/lib'), /\.sh$/, 'trackers/lib'));
  }

  const agentSkip = workflowPack === 'solo' ? ENTERPRISE_ONLY_AGENTS : null;
  installedFiles.push(...copyFilesWithLog(path.join(harnessRepoPath, 'agents'), path.join(target, 'agents'), /\.md$/, 'agents', false, agentSkip));

  installedFiles.push(...copyFilesWithLog(path.join(harnessRepoPath, 'hooks'), path.join(target, 'hooks'), null, 'hooks', true));
  const hooksLibSrc = path.join(harnessRepoPath, 'hooks/lib');
  if (fs.existsSync(hooksLibSrc)) {
    fs.mkdirSync(path.join(target, 'hooks/lib'), { recursive: true });
    installedFiles.push(...copyGlob(hooksLibSrc, path.join(target, 'hooks/lib'), /\.js$/, 'hooks/lib'));
  }

  installedFiles.push(...copyFilesWithLog(path.join(harnessRepoPath, 'rules'), path.join(target, 'rules'), /\.md$/, 'rules'));

  // (4) Re-substitute placeholders from manifest answers
  const answers = manifest.answers || {};
  const mode = manifest.installMode || 'project';
  const hooksUnix = mode === 'global'
    ? `${os.homedir().replace(/\\/g, '/')}/.claude/hooks`
    : toUnixPath(path.join(target, 'hooks'));
  const hooksWin = toWinPath(mode === 'global'
    ? path.join(os.homedir(), '.claude', 'hooks')
    : path.join(target, 'hooks'));
  const projectRootBash = mode === 'global' ? '$(pwd)' : toUnixPath(path.dirname(target));

  const substitutions = buildSubstitutions({
    hooksUnix, hooksWin, projectRootBash,
    projectName: answers.projectName || 'YOUR_PROJECT_NAME',
    userName: answers.userName || 'YOUR_NAME',
    adoProject: answers.adoProject || 'YOUR_ADO_PROJECT',
    adoRepo: answers.adoRepo || 'YOUR_ADO_REPO',
    adoOrgPath: answers.adoOrgPath || 'YOUR_ADO_ORG_PATH',
    orgName: answers.orgName || 'YOUR_ORG',
    leadDev: answers.leadDev || 'YOUR_LEAD_DEV',
    infraPerson: answers.infraPerson || 'YOUR_INFRA_PERSON',
    devopsPerson: answers.devopsPerson || 'YOUR_DEVOPS_PERSON',
    qaPerson: answers.qaPerson || 'YOUR_QA_PERSON',
    harnessRepoPath: answers.harnessRepoPath || harnessRepoPath,
    workRoot: answers.workRoot || '',
    isGlobal: mode === 'global',
    prdMode: manifest.prdMode || 'file',
  });

  const sedDirs = ['skills', 'agents', 'hooks', 'rules', 'trackers']
    .map((d) => path.join(target, d))
    .filter((d) => fs.existsSync(d));
  for (const dir of sedDirs) substituteInTree(dir, substitutions);

  // (5) Delete safe orphans
  const oldFiles = new Set(manifest.installedFiles || []);
  const newFiles = new Set(installedFiles);
  let orphansRemoved = 0;
  for (const old of oldFiles) {
    if (old === 'settings.json') continue;
    if (newFiles.has(old)) continue;
    const fullPath = path.join(target, old);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { force: true });
      console.log(`    Removed orphan: ${old}`);
      orphansRemoved++;
    }
  }
  if (orphansRemoved > 0) console.log(`  Removed ${orphansRemoved} orphaned file(s)`);

  // (6) Reconcile settings.json
  const sessionStartMsg = workflowPack === 'solo'
    ? 'SESSION START: Before doing anything else — read tasks/notes.md and tasks/plan.md'
    : 'SESSION START: Before doing anything else — read tasks/lessons.md, todo.md, pr-queue.md, and flags-and-notes.md';
  const newHarnessSettings = buildSettings({
    hooksUnix, workflowPack: workflowPack || 'solo', sessionStartMsg,
    workRoot: answers.workRoot || '', isGlobal: mode === 'global',
  });

  if (fs.existsSync(settingsFile)) {
    fs.copyFileSync(settingsFile, `${settingsFile}.bak`);
    let existingSettings;
    try { existingSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch { existingSettings = {}; }
    const reconciled = reconcileSettings(existingSettings, newHarnessSettings);
    fs.writeFileSync(settingsFile, JSON.stringify(reconciled, null, 2) + '\n', 'utf8');
    console.log('  Settings reconciled (backup: settings.json.bak)');
  } else {
    fs.writeFileSync(settingsFile, JSON.stringify(newHarnessSettings, null, 2) + '\n', 'utf8');
    console.log('  Generated settings.json');
  }
  installedFiles.push('settings.json');

  // (7) Verify
  verifyInstall(target, sedDirs, workflowPack);

  // (8) Bump manifest
  const newVersion = fs.readFileSync(path.join(harnessRepoPath, 'VERSION'), 'utf8').trim();
  const updatedManifest = {
    ...manifest,
    harnessVersion: newVersion,
    installedFiles: installedFiles.sort(),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 2) + '\n', 'utf8');

  console.log(`\n  Updated: ${manifest.harnessVersion} → ${newVersion}`);
  console.log(`  Restore: cp -r "${snapshotDir}/"* "${target}/"`);
}

function backfillManifest(target, opts = {}) {
  // Detect workflowPack from installed agents
  const agentsDir = path.join(target, 'agents');
  let workflowPack = 'solo';
  if (fs.existsSync(agentsDir)) {
    const agents = fs.readdirSync(agentsDir);
    if (agents.some(a => ENTERPRISE_ONLY_AGENTS.has(a))) workflowPack = 'enterprise';
  }

  // Detect tracker from adapter script contents
  let tracker = 'github';
  const trackerDir = path.join(target, 'trackers/active');
  if (fs.existsSync(trackerDir)) {
    const scripts = fs.readdirSync(trackerDir).filter(f => f.endsWith('.sh'));
    for (const script of scripts) {
      const content = fs.readFileSync(path.join(trackerDir, script), 'utf8');
      if (content.includes('az boards')) { tracker = 'ado'; break; }
      if (/\btd\s/.test(content)) { tracker = 'todoist'; break; }
    }
  }

  // Reconstruct installedFiles from what's present
  const installedFiles = [];
  for (const dir of ['skills', 'agents', 'hooks', 'rules', 'trackers']) {
    const fullDir = path.join(target, dir);
    if (!fs.existsSync(fullDir)) continue;
    const files = walk(fullDir, { match: () => true });
    for (const f of files) installedFiles.push(`${dir}/${path.relative(fullDir, f)}`);
  }
  if (fs.existsSync(path.join(target, 'settings.json'))) installedFiles.push('settings.json');

  const harnessVersion = opts.harnessVersion || 'unknown';
  const harnessRepoPath = opts.harnessRepoPath || REPO_DIR;
  const prdMode = opts.prdMode || 'file';

  const now = new Date().toISOString();
  const manifest = buildManifest({
    harnessVersion,
    installMode: opts.installMode || (target === path.join(os.homedir(), '.claude') ? 'global' : 'project'),
    workflowPack,
    tracker,
    prdMode,
    answers: {
      userName: 'YOUR_NAME',
      projectName: 'YOUR_PROJECT_NAME',
      harnessRepoPath,
      ...(opts.answers || {}),
    },
    installedFiles: installedFiles.sort(),
    now,
  });

  const manifestPath = path.join(target, '.harness-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  return { manifest, manifestPath, detected: { workflowPack, tracker } };
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

// Exported for unit tests — must come last so all helpers are defined.
module.exports = {
  buildSubstitutions, substituteInFile, toUnixPath, toWinPath, buildSettings,
  buildManifest, MANIFEST_SCHEMA_VERSION,
  reconcileSettings, isHarnessHook, HARNESS_HOOK_SCRIPTS,
  runCheck, runUpdate, backfillManifest,
};
