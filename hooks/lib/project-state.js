// @ts-check
// Project-state detection — determines whether a project root looks like a
// fresh greenfield workspace or an active one with prior planning artifacts.
//
// Tracker-agnostic: detects which tracker adapter is installed (GitHub, ADO,
// Todoist) and probes for open tasks accordingly.
//
// Fail-open philosophy: every boundary (filesystem, CLI) is wrapped in
// try/catch. On any error the signal is simply absent; we never throw and
// never block the caller. The returned `state` therefore leans toward
// 'greenfield' when evidence is unclear, which is the safer default.

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DEFAULT_ARTIFACT_PATHS = [
  'grill-summary.md',
  'PRD.md',
  'ARCHITECTURE.md',
  'tasks/plan.md',
];

// Detect which tracker is active. Cascade:
// 1. opts.tracker (explicit override)
// 2. .claude/.harness-manifest.json tracker field
// 3. tasks/tracker-config.md Type field
// 4. trackers/active/ script contents
// 5. CLI availability probe
// Returns 'github' | 'todoist' | 'ado' | null.
function detectActiveTracker(projectRoot, opts) {
  const options = opts || {};

  if (options.tracker) return options.tracker;

  // Check manifest for tracker field (single source of truth)
  try {
    const manifestPath = path.join(projectRoot, '.claude', '.harness-manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.tracker) return manifest.tracker;
    }
  } catch { /* fail-open */ }

  // Check tracker-config.md for explicit Type field
  try {
    const configPath = path.join(projectRoot, 'tasks', 'tracker-config.md');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      const match = content.match(/\*\*Type:\*\*\s*\[?\s*(GitHub|Todoist|ADO|Azure DevOps|Local)\s*\]?/i);
      if (match) {
        const raw = match[1].toLowerCase();
        if (raw === 'todoist') return 'todoist';
        if (raw === 'local') return 'local';
        if (raw === 'github') return 'github';
        if (raw === 'ado' || raw === 'azure devops') return 'ado';
      }
    }
  } catch { /* fail-open */ }

  // Check which tracker adapter scripts exist
  try {
    const activePath = path.join(projectRoot, '.claude', 'trackers', 'active');
    if (fs.existsSync(activePath)) {
      const scripts = fs.readdirSync(activePath);
      // Each backend's scripts carry a distinct check_auth_* marker (or the
      // Todoist td-CLI reference). Match on those before defaulting to github.
      for (const script of scripts) {
        try {
          const content = fs.readFileSync(path.join(activePath, script), 'utf8');
          if (content.includes('TODOIST_CLI') || content.includes('check_auth_todoist')) return 'todoist';
          if (content.includes('check_auth_ado')) return 'ado';
          if (content.includes('check_auth_local')) return 'local';
        } catch { /* ignore individual file errors */ }
      }
      // Default to github if adapter scripts exist but no Todoist/ADO/local markers
      return 'github';
    }
  } catch { /* fail-open */ }

  // Probe CLI availability as last resort
  try {
    execFileSync('gh', ['--version'], { encoding: 'utf8', timeout: 1000, stdio: 'ignore' });
    return 'github';
  } catch { /* not available */ }

  return null;
}

// Read the Todoist project name from config files.
// Cascade: tasks/tracker-config.md → tasks/notes.md ## Todoist section.
// Returns the project name string or null.
function readTodoistProject(projectRoot) {
  // Primary: tracker-config.md
  try {
    const configPath = path.join(projectRoot, 'tasks', 'tracker-config.md');
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      const match = content.match(/todoist_project\s*=\s*(.+)/i);
      if (match) {
        const val = match[1].trim();
        if (val && val !== 'YOUR_TODOIST_PROJECT') return val;
      }
    }
  } catch { /* fail-open */ }

  // Fallback: tasks/notes.md ## Todoist section with project: <name>
  try {
    const notesPath = path.join(projectRoot, 'tasks', 'notes.md');
    if (fs.existsSync(notesPath)) {
      const content = fs.readFileSync(notesPath, 'utf8');
      const todoistSection = content.match(/##\s*Todoist[\s\S]*?(?=\n##\s|\n---|$)/i);
      if (todoistSection) {
        const projMatch = todoistSection[0].match(/project\s*:\s*(.+)/i);
        if (projMatch) {
          const val = projMatch[1].trim();
          if (val) return val;
        }
      }
    }
  } catch { /* fail-open */ }

  return null;
}

function defaultGhRunner() {
  return execFileSync(
    'gh',
    ['issue', 'list', '--state', 'open', '--limit', '1', '--json', 'number'],
    { encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] }
  );
}

function defaultTdRunner(projectRoot) {
  const td = process.env.TODOIST_CLI || 'td';
  const args = ['task', 'list', '--json'];
  const proj = readTodoistProject(projectRoot || process.cwd());
  if (proj) args.push('--project', proj);
  return execFileSync(
    td,
    args,
    { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }
  );
}

function defaultFirstIssueRunner() {
  return execFileSync(
    'gh',
    ['issue', 'list', '--state', 'open', '--limit', '1', '--json', 'number,title'],
    { encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] }
  );
}

function defaultFirstTodoistTaskRunner(projectRoot) {
  const td = process.env.TODOIST_CLI || 'td';
  const args = ['task', 'list', '--json'];
  const proj = readTodoistProject(projectRoot || process.cwd());
  if (proj) args.push('--project', proj);
  return execFileSync(
    td,
    args,
    { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }
  );
}

function defaultLocalRunner(projectRoot) {
  const scriptPath = path.join(projectRoot || process.cwd(), '.claude', 'trackers', 'active', 'list-issues.sh');
  return execFileSync(
    'bash',
    [scriptPath],
    { encoding: 'utf8', timeout: 5000, cwd: projectRoot || process.cwd(), stdio: ['ignore', 'pipe', 'ignore'] }
  );
}

// Probe for open issues/tasks. Returns { openIssues, trackerAvailable }.
// Never throws — any failure yields { openIssues: null, trackerAvailable: false }.
function detectOpenIssues(opts) {
  const options = opts || {};
  const tracker = options.activeTracker || 'github';

  if (tracker === 'local') {
    const localRunner = options.localRunner || function() { return defaultLocalRunner(options.projectRoot); };
    try {
      const raw = localRunner();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return { openIssues: null, trackerAvailable: false };
      return { openIssues: parsed.length, trackerAvailable: true };
    } catch {
      return { openIssues: null, trackerAvailable: false };
    }
  }

  if (tracker === 'todoist') {
    const tdRunner = options.tdRunner || function() { return defaultTdRunner(options.projectRoot); };
    try {
      const raw = tdRunner();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return { openIssues: null, trackerAvailable: false };
      const openTasks = parsed.filter(function(t) { return !t.is_completed; });
      return { openIssues: openTasks.length, trackerAvailable: true };
    } catch {
      return { openIssues: null, trackerAvailable: false };
    }
  }

  // GitHub / ADO default path
  const ghRunner = options.ghRunner || defaultGhRunner;
  try {
    const raw = ghRunner();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { openIssues: null, trackerAvailable: false };
    return { openIssues: parsed.length, trackerAvailable: true };
  } catch {
    return { openIssues: null, trackerAvailable: false };
  }
}

// Probe for the first open issue/task. Returns { number, title } or null.
// For Todoist, returns { id, title } instead.
// Never throws — any failure yields null.
function detectFirstOpenIssue(opts) {
  const options = opts || {};
  const tracker = options.activeTracker || 'github';

  if (tracker === 'local') {
    const runner = options.localRunner || function() { return defaultLocalRunner(options.projectRoot); };
    try {
      const raw = runner();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length < 1) return null;
      return { number: parsed[0].id, title: parsed[0].title };
    } catch {
      return null;
    }
  }

  if (tracker === 'todoist') {
    const runner = options.firstTodoistTaskRunner || function() { return defaultFirstTodoistTaskRunner(options.projectRoot); };
    try {
      const raw = runner();
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length < 1) return null;
      const openTasks = parsed.filter(function(t) { return !t.is_completed; });
      if (openTasks.length < 1) return null;
      return { id: openTasks[0].id, title: openTasks[0].content };
    } catch {
      return null;
    }
  }

  // GitHub default
  const runner = options.firstIssueRunner || defaultFirstIssueRunner;
  try {
    const raw = runner();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length < 1) return null;
    return { number: parsed[0].number, title: parsed[0].title };
  } catch {
    return null;
  }
}

// Pure function: produce a human-readable guidance string based on project state.
// state    — 'greenfield' or 'active'
// signals  — { artifacts, openIssues, trackerAvailable, tracker }
// firstIssue — { number, title } (GitHub) or { id, title } (Todoist) or null
function renderGuidance(state, signals, firstIssue) {
  const tracker = (signals && signals.tracker) || 'github';

  if (state === 'greenfield') {
    return (
      'Project looks greenfield — no planning artifacts or open tasks detected.\n' +
      'Have an idea? Start with /grill-me to pressure-test it into a spec, then /plan.'
    );
  }
  if (firstIssue !== null && firstIssue !== undefined) {
    if (tracker === 'todoist') {
      return (
        'Active project — open Todoist tasks detected.\n' +
        'Next: /implement "' + firstIssue.title + '"\n' +
        'Or run /plan to prioritize work before implementing.'
      );
    }
    if (tracker === 'local') {
      return (
        'Active project — open local tasks detected.\n' +
        'Next: /implement #' + firstIssue.number + ' (' + firstIssue.title + ')\n' +
        'Or run /plan to break down work before implementing.'
      );
    }
    return (
      'Active project — open issues detected.\n' +
      'Next: /implement #' + firstIssue.number + ' (' + firstIssue.title + ')\n' +
      'Or run /plan to break down work before implementing.'
    );
  }
  const artifacts = (signals && signals.artifacts) || [];
  return (
    'Active project — planning artifacts detected (' + artifacts.join(', ') + ').\n' +
    'Next: /plan to break work into tasks, or /implement once tasks exist.'
  );
}

// Detect whether projectRoot looks greenfield or active.
// opts.artifactPaths  — override the default set of relative paths to probe
// opts.ghRunner       — injectable replacement for the gh execFileSync call
// opts.tdRunner       — injectable replacement for the td execFileSync call
// opts.tracker        — force a specific tracker type
function detectProjectState(projectRoot, opts) {
  const options = opts || {};
  const artifactPaths = Array.isArray(options.artifactPaths)
    ? options.artifactPaths
    : DEFAULT_ARTIFACT_PATHS;

  const artifacts = artifactPaths.filter(function(rel) {
    try {
      return fs.existsSync(path.join(projectRoot, rel));
    } catch {
      return false;
    }
  });

  const tracker = detectActiveTracker(projectRoot, options);
  const { openIssues, trackerAvailable } = detectOpenIssues({
    ...options,
    activeTracker: tracker,
    projectRoot,
  });

  const state =
    artifacts.length > 0 || (openIssues !== null && openIssues >= 1)
      ? 'active'
      : 'greenfield';

  return {
    state,
    signals: { artifacts, openIssues, trackerAvailable, tracker },
  };
}

function verifyTrackerAdapters(projectRoot) {
  let manifestTracker = null;
  try {
    const manifestPath = path.join(projectRoot, '.claude', '.harness-manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifestTracker = manifest.tracker || null;
    }
  } catch { /* fail-open */ }

  if (!manifestTracker) return { match: true, manifestTracker: null, detectedTracker: null };

  let detectedTracker = null;
  const activePath = path.join(projectRoot, '.claude', 'trackers', 'active');
  try {
    if (fs.existsSync(activePath)) {
      const scripts = fs.readdirSync(activePath).filter(s => s.endsWith('.sh'));
      for (const script of scripts) {
        try {
          const content = fs.readFileSync(path.join(activePath, script), 'utf8');
          if (content.includes('TODOIST_CLI') || content.includes('check_auth_todoist')) { detectedTracker = 'todoist'; break; }
          if (content.includes('check_auth_ado') || content.includes('az boards')) { detectedTracker = 'ado'; break; }
          if (content.includes('check_auth_local')) { detectedTracker = 'local'; break; }
        } catch { /* ignore */ }
      }
      if (!detectedTracker && scripts.length > 0) detectedTracker = 'github';
    }
  } catch { /* fail-open */ }

  return {
    match: manifestTracker === detectedTracker,
    manifestTracker,
    detectedTracker,
    activeDir: activePath,
  };
}

module.exports = {
  detectProjectState,
  detectActiveTracker,
  detectOpenIssues,
  detectFirstOpenIssue,
  readTodoistProject,
  renderGuidance,
  verifyTrackerAdapters,
};
