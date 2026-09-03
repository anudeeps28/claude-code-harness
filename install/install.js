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
  HARNESS_HOOK_SCRIPTS, ENTERPRISE_ONLY_AGENTS, ENTERPRISE_ONLY_SKILLS,
} = require('./lib/updater.js');
const { DEFAULT_REPO_URL } = require('./lib/source.js');

// Build the fetch-on-demand update config from CLI flags. Default: latest from
// GitHub. --pin <ver> pins a version; --local <path> points at a local clone
// (used for harness development). See install/lib/source.js.
function buildUpdateConfig(cliArgs) {
  const repoUrl = cliArgs.repoUrl || DEFAULT_REPO_URL;
  if (cliArgs.localPath) {
    return { repoUrl, channel: 'local', pinnedVersion: null, localPath: path.resolve(cliArgs.localPath) };
  }
  if (cliArgs.pinnedVersion) {
    return { repoUrl, channel: 'pinned', pinnedVersion: cliArgs.pinnedVersion, localPath: null };
  }
  return { repoUrl, channel: 'latest', pinnedVersion: null, localPath: null };
}

const REPO_DIR = path.resolve(__dirname, '..');
const MANIFEST_SCHEMA_VERSION = 2;

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

// Value-taking flags that supply personalization/config non-interactively, so
// `--yes` needs no follow-up sed. Each maps a CLI flag to a `cli` object key
// consumed below in place of an interactive prompt.
const VALUE_FLAGS = {
  '--name': 'userName',
  '--project-name': 'projectName',
  '--pack': 'pack',
  '--tracker': 'tracker',
  '--prd-mode': 'prdMode',
  '--ado-project': 'adoProject',
  '--ado-repo': 'adoRepo',
  '--ado-org-path': 'adoOrgPath',
  '--todoist-project': 'todoistProject',
  '--org': 'orgName',
  '--lead-dev': 'leadDev',
  '--infra-person': 'infraPerson',
  '--devops-person': 'devopsPerson',
  '--qa-person': 'qaPerson',
  '--work-root': 'workRoot',
  '--pin': 'pinnedVersion',
  '--local': 'localPath',
  '--repo-url': 'repoUrl',
  '--source': 'source',
  '--code-platform': 'codePlatform',
  '--tracker-mirror': 'trackerMirror',
};
const cli = {};

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--global') mode = 'global';
  else if (a === '--project') {
    mode = 'project';
    const next = args[i + 1];
    if (next && !next.startsWith('-')) { projectDir = next; i++; }
  } else if (Object.prototype.hasOwnProperty.call(VALUE_FLAGS, a)) {
    const next = args[i + 1];
    if (next === undefined || next.startsWith('-')) {
      console.error(`  Error: ${a} requires a value (e.g. ${a} "my-value")`);
      process.exit(1);
    }
    cli[VALUE_FLAGS[a]] = next;
    i++;
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
  else if (a === '--skip-pull') { /* legacy no-op — fetch-on-demand has nothing to pull */ }
  else if (a === '--latest') { cli.channelLatest = '1'; }
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

  Non-interactive values (pair any with --yes for a zero-touch install — no placeholders left behind):
    --name <str>            your name (fills YOUR_NAME)
    --project-name <str>    human-readable project name (fills YOUR_PROJECT_NAME)
    --pack <solo|enterprise>            workflow pack (default: solo)
    --tracker <local|github|ado|todoist>  issue tracker (default: local with --yes, else asked)
    --prd-mode <file|tracker|both-file-canonical|both-tracker-canonical>
    --ado-project / --ado-repo / --ado-org-path   ADO fields (enterprise + ado)
    --todoist-project <str>             Todoist project (todoist tracker)
    --org / --lead-dev / --infra-person / --devops-person / --qa-person   team (enterprise)
    --work-root <path>                  work folder (global installs)

  Update channel (how /update-harness fetches new versions — default: latest from GitHub):
    --pin <version>                     pin to a version tag (opt into bumps with --update later)
    --latest                            (re)set the channel to latest
    --local <path>                      update from a local clone (harness development / offline)
    --repo-url <url>                    fetch from a fork instead of the canonical repo
  These flags work at install time and with --update to re-point an existing install.
  --check/--update also accept --source <dir> to reuse an already-fetched checkout.

  Example — fully non-interactive:
    node install/install.js --yes --project /my/app --name "Alex" --project-name "my-app"
`);
    process.exit(0);
  } else if (!projectDir) { projectDir = a; mode = 'project'; }
}

// ── Minimal readline prompt helper ───────────────────────────────────────────
// rl/ask are only created when we actually run the installer (not on require-for-tests).
let rl = null;
const ask = (q) => new Promise((resolve) => rl.question(q, (ans) => resolve(ans)));

// ── Thin wrappers ────────────────────────────────────────────────────────────
// Update/check/switch no longer read a persistent clone — the harness source is
// fetched on demand from the manifest's `update` config (see install/lib/source.js).
// A pre-materialized source can be reused via --source (set from cli.source).
function runCheck(target) { return runCheckImpl(target, { sourceDir: cli.source || null }); }
function runUpdate(target) {
  // --pin / --latest / --local / --repo-url during update re-point the channel.
  const hasChannelFlag = cli.localPath || cli.pinnedVersion || cli.repoUrl || cli.channelLatest;
  const channelOverride = hasChannelFlag ? buildUpdateConfig(cli) : null;
  return runUpdateImpl(target, { cliArgs: args, sourceDir: cli.source || null, channelOverride });
}
function runSwitchTracker(target, tracker) { return runSwitchTrackerImpl(target, tracker); }
function backfillManifest(target, opts = {}) { return backfillManifestImpl(target, opts); }

// ── Managed gitignore block (D4) ────────────────────────────────────────────
const GITIGNORE_SENTINEL_START = '# >>> claude-code-harness managed — do not edit inside this block >>>';
const GITIGNORE_SENTINEL_END = '# <<< claude-code-harness managed <<<';
const MANAGED_GITIGNORE_ENTRIES = [
  'tasks/issues/',
  'tasks/todo.md',
  'tasks/lessons.md',
  'tasks/pr-queue.md',
  'tasks/flags-and-notes.md',
  'tasks/people.md',
  'tasks/admin.md',
  'tasks/tracker-config.md',
  'tasks/sprint*.md',
  'tasks/stories/',
  'tasks/sessions*.jsonl*',
  'tasks/metrics*.jsonl*',
  // Throwaway prototype scratch — the /prototype skill deletes losing candidates
  // after a winner is picked, so these are never meant to be tracked.
  '_prototype/',
  // Transient skill handoffs — overwritten each session, not permanent records.
  // grill-summary.md: /grill-me and /wayfinder Decide→Define hand-off (repo root).
  // operator-state.md: chief-operator agent state, rewritten every session.
  'grill-summary.md',
  'operator-state.md',
];

function writeManagedGitignore(projectDir) {
  const gitignorePath = path.join(projectDir, '.gitignore');
  const block = [GITIGNORE_SENTINEL_START, ...MANAGED_GITIGNORE_ENTRIES, GITIGNORE_SENTINEL_END].join('\n');

  let content = '';
  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf8');
  }

  const startIdx = content.indexOf(GITIGNORE_SENTINEL_START);
  const endIdx = content.indexOf(GITIGNORE_SENTINEL_END);

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing block
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx + GITIGNORE_SENTINEL_END.length);
    content = before + block + after;
  } else {
    // Append new block
    const sep = content.length > 0 && !content.endsWith('\n') ? '\n\n' : content.length > 0 ? '\n' : '';
    content = content + sep + block + '\n';
  }

  fs.writeFileSync(gitignorePath, content, 'utf8');
  console.log('  Wrote managed .gitignore block');
}

// D28: warn if repo's own ignore rules hide the manifest
function checkManifestIgnored(projectDir) {
  try {
    const result = spawnSync('git', ['check-ignore', '-v', '.claude/.harness-manifest.json'], {
      cwd: projectDir, encoding: 'utf8', timeout: 5000,
    });
    if (result.status === 0 && result.stdout.trim()) {
      const line = result.stdout.trim();
      console.log('');
      console.log('  ⚠ Warning: .claude/.harness-manifest.json is hidden by a gitignore rule:');
      console.log(`    ${line}`);
      console.log('  The manifest should be committed (it stores per-repo mode settings).');
      console.log('  Suggested fix: ignore only .claude/settings.local.json instead of all .claude/ files.');
    }
  } catch { /* non-critical — skip if git not available */ }
}

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

  // Validate enum-valued flags up front so a typo fails fast instead of
  // silently installing the wrong pack/tracker.
  const enumFlags = [
    ['--pack', cli.pack, ['solo', 'enterprise']],
    ['--tracker', cli.tracker, ['github', 'ado', 'todoist', 'local']],
    ['--prd-mode', cli.prdMode, ['file', 'tracker', 'both-file-canonical', 'both-tracker-canonical']],
    ['--code-platform', cli.codePlatform, ['github', 'azure-repos', 'none']],
  ];
  for (const [flag, value, allowed] of enumFlags) {
    if (value !== undefined && !allowed.includes(value)) {
      console.error(`  Error: ${flag} must be one of: ${allowed.join(', ')} (got "${value}")`);
      process.exit(1);
    }
  }

  if (!nonInteractive) {
    rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  }
  const prompt = (q, fallback) => {
    if (nonInteractive) return Promise.resolve(fallback);
    return ask(q);
  };
  // Resolve a personalization value: a CLI flag wins in either mode; otherwise
  // prompt when interactive, or fall back to the placeholder when non-interactive.
  const promptValue = async (cliVal, q, placeholder) => {
    if (cliVal) { console.log(`${q}${cliVal}`); return cliVal; }
    const ans = (await prompt(q, '')).trim();
    return ans || placeholder;
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

  // ── Pre-flight: git repository ─────────────────────────────────────────────
  if (mode === 'project' && !fs.existsSync(path.join(projectDir, '.git'))) {
    console.log('  Pre-flight check: git repository');
    console.log(`    ${projectDir} is not a git repository.`);
    console.log('    Features that depend on git — the worktree workflow and PR');
    console.log('    automation — will not work until you run "git init" there.\n');
    const go = (await prompt('  Continue anyway? [y/N]: ', 'y')).trim().toLowerCase();
    console.log('');
    if (go !== 'y') { if (rl) rl.close(); process.exit(1); }
  }

  // ── Workflow pack ──────────────────────────────────────────────────────────
  let workflowPack;
  if (cli.pack) {
    workflowPack = cli.pack;
    console.log(`  Workflow pack: ${workflowPack}\n`);
  } else {
    console.log('  Workflow pack:\n');
    console.log('    1) Enterprise — sprints, stories, team coordination (/story, /sprint-plan)');
    console.log('    2) Solo       — issues, simple priorities (/implement, /plan)\n');
    const packChoice = (await prompt('  Choice [1/2]: ', '2')).trim();
    console.log('');
    workflowPack = packChoice === '2' ? 'solo' : 'enterprise';
  }

  // ── Task list mode (D1, D2) ─────────────────────────────────────────────
  let tracker;
  let trackerMirror = false;
  if (cli.tracker) {
    tracker = cli.tracker;
    trackerMirror = cli.tracker !== 'local' && (cli.trackerMirror === 'true' || cli.trackerMirror === true);
    console.log(`  Issue tracker: ${tracker}${trackerMirror ? ' (with local mirror)' : ''}\n`);
  } else if (nonInteractive) {
    // --yes (D2): local mode, no mirror, no accounts needed
    tracker = 'local';
    trackerMirror = false;
    console.log('  Task list: local (default for non-interactive)\n');
  } else {
    console.log('  Where should your task list live?\n');
    console.log('    1) Local files (recommended to start) — tasks live as markdown in');
    console.log('       tasks/issues/, private to this machine, no accounts needed.');
    console.log('       Great for solo work.');
    console.log('    2) An external tracker — GitHub Issues, Azure DevOps, or Todoist.');
    console.log('       The tracker is the single source of truth. Best when a team');
    console.log('       shares the board.');
    console.log('    3) Both — an external tracker as the source of truth, plus a local');
    console.log('       todo.md mirror that the harness keeps up to date for you.\n');
    const modeChoice = (await prompt('  Choice [1/2/3]: ', '1')).trim();
    console.log('');

    if (modeChoice === '1') {
      tracker = 'local';
    } else {
      trackerMirror = modeChoice === '3';
      // Follow up with the existing tracker-type question
      if (workflowPack === 'enterprise') {
        console.log('  Which external tracker?\n');
        console.log('    1) Azure DevOps  (uses az devops CLI)');
        console.log('    2) GitHub        (uses gh CLI)');
        console.log('    3) Todoist       (uses td CLI)\n');
        const trackerChoice = (await prompt('  Choice [1/2/3]: ', '2')).trim();
        console.log('');
        tracker = trackerChoice === '1' ? 'ado' : trackerChoice === '3' ? 'todoist' : 'github';
      } else {
        console.log('  Which external tracker?\n');
        console.log('    1) GitHub   (uses gh CLI)');
        console.log('    2) Todoist  (uses td CLI)\n');
        const trackerChoice = (await prompt('  Choice [1/2]: ', '1')).trim();
        console.log('');
        tracker = trackerChoice === '2' ? 'todoist' : 'github';
      }
    }
  }

  // ── Code platform (D3, D15) ───────────────────────────────────────────────
  let codePlatform;
  if (cli.codePlatform) {
    codePlatform = cli.codePlatform;
    console.log(`  Code platform: ${codePlatform}\n`);
  } else if (nonInteractive) {
    // --yes dumb rule (D3): remote URL contains github.com → github, else none
    try {
      const remoteResult = spawnSync('git', ['remote', 'get-url', 'origin'], {
        cwd: projectDir || process.cwd(), encoding: 'utf8', timeout: 5000,
      });
      codePlatform = (remoteResult.status === 0 && remoteResult.stdout.includes('github.com'))
        ? 'github' : 'none';
    } catch {
      codePlatform = 'none';
    }
    console.log(`  Code platform (auto-detected): ${codePlatform}\n`);
  } else {
    console.log('  Where do your pull requests live?\n');
    console.log('    1) GitHub / GitHub Enterprise');
    console.log('    2) Azure Repos');
    console.log('    3) Nowhere / none\n');
    const cpChoice = (await prompt('  Choice [1/2/3]: ', '1')).trim();
    console.log('');
    codePlatform = cpChoice === '2' ? 'azure-repos' : cpChoice === '3' ? 'none' : 'github';
  }

  // ── Preflight ──────────────────────────────────────────────────────────────
  console.log('  Checking prerequisites...');
  let missing = 0;
  missing += checkTool('jq', 'https://jqlang.github.io/jq/download/');
  if (tracker === 'ado') missing += checkTool('az', 'https://aka.ms/installazurecli (then: az extension add --name azure-devops)');
  else if (tracker === 'todoist') missing += checkTool('td', 'Todoist CLI — install from your package manager or see project README');
  else if (tracker === 'github') missing += checkTool('gh', 'https://cli.github.com');
  // local tracker needs no external CLI
  if (missing > 0) {
    console.error('\n  Error: Missing prerequisites above. Install them and re-run the installer.');
    process.exit(1);
  }
  console.log('');

  // ── Personalization ────────────────────────────────────────────────────────
  console.log('  Personalization (press Enter to skip and fill in manually later):\n');
  const userName    = await promptValue(cli.userName,    '    Your name                              : ', 'YOUR_NAME');
  const projectName = await promptValue(cli.projectName, '    Project name (human-readable)           : ', 'YOUR_PROJECT_NAME');

  let adoProject = 'YOUR_ADO_PROJECT';
  let adoRepo = 'YOUR_ADO_REPO';
  let adoOrgPath = 'YOUR_ADO_ORG_PATH';
  if (workflowPack === 'enterprise' && tracker === 'ado') {
    adoProject = await promptValue(cli.adoProject, '    ADO project name                       : ', adoProject);
    adoRepo    = await promptValue(cli.adoRepo,    '    ADO repo name                          : ', adoRepo);
    adoOrgPath = await promptValue(cli.adoOrgPath, '    ADO org path (sprint IterationPath)    : ', adoOrgPath);
  }

  let todoistProject = 'YOUR_TODOIST_PROJECT';
  if (tracker === 'todoist') {
    todoistProject = await promptValue(cli.todoistProject, '    Todoist project name                    : ', todoistProject);
  }

  let orgName, leadDev, infraPerson, devopsPerson, qaPerson;
  if (workflowPack === 'enterprise') {
    console.log('');
    console.log('    Team (press Enter to skip — leaves placeholders in skill text):');
    orgName      = await promptValue(cli.orgName,      '    Org / company short name               : ', 'YOUR_ORG');
    leadDev      = await promptValue(cli.leadDev,      '    Lead developer name (architecture)     : ', 'YOUR_LEAD_DEV');
    infraPerson  = await promptValue(cli.infraPerson,  '    Infrastructure / cloud person          : ', 'YOUR_INFRA_PERSON');
    devopsPerson = await promptValue(cli.devopsPerson, '    DevOps / CI/CD / deployments person    : ', 'YOUR_DEVOPS_PERSON');
    qaPerson     = await promptValue(cli.qaPerson,     '    QA / UAT person                        : ', 'YOUR_QA_PERSON');
  } else {
    orgName = cli.orgName || (projectName !== 'YOUR_PROJECT_NAME' ? projectName : 'our');
    leadDev = cli.leadDev || (userName !== 'YOUR_NAME' ? userName : 'the lead dev');
    infraPerson = cli.infraPerson || (userName !== 'YOUR_NAME' ? userName : 'the infra person');
    devopsPerson = cli.devopsPerson || (userName !== 'YOUR_NAME' ? userName : 'the devops person');
    qaPerson = cli.qaPerson || (userName !== 'YOUR_NAME' ? userName : 'the QA person');
  }

  // ── PRD output mode ──────────────────────────────────────────────────────
  let prdMode;
  if (cli.prdMode) {
    prdMode = cli.prdMode;
    console.log(`  PRD output mode: ${prdMode}\n`);
  } else {
    console.log('  Where should PRDs live?\n');
    console.log('    1) File in repo          — PRD.md (default)');
    console.log('    2) Tracker issue         — published to your issue tracker');
    console.log('    3) Both — file canonical — PRD.md is source of truth, tracker is mirror');
    console.log('    4) Both — tracker canonical — tracker issue is source of truth, file is mirror\n');
    const prdChoice = (await prompt('  Choice [1/2/3/4]: ', '1')).trim();
    console.log('');
    const prdModeMap = { '1': 'file', '2': 'tracker', '3': 'both-file-canonical', '4': 'both-tracker-canonical' };
    prdMode = prdModeMap[prdChoice] || 'file';
  }

  let workRoot = '';
  if (mode === 'global') {
    workRoot = await promptValue(cli.workRoot, '    Work root (folder containing projects) : ', 'C:\\YOUR_WORK_FOLDER');
  }

  // Update channel (fetch-on-demand). Default: latest from GitHub. No persistent
  // clone is recorded — /update-harness fetches the source when it runs.
  const update = buildUpdateConfig(cli);
  console.log('');

  // ── Dry run ────────────────────────────────────────────────────────────────
  if (dryRun) {
    printDryRun({ mode, target, workflowPack, tracker, userName, projectName, adoProject, adoRepo, adoOrgPath, workRoot, projectDir }, REPO_DIR);
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
  for (const d of ['skills', 'agents', 'hooks', 'rules', 'trackers/active', 'code-platform/active']) {
    fs.mkdirSync(path.join(target, d), { recursive: true });
  }

  console.log('  Copying skills...');
  const skillSkip = workflowPack === 'solo' ? ENTERPRISE_ONLY_SKILLS : null;
  installedFiles.push(...copyDirsWithLog(path.join(REPO_DIR, 'skills'), path.join(target, 'skills'), 'skills', skillSkip));

  console.log(`  Copying tracker adapter (${tracker})...`);
  installedFiles.push(...copyGlob(path.join(REPO_DIR, 'trackers', tracker), path.join(target, 'trackers/active'), /\.sh$/, 'trackers/active'));
  chmodExecutables(path.join(target, 'trackers/active'));

  const trackerLibSrc = path.join(REPO_DIR, 'trackers/lib');
  if (fs.existsSync(trackerLibSrc)) {
    fs.mkdirSync(path.join(target, 'trackers/lib'), { recursive: true });
    installedFiles.push(...copyGlob(trackerLibSrc, path.join(target, 'trackers/lib'), /\.sh$/, 'trackers/lib'));
  }

  console.log(`  Copying code platform adapter (${codePlatform})...`);
  installedFiles.push(...copyGlob(path.join(REPO_DIR, 'code-platform', codePlatform), path.join(target, 'code-platform/active'), /\.sh$/, 'code-platform/active'));
  chmodExecutables(path.join(target, 'code-platform/active'));

  const codePlatformLibSrc = path.join(REPO_DIR, 'code-platform/lib');
  if (fs.existsSync(codePlatformLibSrc)) {
    fs.mkdirSync(path.join(target, 'code-platform/lib'), { recursive: true });
    installedFiles.push(...copyGlob(codePlatformLibSrc, path.join(target, 'code-platform/lib'), /\.sh$/, 'code-platform/lib'));
  }

  console.log('  Copying agents...');
  const agentSkip = workflowPack === 'solo' ? ENTERPRISE_ONLY_AGENTS : null;
  installedFiles.push(...copyFilesWithLog(path.join(REPO_DIR, 'agents'), path.join(target, 'agents'), /\.md$/, 'agents', false, agentSkip));

  console.log(`  Copying role roster (${workflowPack} pack)...`);
  const rosterSrc = path.join(REPO_DIR, `templates/harness-roles.${workflowPack}.json`);
  if (fs.existsSync(rosterSrc)) {
    fs.copyFileSync(rosterSrc, path.join(target, 'harness-roles.json'));
    installedFiles.push('harness-roles.json');
    console.log('    Installed: harness-roles.json');
  }

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

    const taskConfigFiles = [
      path.join(projectDir, 'tasks/notes.md'),
      path.join(projectDir, 'tasks/tracker-config.md'),
    ];
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
    // YOUR_HARNESS_REPO_PATH is only meaningful for a local clone (improve-harness).
    // On latest/pinned channels there is no clone, so fall back to the repo URL.
    harnessRepoPath: update.localPath || update.repoUrl,
    todoistProject, workRoot, isGlobal: mode === 'global',
    prdMode,
  });

  const sedDirs = ['skills', 'agents', 'hooks', 'rules', 'trackers', 'code-platform']
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
    ? 'SESSION START: Before doing anything else — read tasks/notes.md and tasks/todo.md'
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
    trackerMirror,
    codePlatform,
    prdMode,
    answers: {
      userName, projectName,
      adoProject, adoRepo, adoOrgPath,
      todoistProject,
      orgName, leadDev, infraPerson, devopsPerson, qaPerson,
      workRoot,
    },
    update,
    installedFiles: installedFiles.sort(),
    now,
  });
  const manifestFile = path.join(target, '.harness-manifest.json');
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log('  Wrote .harness-manifest.json');

  // ── Managed gitignore block (D4) ──────────────────────────────────────────
  if (mode === 'project') {
    writeManagedGitignore(projectDir);
    checkManifestIgnored(projectDir);
  }

  // ── Local tracker: ensure tasks/issues/ exists ─────────────────────────────
  if (mode === 'project' && tracker === 'local') {
    const issuesDir = path.join(projectDir, 'tasks', 'issues');
    fs.mkdirSync(issuesDir, { recursive: true });
    console.log('  Created: tasks/issues/');
  }

  // ── Verify ─────────────────────────────────────────────────────────────────
  const verifyFailures = verifyInstall(target, sedDirs, workflowPack);

  // ── Done ───────────────────────────────────────────────────────────────────
  if (verifyFailures > 0) {
    console.log('\n  ══════════════════════════════════════════════════════════════');
    console.log(`  ⚠ install verification FAILED — ${verifyFailures} problem(s) above`);
    console.log('  ══════════════════════════════════════════════════════════════');
  } else {
    console.log('\n  ────────────────────────────────────────────────────────────────');
    console.log('  claude-code-harness installed successfully.');
  }
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

  reportUnfilled({ mode, projectDir, userName, projectName, tracker, workflowPack,
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
