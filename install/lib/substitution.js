'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { walk } = require('../../hooks/lib/walk.js');

const IS_WINDOWS = process.platform === 'win32';

function toUnixPath(p) {
  if (!IS_WINDOWS) return p;
  const norm = p.replace(/\\/g, '/');
  return norm.replace(/^([a-zA-Z]):\//, (_, drv) => `/${drv.toLowerCase()}/`);
}

function toWinPath(p) {
  const m = p.match(/^\/([a-zA-Z])\/(.*)$/);
  if (m) return `${m[1].toUpperCase()}:\\${m[2].replace(/\//g, '\\')}`;
  return p.replace(/\//g, '\\');
}

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
    // NOTE: YOUR_TODOIST_PROJECT is deliberately NOT substituted tree-wide. It is a
    // literal sentinel in runtime code (hooks/lib/project-state.js, trackers/todoist/*.sh)
    // used to detect an unfilled value — rewriting it there inverts those guards. The real
    // placeholder in the task templates is filled by a separate substituteInFile() pass in
    // install.js, so nothing here needs opts.todoistProject.
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

function buildSettings({ hooksUnix, sessionStartMsg: _sessionStartMsg, workRoot, isGlobal }) {
  const nodeCmd = (script) => `node "${hooksUnix}/${script}"`;
  const settings = {
    hooks: {
      PreToolUse: [
        { matcher: 'Bash|Write', hooks: [{ type: 'command', command: nodeCmd('safety-check.js') }] },
        { matcher: 'Bash', hooks: [{ type: 'command', command: nodeCmd('inventory-check.js') }] },
      ],
      PostToolUse: [{
        matcher: 'Write|Edit',
        hooks: [
          { type: 'command', command: nodeCmd('catalog-trigger.js') },
          { type: 'command', command: nodeCmd('drift-check.js') },
        ],
      }],
      PreCompact: [{ matcher: '*', hooks: [{ type: 'command', command: nodeCmd('pre-compact.js') }] }],
      SessionStart: [{ matcher: '*', hooks: [
        { type: 'command', command: nodeCmd('session-start-msg.js') },
        { type: 'command', command: nodeCmd('session-context.js') },
        { type: 'command', command: nodeCmd('session-router.js') },
        { type: 'command', command: nodeCmd('tracker-sync.js') + ' start' },
      ] }],
      SessionEnd: [{ matcher: '*', hooks: [
        { type: 'command', command: nodeCmd('session-log.js') },
        { type: 'command', command: nodeCmd('tracker-sync.js') + ' end' },
      ] }],
    },
  };
  if (isGlobal && workRoot) {
    settings.env = { CLAUDE_HARNESS_WORK_ROOT: workRoot };
  }
  return settings;
}

function buildManifest({ harnessVersion, installMode, workflowPack, tracker, trackerMirror, codePlatform, prdMode, answers, installedFiles, now }) {
  const manifest = {
    schemaVersion: 1,
    harnessVersion,
    installMode,
    workflowPack,
    tracker,
    codePlatform: codePlatform || 'none',
    prdMode,
    answers,
    installedFiles,
    installedAt: now,
    updatedAt: now,
  };
  // trackerMirror: true only for "both" mode (external tracker + local mirror).
  // Derivation: local → local mode; external + mirror=false → tracker mode; external + mirror=true → both mode.
  if (trackerMirror) manifest.trackerMirror = true;
  return manifest;
}

function subsFromManifest(manifest, target, harnessRepoPath) {
  const answers = manifest.answers || {};
  const mode = manifest.installMode || 'project';
  const hooksUnix = mode === 'global'
    ? `${os.homedir().replace(/\\/g, '/')}/.claude/hooks`
    : toUnixPath(path.join(target, 'hooks'));
  const hooksWin = toWinPath(mode === 'global'
    ? path.join(os.homedir(), '.claude', 'hooks')
    : path.join(target, 'hooks'));
  const projectRootBash = mode === 'global' ? '$(pwd)' : toUnixPath(path.dirname(target));
  return buildSubstitutions({
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
    todoistProject: answers.todoistProject || 'YOUR_TODOIST_PROJECT',
    workRoot: answers.workRoot || '',
    isGlobal: mode === 'global',
    prdMode: manifest.prdMode || 'file',
  });
}

module.exports = {
  toUnixPath, toWinPath, buildSubstitutions, substituteInTree, substituteInFile,
  buildSettings, buildManifest, subsFromManifest,
};
