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
const {
  DEFAULT_REPO_URL, normalizeUpdateConfig, resolveSource, migrateUpdateConfig,
} = require('./source.js');

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
  'tracker-sync.js',
]);

// Agents only the enterprise pack's skills spawn. The story-understand / -executor
// / -pr agents are NOT here: /implement and /run-tasks (both solo skills) spawn them
// by name, so skipping them in solo left those skills pointing at agents that were
// never installed.
const ENTERPRISE_ONLY_AGENTS = new Set([
  'story-plan-agent.md',
  'sprint-plan-gap-analyzer.md',
  'sprint-plan-docs-reader.md',
  'sprint-plan-tracker-reader.md',
]);

// Skills that only exist in the enterprise pack. Previously every skill was copied
// to every install, so solo users got /story and /sprint-plan — which spawn the
// enterprise-only agents above and cannot work in a solo install.
const ENTERPRISE_ONLY_SKILLS = new Set([
  'story',
  'sprint-plan',
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

// Placeholder tokens that are intentional runtime sentinels (compared against as
// literals in code), not unfilled template values — excluded from the scan below.
const SENTINEL_PLACEHOLDERS = ['YOUR_TODOIST_PROJECT'];

// Returns null if `rel` (relative to `target`) is a present, non-empty regular file;
// otherwise a short reason string ('missing', 'empty', 'not a file') for the caller to
// report. A dangling symlink reports as 'missing' — statSync throws following it.
function checkRequiredFile(target, rel) {
  let stat;
  try {
    stat = fs.statSync(path.join(target, rel));
  } catch {
    return 'missing';
  }
  if (!stat.isFile()) return 'not a file';
  if (stat.size === 0) return 'empty';
  return null;
}

function verifyInstall(target, sedDirs, workflowPack = 'enterprise') {
  console.log('  Verifying installation...');
  let fail = 0;
  const required = [
    ...(workflowPack === 'enterprise'
      ? ['skills/story/SKILL.md', 'agents/story-plan-agent.md']
      : ['skills/implement/SKILL.md']),
    // Spawned by /implement and /run-tasks, so required in BOTH packs.
    'agents/story-understand-agent.md',
    'agents/story-executor-agent.md',
    'agents/story-pr-agent.md',
    'agents/implement-planner-agent.md',
    'harness-roles.json',
    'hooks/safety-check.js',
    'rules/code-style.md',
    'trackers/active/get-issue.sh',
    'trackers/lib/retry.sh',
    'code-platform/active/get-pr-review-threads.sh',
    'code-platform/lib/retry.sh',
  ];
  for (const rel of required) {
    const reason = checkRequiredFile(target, rel);
    if (reason) {
      console.log(`  [MISSING] ${rel} (${reason})`);
      fail++;
    }
  }

  // Roster drift check: parse harness-roles.json (if present and readable) and derive
  // the role-identity agent files it points at — a renamed/missing roles.*.agent is
  // roster drift, not just a missing hardcoded filename.
  const rosterReason = checkRequiredFile(target, 'harness-roles.json');
  if (!rosterReason) {
    const rosterPath = path.join(target, 'harness-roles.json');
    let roster = null;
    try {
      roster = JSON.parse(fs.readFileSync(rosterPath, 'utf8'));
    } catch (e) {
      console.log(`  [ROSTER] harness-roles.json is not valid JSON: ${e.message}`);
      fail++;
    }
    if (roster) {
      if (roster.schemaVersion !== 2) {
        console.log(`  [ROSTER] harness-roles.json schemaVersion ${roster.schemaVersion} is not supported (expected 2)`);
        fail++;
      }
      const pipeline = Array.isArray(roster.pipeline) ? roster.pipeline : [];
      const roles = roster.roles && typeof roster.roles === 'object' ? roster.roles : {};
      const roleAgentFiles = [];
      for (const roleKey of pipeline) {
        const role = roles[roleKey];
        if (!role || typeof role.agent !== 'string' || !role.agent) {
          console.log(`  [ROSTER] pipeline entry "${roleKey}" has no matching roles.${roleKey}.agent`);
          fail++;
          continue;
        }
        roleAgentFiles.push(`agents/${role.agent}.md`);
      }
      for (const rel of roleAgentFiles) {
        const reason = checkRequiredFile(target, rel);
        if (reason) {
          console.log(`  [MISSING] ${rel} (${reason}) — referenced by harness-roles.json roster`);
          fail++;
        }
      }
    }
  }

  const forbidden = ['package.json', 'node_modules', 'eslint.config.js', '__tests__', 'coverage'];
  for (const name of forbidden) {
    if (fs.existsSync(path.join(target, name))) {
      console.log(`  [LEAKED]  ${name} — dev-only artefact found in install`);
      fail++;
    }
  }
  if (workflowPack === 'solo') {
    for (const skill of ENTERPRISE_ONLY_SKILLS) {
      if (fs.existsSync(path.join(target, 'skills', skill))) {
        console.log(`  [PACK]    skills/${skill} — enterprise-only skill in a solo install`);
        fail++;
      }
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
        // Strip sentinel literals before testing — runtime code compares against
        // these on purpose, so they are not unfilled placeholders.
        let probe = lines[i];
        for (const sentinel of SENTINEL_PLACEHOLDERS) probe = probe.split(sentinel).join('');
        if (probe.includes('YOUR_')) {
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
    console.log('  Fill them non-interactively by re-running with the matching CLI flags');
    console.log('  (e.g. --name, --project-name; run with --help for the full list),');
    console.log('  or edit the files manually. See CONFIGURE.md for the placeholder reference.');
  }
  console.log('');
  return fail;
}

// Maps each personalization placeholder to the CLI flag that fills it, so the
// installer can print an exact re-run command instead of a dead-end warning.
const PLACEHOLDER_FLAGS = {
  YOUR_NAME: '--name',
  YOUR_PROJECT_NAME: '--project-name',
  YOUR_ADO_PROJECT: '--ado-project',
  YOUR_ADO_REPO: '--ado-repo',
  YOUR_ADO_ORG_PATH: '--ado-org-path',
  YOUR_ORG: '--org',
  YOUR_LEAD_DEV: '--lead-dev',
  YOUR_INFRA_PERSON: '--infra-person',
  YOUR_DEVOPS_PERSON: '--devops-person',
  YOUR_QA_PERSON: '--qa-person',
};

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
  if (!unfilled.length) return;

  console.log(`  Note: Some values were left at their defaults: ${unfilled.join(' ')}`);
  const targetFlag = opts.mode === 'global' ? '--global' : `--project ${opts.projectDir || '<path>'}`;
  const flagArgs = unfilled.map((p) => `${PLACEHOLDER_FLAGS[p]} "..."`).join(' ');
  console.log('  Fill them in non-interactively by re-running with:');
  console.log(`    node install/install.js --yes ${targetFlag} ${flagArgs}`);
  console.log('  Or edit the files manually — see CONFIGURE.md.\n');
}

function printDryRun(ctx, repoDir) {
  console.log('  ── DRY RUN (no files will be modified) ──\n');
  console.log(`  Mode:          ${ctx.mode}`);
  console.log(`  Target:        ${ctx.target}`);
  console.log(`  Workflow pack: ${ctx.workflowPack}`);
  console.log(`  Tracker:       ${ctx.tracker}`);
  console.log(`  User:          ${ctx.userName}`);
  console.log(`  Project name:  ${ctx.projectName}`);
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

function runCheck(target, opts = {}) {
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

  // Migrate the legacy persistent-clone shape in memory. The change is persisted
  // on the next --update, not during a read-only check.
  const { manifest: m } = migrateUpdateConfig(manifest);
  const update = normalizeUpdateConfig(m.update);

  // Resolve the harness source: a caller-supplied --source dir (already materialized,
  // e.g. by the update-harness skill) is used as-is; otherwise fetch on demand.
  // Always cleaned up before returning.
  let src;
  if (opts.sourceDir) {
    if (!fs.existsSync(path.join(opts.sourceDir, 'VERSION'))) {
      return { error: 'invalid-source', message: `--source ${opts.sourceDir} is not a harness checkout (no VERSION file).` };
    }
    src = { dir: opts.sourceDir, cleanup: () => {}, ephemeral: false, channel: update.channel };
  } else {
    try {
      src = resolveSource(update);
    } catch (e) {
      return { error: 'fetch-failed', message: e.message, channel: update.channel };
    }
  }

  try {
    const currentVersion = m.harnessVersion;
    const latestVersion = fs.readFileSync(path.join(src.dir, 'VERSION'), 'utf8').trim();
    const updateAvailable = currentVersion !== latestVersion;

    let changelogExcerpt = '';
    const changelogPath = path.join(src.dir, 'CHANGELOG.md');
    if (fs.existsSync(changelogPath)) {
      const cl = fs.readFileSync(changelogPath, 'utf8');
      const unreleasedMatch = cl.match(/## \[Unreleased\]\s*\n([\s\S]*?)(?=\n## \[|$)/i);
      if (unreleasedMatch) changelogExcerpt = unreleasedMatch[1].trim().slice(0, 2000);
    }

    const orphans = [];
    const sourceFiles = new Set();
    for (const dir of ['skills', 'agents', 'hooks', 'rules']) {
      const srcDir = path.join(src.dir, dir);
      if (!fs.existsSync(srcDir)) continue;
      const files = walk(srcDir, { match: () => true });
      for (const f of files) sourceFiles.add(`${dir}/${path.relative(srcDir, f).split(path.sep).join('/')}`);
    }
    for (const installed of (m.installedFiles || [])) {
      if (installed === 'settings.json') continue;
      if (installed === 'harness-roles.json') continue; // generated by the installer, not copied from a source dir
      if (installed.startsWith('trackers/')) continue;
      if (installed.startsWith('code-platform/')) continue;
      if (!sourceFiles.has(installed)) orphans.push(installed);
    }

    const subs = subsFromManifest(m, target);
    const drifted = [];
    for (const rel of (m.installedFiles || [])) {
      if (rel === 'settings.json') continue;
      const installedPath = path.join(target, rel);
      const sourcePath = path.join(src.dir, rel);
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
      channel: src.channel, currentVersion, latestVersion, updateAvailable,
      changelogExcerpt, orphans, drifted, manifestPath,
    };
  } finally {
    src.cleanup();
  }
}

// D22-D24: Handle the first update crossing into the modes era.
// Mutates manifest in place with the new fields; caller writes it later.
function handleModeCrossing(manifest, target, nonInteractive) {
  const projectRoot = path.dirname(target);

  // D22: Record mode. Non-interactive defaults to "both" (existing tracker + mirror).
  if (nonInteractive) {
    manifest.trackerMirror = true;
    console.log('  Mode crossing: defaulting to "both" mode (tracker + local mirror).');
  } else {
    // In interactive mode we'd ask, but runUpdate is currently synchronous.
    // Default to "both" for the existing tracker (preserves old behavior where
    // todo.md was hand-written alongside an external tracker).
    manifest.trackerMirror = true;
    console.log('  Mode crossing: setting trackerMirror=true (existing tracker + local mirror).');
    console.log('  To change later, re-run the installer with --switch-tracker.');
  }

  // D23: Archive old hand-written todo.md before regeneration overwrites it.
  const todoPath = path.join(projectRoot, 'tasks', 'todo.md');
  const backupPath = path.join(projectRoot, 'tasks', 'todo-manual-backup.md');
  if (fs.existsSync(todoPath) && !fs.existsSync(backupPath)) {
    fs.renameSync(todoPath, backupPath);
    console.log('  Archived: tasks/todo.md → tasks/todo-manual-backup.md');
    console.log('  The next session will offer assisted item-by-item conversion.');
  }

  // D24: Detect committed task files and report (never mutate git index).
  const managedPatterns = [
    'tasks/issues/', 'tasks/todo.md', 'tasks/lessons.md', 'tasks/pr-queue.md',
    'tasks/flags-and-notes.md', 'tasks/people.md', 'tasks/admin.md',
    'tasks/tracker-config.md', 'tasks/stories/',
    'grill-summary.md', 'operator-state.md',
  ];
  try {
    const result = spawnSync('git', ['ls-files', '--', ...managedPatterns], {
      cwd: projectRoot, encoding: 'utf8', timeout: 5000,
    });
    if (result.status === 0 && result.stdout.trim()) {
      const tracked = result.stdout.trim().split('\n').filter(Boolean);
      if (tracked.length > 0) {
        console.log('');
        console.log('  ⚠ The following task files are tracked in git:');
        for (const f of tracked) console.log(`    ${f}`);
        console.log('');
        console.log('  To untrack (keeps local copies but removes from repo):');
        console.log(`    git rm --cached ${tracked.join(' ')}`);
        console.log('');
        console.log('  Warning: untracking removes these files from teammates\' clones on pull.');
      }
    }
  } catch { /* non-critical — skip if git not available */ }
}

function runUpdate(target, { cliArgs = [], sourceDir = null, channelOverride = null } = {}) {
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

  // Migrate the legacy persistent-clone shape; persisted when we write the manifest below.
  const migration = migrateUpdateConfig(manifest);
  const m = migration.manifest;
  if (migration.changed) {
    console.log('  Migrated update config → fetch-on-demand channel "latest" (no local clone needed).');
  }
  // A --pin / --latest / --local flag re-points the channel as part of this update.
  if (channelOverride) {
    m.update = channelOverride;
    console.log(`  Update channel set to "${channelOverride.channel}"${channelOverride.channel === 'pinned' ? ` (${channelOverride.pinnedVersion})` : ''}.`);
  }
  const update = normalizeUpdateConfig(m.update);

  // Resolve the harness source BEFORE any mutation, so a fetch failure aborts before
  // we touch the install. A caller-supplied --source dir is used as-is (no fetch,
  // no cleanup); otherwise fetch on demand and remove it in the finally.
  let src;
  if (sourceDir) {
    if (!fs.existsSync(path.join(sourceDir, 'VERSION'))) {
      console.error(`  Error: --source ${sourceDir} is not a harness checkout (no VERSION file).`);
      process.exit(1);
    }
    src = { dir: sourceDir, cleanup: () => {}, ephemeral: false, channel: update.channel };
  } else {
    try {
      src = resolveSource(update);
    } catch (e) {
      console.error('  Error: ' + e.message);
      process.exit(1);
    }
  }
  console.log(src.ephemeral
    ? `  Fetched harness source (channel: ${src.channel})`
    : `  Using local harness source: ${src.dir}`);

  try {
  const backupsDir = path.join(os.homedir(), '.claude', '.harness-backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15);
  const snapshotDir = path.join(backupsDir, stamp);
  fs.mkdirSync(snapshotDir, { recursive: true });
  for (const d of ['skills', 'agents', 'hooks', 'rules', 'trackers']) {
    const s = path.join(target, d);
    if (fs.existsSync(s)) fs.cpSync(s, path.join(snapshotDir, d), { recursive: true });
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

  // No git pull here: a fetched shallow clone is already at the target ref, and the
  // local channel intentionally uses the working tree as-is (dogfood development).

  // ── Mode crossing (D22-D24): first update into the modes era ──────────────
  const nonInteractive = cliArgs.includes('--yes') || cliArgs.includes('-y');
  if (!('trackerMirror' in m)) {
    handleModeCrossing(m, target, nonInteractive);
  }

  const installedFiles = [];
  const { workflowPack, tracker } = m;
  const codePlatform = m.codePlatform || 'none';
  for (const d of ['skills', 'agents', 'hooks', 'rules', 'trackers/active', 'code-platform/active']) {
    fs.mkdirSync(path.join(target, d), { recursive: true });
  }

  const skillSkip = workflowPack === 'solo' ? ENTERPRISE_ONLY_SKILLS : null;
  installedFiles.push(...copyDirsWithLog(path.join(src.dir, 'skills'), path.join(target, 'skills'), 'skills', skillSkip));

  // Migrate: installs made before skills were pack-filtered carry enterprise-only
  // skill directories. Per-file orphan removal empties them but leaves the dir, so
  // prune the whole directory. Harness-managed path only; the snapshot backs it up.
  if (skillSkip) {
    for (const skill of skillSkip) {
      const skillDir = path.join(target, 'skills', skill);
      if (fs.existsSync(skillDir)) {
        fs.rmSync(skillDir, { recursive: true, force: true });
        console.log(`    Migrated: removed skills/${skill} (enterprise-only)`);
      }
    }
  }
  installedFiles.push(...copyGlob(path.join(src.dir, 'trackers', tracker || 'github'), path.join(target, 'trackers/active'), /\.sh$/, 'trackers/active'));
  chmodExecutables(path.join(target, 'trackers/active'));

  const trackerLibSrc = path.join(src.dir, 'trackers/lib');
  if (fs.existsSync(trackerLibSrc)) {
    fs.mkdirSync(path.join(target, 'trackers/lib'), { recursive: true });
    installedFiles.push(...copyGlob(trackerLibSrc, path.join(target, 'trackers/lib'), /\.sh$/, 'trackers/lib'));
  }

  // Migrate: remove old PR scripts from trackers/active/ (now in code-platform/)
  const oldPrScripts = ['get-pr-review-threads.sh', 'reply-pr-thread.sh', 'resolve-pr-thread.sh'];
  for (const script of oldPrScripts) {
    const oldPath = path.join(target, 'trackers/active', script);
    if (fs.existsSync(oldPath)) {
      fs.rmSync(oldPath, { force: true });
      console.log(`    Migrated: removed trackers/active/${script} (now in code-platform/)`);
    }
  }

  // Copy code-platform adapter
  const codePlatformSrcDir = path.join(src.dir, 'code-platform', codePlatform);
  if (fs.existsSync(codePlatformSrcDir)) {
    installedFiles.push(...copyGlob(codePlatformSrcDir, path.join(target, 'code-platform/active'), /\.sh$/, 'code-platform/active'));
    chmodExecutables(path.join(target, 'code-platform/active'));
  }

  const codePlatformLibSrc = path.join(src.dir, 'code-platform/lib');
  if (fs.existsSync(codePlatformLibSrc)) {
    fs.mkdirSync(path.join(target, 'code-platform/lib'), { recursive: true });
    installedFiles.push(...copyGlob(codePlatformLibSrc, path.join(target, 'code-platform/lib'), /\.sh$/, 'code-platform/lib'));
  }

  const agentSkip = workflowPack === 'solo' ? ENTERPRISE_ONLY_AGENTS : null;
  installedFiles.push(...copyFilesWithLog(path.join(src.dir, 'agents'), path.join(target, 'agents'), /\.md$/, 'agents', false, agentSkip));

  const rosterSrc = path.join(src.dir, `templates/harness-roles.${workflowPack}.json`);
  if (fs.existsSync(rosterSrc)) {
    fs.copyFileSync(rosterSrc, path.join(target, 'harness-roles.json'));
    installedFiles.push('harness-roles.json');
    console.log('    Updated:   harness-roles.json');
  }

  installedFiles.push(...copyFilesWithLog(path.join(src.dir, 'hooks'), path.join(target, 'hooks'), null, 'hooks', true));

  const hooksLibSrc = path.join(src.dir, 'hooks/lib');
  if (fs.existsSync(hooksLibSrc)) {
    fs.mkdirSync(path.join(target, 'hooks/lib'), { recursive: true });
    installedFiles.push(...copyGlob(hooksLibSrc, path.join(target, 'hooks/lib'), /\.js$/, 'hooks/lib'));
  }

  installedFiles.push(...copyFilesWithLog(path.join(src.dir, 'rules'), path.join(target, 'rules'), /\.md$/, 'rules'));

  const mode = m.installMode || 'project';
  const substitutions = subsFromManifest(m, target);
  const sedDirs = ['skills', 'agents', 'hooks', 'rules', 'trackers', 'code-platform']
    .map((d) => path.join(target, d))
    .filter((d) => fs.existsSync(d));
  for (const dir of sedDirs) substituteInTree(dir, substitutions);

  const oldFiles = new Set(m.installedFiles || []);
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
    ? 'SESSION START: Before doing anything else — read tasks/notes.md and tasks/todo.md'
    : 'SESSION START: Before doing anything else — read tasks/lessons.md, todo.md, pr-queue.md, and flags-and-notes.md';
  const newHarnessSettings = buildSettings({
    hooksUnix, workflowPack: workflowPack || 'solo', sessionStartMsg,
    workRoot: m.answers?.workRoot || '', isGlobal: mode === 'global',
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

  const verifyFailures = verifyInstall(target, sedDirs, workflowPack);

    const newVersion = fs.readFileSync(path.join(src.dir, 'VERSION'), 'utf8').trim();
    const updatedManifest = {
      ...m,
      harnessVersion: newVersion,
      installedFiles: installedFiles.sort(),
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 2) + '\n', 'utf8');

    if (verifyFailures > 0) {
      console.log('');
      console.log('  ══════════════════════════════════════════════════════════════');
      console.log(`  ⚠ install verification FAILED — ${verifyFailures} problem(s) above`);
      console.log('  ══════════════════════════════════════════════════════════════');
    }

    console.log(`\n  Updated: ${m.harnessVersion} → ${newVersion}`);
    console.log(`  Restore: cp -r "${snapshotDir}/"* "${target}/"`);

    if (!updatedManifest.tracker) {
      console.log('');
      console.log('  ⚠ Tracker not configured for this project.');
      console.log('  Set it with: node install/install.js --switch-tracker <github|todoist|ado> --project ' + path.dirname(target));
    }
  } finally {
    src.cleanup();
  }
}

function runSwitchTracker(target, tracker) {
  const VALID_TRACKERS = new Set(['github', 'todoist', 'ado', 'local', 'none']);
  if (!VALID_TRACKERS.has(tracker)) {
    console.error(`  Error: Invalid tracker "${tracker}". Choose: github, todoist, ado, local, none`);
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

  // Migrate legacy shape so the tracker switch also persists the fetch-on-demand config.
  const { manifest: m } = migrateUpdateConfig(manifest);
  const oldTracker = m.tracker || '(none)';

  if (tracker !== 'none') {
    // Adapter scripts come from the harness source, fetched on demand.
    const src = resolveSource(normalizeUpdateConfig(m.update));
    try {
      const trackerSrcDir = path.join(src.dir, 'trackers', tracker);
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

      const libSrc = path.join(src.dir, 'trackers', 'lib');
      if (fs.existsSync(libSrc)) {
        const libDest = path.join(target, 'trackers', 'lib');
        fs.mkdirSync(libDest, { recursive: true });
        copyGlob(libSrc, libDest, /\.sh$/);
      }
    } finally {
      src.cleanup();
    }
  }

  m.tracker = tracker === 'none' ? null : tracker;
  // Switching to local clears mirror; switching to external preserves it
  if (tracker === 'local') m.trackerMirror = false;
  m.updatedAt = new Date().toISOString();
  fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2) + '\n', 'utf8');

  console.log(`  Tracker switched: ${oldTracker} → ${tracker}`);

  // D25: mode-switch reuses archive flow — archive old todo.md for assisted conversion
  const projectRoot = path.dirname(target);
  const todoPath = path.join(projectRoot, 'tasks', 'todo.md');
  const backupPath = path.join(projectRoot, 'tasks', 'todo-manual-backup.md');
  if (fs.existsSync(todoPath) && !fs.existsSync(backupPath)) {
    fs.renameSync(todoPath, backupPath);
    console.log('  Archived: tasks/todo.md → tasks/todo-manual-backup.md');
    console.log('  Use /sync-tracker --import-backup to convert items to the new tracker.');
  }

  // Create tasks/issues/ for local mode
  if (tracker === 'local') {
    const issuesDir = path.join(projectRoot, 'tasks', 'issues');
    fs.mkdirSync(issuesDir, { recursive: true });
    console.log('  Created: tasks/issues/');
  }

  const trackerConfigPath = path.join(projectRoot, 'tasks', 'tracker-config.md');
  if (fs.existsSync(trackerConfigPath)) {
    try {
      let content = fs.readFileSync(trackerConfigPath, 'utf8');
      const label = tracker === 'todoist' ? 'Todoist' : tracker === 'ado' ? 'ADO' : tracker === 'local' ? 'Local' : 'GitHub';
      content = content.replace(/\*\*Type:\*\*\s*\[?[^\]\n]*/i, `**Type:** ${label}`);
      fs.writeFileSync(trackerConfigPath, content, 'utf8');
      console.log('  Updated tasks/tracker-config.md');
    } catch { /* non-critical */ }
  }
}

function backfillManifest(target, opts = {}) {
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
    for (const f of files) installedFiles.push(`${dir}/${path.relative(fullDir, f).split(path.sep).join('/')}`);
  }
  if (fs.existsSync(path.join(target, 'settings.json'))) installedFiles.push('settings.json');

  const harnessVersion = opts.harnessVersion || 'unknown';
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
      ...(opts.answers || {}),
    },
    update: opts.update || { repoUrl: DEFAULT_REPO_URL, channel: 'latest', pinnedVersion: null, localPath: null },
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
  HARNESS_HOOK_SCRIPTS, ENTERPRISE_ONLY_AGENTS, ENTERPRISE_ONLY_SKILLS,
};
