'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { walk } = require('../../hooks/lib/walk.js');
const { copyDirsWithLog, copyFilesWithLog, copyGlob, chmodExecutables } = require('./copy.js');
const {
  toUnixPath, substituteInTree, buildSettings,
  buildManifest, subsFromManifest,
} = require('./substitution.js');

const HARNESS_HOOK_SCRIPTS = new Set([
  'safety-check.js',
  'catalog-trigger.js',
  'drift-check.js',
  'inventory-check.js',
  'pre-compact.js',
  'session-start-msg.js',
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

function printDryRun(ctx, repoDir) {
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
  const skillCount   = count(path.join(repoDir, 'skills'),  (e) => e.isDirectory());
  const agentCount   = count(path.join(repoDir, 'agents'),  (e) => e.isFile() && e.name.endsWith('.md'));
  const hookCount    = count(path.join(repoDir, 'hooks'),   (e) => e.isFile());
  const ruleCount    = count(path.join(repoDir, 'rules'),   (e) => e.isFile() && e.name.endsWith('.md'));
  const trackerCount = count(path.join(repoDir, 'trackers', ctx.tracker), (e) => e.isFile() && e.name.endsWith('.sh'));
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

function runCheck(target, repoDir) {
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

  const harnessRepoPath = (manifest.answers && manifest.answers.harnessRepoPath) || repoDir;
  if (!fs.existsSync(harnessRepoPath) || !fs.existsSync(path.join(harnessRepoPath, 'VERSION'))) {
    return { error: 'clone-not-found', message: `Harness clone not found at ${harnessRepoPath}. Git clone it and re-run.` };
  }

  const currentVersion = manifest.harnessVersion;
  const latestVersion = fs.readFileSync(path.join(harnessRepoPath, 'VERSION'), 'utf8').trim();

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

  let dirty = false;
  const statusResult = spawnSync('git', ['status', '--porcelain'], { cwd: harnessRepoPath, timeout: 5000, stdio: 'pipe' });
  if (statusResult.status === 0 && statusResult.stdout.toString().trim().length > 0) dirty = true;

  let changelogExcerpt = '';
  const changelogPath = path.join(harnessRepoPath, 'CHANGELOG.md');
  if (fs.existsSync(changelogPath)) {
    const cl = fs.readFileSync(changelogPath, 'utf8');
    const unreleasedMatch = cl.match(/## \[Unreleased\]\s*\n([\s\S]*?)(?=\n## \[|$)/i);
    if (unreleasedMatch) changelogExcerpt = unreleasedMatch[1].trim().slice(0, 2000);
  }

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

  const subs = subsFromManifest(manifest, target, harnessRepoPath);
  const drifted = [];
  for (const rel of (manifest.installedFiles || [])) {
    if (rel === 'settings.json') continue;
    const installedPath = path.join(target, rel);
    const sourcePath = path.join(harnessRepoPath, rel);
    if (!fs.existsSync(installedPath) || !fs.existsSync(sourcePath)) continue;
    const installedHash = crypto.createHash('sha256').update(fs.readFileSync(installedPath)).digest('hex');
    let sourceContent = fs.readFileSync(sourcePath);
    if (/\.(md|sh|js|json|yaml|yml)$/i.test(rel)) {
      let text = sourceContent.toString('utf8');
      for (const [key, value] of subs) text = text.split(key).join(value);
      sourceContent = Buffer.from(text, 'utf8');
    }
    const sourceHash = crypto.createHash('sha256').update(sourceContent).digest('hex');
    if (installedHash !== sourceHash) drifted.push(rel);
  }

  return {
    currentVersion, latestVersion, behind, dirty,
    fetchError, changelogExcerpt, orphans, drifted, manifestPath,
  };
}

function runUpdate(target, { repoDir, cliArgs = [] }) {
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

  const harnessRepoPath = (manifest.answers && manifest.answers.harnessRepoPath) || repoDir;
  if (!fs.existsSync(harnessRepoPath) || !fs.existsSync(path.join(harnessRepoPath, 'VERSION'))) {
    console.error(`  Error: Harness clone not found at ${harnessRepoPath}`);
    console.error('  Git clone it and re-run, or update answers.harnessRepoPath in the manifest.');
    process.exit(1);
  }

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

  const allSnapshots = fs.readdirSync(backupsDir).sort();
  while (allSnapshots.length > 3) {
    const old = allSnapshots.shift();
    fs.rmSync(path.join(backupsDir, old), { recursive: true, force: true });
  }

  const skipPull = cliArgs.includes('--skip-pull');
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

  const mode = manifest.installMode || 'project';
  const substitutions = subsFromManifest(manifest, target, harnessRepoPath);
  const sedDirs = ['skills', 'agents', 'hooks', 'rules', 'trackers']
    .map((d) => path.join(target, d))
    .filter((d) => fs.existsSync(d));
  for (const dir of sedDirs) substituteInTree(dir, substitutions);

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

  const hooksUnix = mode === 'global'
    ? `${os.homedir().replace(/\\/g, '/')}/.claude/hooks`
    : toUnixPath(path.join(target, 'hooks'));
  const sessionStartMsg = workflowPack === 'solo'
    ? 'SESSION START: Before doing anything else — read tasks/notes.md and tasks/plan.md'
    : 'SESSION START: Before doing anything else — read tasks/lessons.md, todo.md, pr-queue.md, and flags-and-notes.md';
  const newHarnessSettings = buildSettings({
    hooksUnix, workflowPack: workflowPack || 'solo', sessionStartMsg,
    workRoot: manifest.answers?.workRoot || '', isGlobal: mode === 'global',
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

  verifyInstall(target, sedDirs, workflowPack);

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

  if (!updatedManifest.tracker) {
    console.log('');
    console.log('  ⚠ Tracker not configured for this project.');
    console.log('  Set it with: node install/install.js --switch-tracker <github|todoist|ado> --project ' + path.dirname(target));
  }
}

function runSwitchTracker(target, tracker, repoDir) {
  const VALID_TRACKERS = new Set(['github', 'todoist', 'ado', 'none']);
  if (!VALID_TRACKERS.has(tracker)) {
    console.error(`  Error: Invalid tracker "${tracker}". Choose: github, todoist, ado, none`);
    process.exit(1);
  }

  const manifestPath = path.join(target, '.harness-manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error('  Error: No .harness-manifest.json found. Run the installer first.');
    process.exit(1);
  }

  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch (e) {
    console.error(`  Error: Cannot parse manifest: ${e.message}`);
    process.exit(1);
  }

  const harnessRepoPath = (manifest.answers && manifest.answers.harnessRepoPath) || repoDir;
  const oldTracker = manifest.tracker || '(none)';

  if (tracker !== 'none') {
    const trackerSrcDir = path.join(harnessRepoPath, 'trackers', tracker);
    if (!fs.existsSync(trackerSrcDir)) {
      console.error(`  Error: Tracker adapter source not found at ${trackerSrcDir}`);
      process.exit(1);
    }

    const activeDir = path.join(target, 'trackers', 'active');
    fs.mkdirSync(activeDir, { recursive: true });
    for (const f of fs.readdirSync(activeDir)) {
      if (f.endsWith('.sh')) fs.rmSync(path.join(activeDir, f), { force: true });
    }

    copyGlob(trackerSrcDir, activeDir, /\.sh$/, 'trackers/active');
    chmodExecutables(activeDir);
    console.log(`  Copied ${tracker} adapter scripts to trackers/active/`);

    const libSrc = path.join(harnessRepoPath, 'trackers', 'lib');
    if (fs.existsSync(libSrc)) {
      const libDest = path.join(target, 'trackers', 'lib');
      fs.mkdirSync(libDest, { recursive: true });
      copyGlob(libSrc, libDest, /\.sh$/);
    }
  }

  manifest.tracker = tracker === 'none' ? null : tracker;
  manifest.updatedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

  console.log(`  Tracker switched: ${oldTracker} → ${tracker}`);

  const trackerConfigPath = path.join(path.dirname(target), 'tasks', 'tracker-config.md');
  if (fs.existsSync(trackerConfigPath)) {
    try {
      let content = fs.readFileSync(trackerConfigPath, 'utf8');
      const label = tracker === 'todoist' ? 'Todoist' : tracker === 'ado' ? 'ADO' : 'GitHub';
      content = content.replace(/\*\*Type:\*\*\s*\[?[^\]\n]*/i, `**Type:** ${label}`);
      fs.writeFileSync(trackerConfigPath, content, 'utf8');
      console.log('  Updated tasks/tracker-config.md');
    } catch { /* non-critical */ }
  }
}

function backfillManifest(target, opts = {}, repoDir) {
  const agentsDir = path.join(target, 'agents');
  let workflowPack = 'solo';
  if (fs.existsSync(agentsDir)) {
    const agents = fs.readdirSync(agentsDir);
    if (agents.some(a => ENTERPRISE_ONLY_AGENTS.has(a))) workflowPack = 'enterprise';
  }

  let tracker = null;
  const projectRoot = path.dirname(target);
  try {
    const configPath = path.join(projectRoot, 'tasks', 'tracker-config.md');
    if (fs.existsSync(configPath)) {
      const configContent = fs.readFileSync(configPath, 'utf8');
      const m = configContent.match(/\*\*Type:\*\*\s*\[?\s*(GitHub|Todoist|ADO|Azure DevOps)\s*\]?/i);
      if (m) {
        const raw = m[1].toLowerCase();
        if (raw === 'todoist') tracker = 'todoist';
        else if (raw === 'ado' || raw === 'azure devops') tracker = 'ado';
        else tracker = 'github';
      }
    }
  } catch { /* fail-open */ }

  if (!tracker) {
    tracker = 'github';
    const trackerDir = path.join(target, 'trackers/active');
    if (fs.existsSync(trackerDir)) {
      const scripts = fs.readdirSync(trackerDir).filter(f => f.endsWith('.sh'));
      for (const script of scripts) {
        const content = fs.readFileSync(path.join(trackerDir, script), 'utf8');
        if (content.includes('az boards')) { tracker = 'ado'; break; }
        if (/\btd\s/.test(content)) { tracker = 'todoist'; break; }
      }
    }
  }

  const installedFiles = [];
  for (const dir of ['skills', 'agents', 'hooks', 'rules', 'trackers']) {
    const fullDir = path.join(target, dir);
    if (!fs.existsSync(fullDir)) continue;
    const files = walk(fullDir, { match: () => true });
    for (const f of files) installedFiles.push(`${dir}/${path.relative(fullDir, f)}`);
  }
  if (fs.existsSync(path.join(target, 'settings.json'))) installedFiles.push('settings.json');

  const harnessVersion = opts.harnessVersion || 'unknown';
  const harnessRepoPath = opts.harnessRepoPath || repoDir;
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

module.exports = {
  isHarnessHook, reconcileSettings, verifyInstall, reportUnfilled, printDryRun,
  runCheck, runUpdate, runSwitchTracker, backfillManifest,
  HARNESS_HOOK_SCRIPTS, ENTERPRISE_ONLY_AGENTS,
};
