// Project-state detection — determines whether a project root looks like a
// fresh greenfield workspace or an active one with prior planning artifacts.
//
// Fail-open philosophy: every boundary (filesystem, gh CLI) is wrapped in
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

function defaultGhRunner() {
  return execFileSync(
    'gh',
    ['issue', 'list', '--state', 'open', '--limit', '1', '--json', 'number'],
    { encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] }
  );
}

function defaultFirstIssueRunner() {
  return execFileSync(
    'gh',
    ['issue', 'list', '--state', 'open', '--limit', '1', '--json', 'number,title'],
    { encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] }
  );
}

// Probe the gh CLI for open issues. Returns { openIssues, ghAvailable }.
// Never throws — any failure yields { openIssues: null, ghAvailable: false }.
function detectOpenIssues(opts) {
  const ghRunner = (opts && opts.ghRunner) ? opts.ghRunner : defaultGhRunner;
  try {
    const raw = ghRunner();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { openIssues: null, ghAvailable: false };
    return { openIssues: parsed.length, ghAvailable: true };
  } catch {
    return { openIssues: null, ghAvailable: false };
  }
}

// Probe the gh CLI for the first open issue. Returns { number, title } or null.
// Never throws — any failure yields null.
function detectFirstOpenIssue(opts) {
  const runner = (opts && opts.firstIssueRunner) ? opts.firstIssueRunner : defaultFirstIssueRunner;
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
// signals  — { artifacts, openIssues, ghAvailable }
// firstIssue — { number, title } or null
function renderGuidance(state, signals, firstIssue) {
  if (state === 'greenfield') {
    return (
      'Project looks greenfield — no planning artifacts or open issues detected.\n' +
      'Have an idea? Start with /grill-me to pressure-test it into a spec, then /plan.'
    );
  }
  if (firstIssue !== null && firstIssue !== undefined) {
    return (
      'Active project — open issues detected.\n' +
      'Next: /implement #' + firstIssue.number + ' (' + firstIssue.title + ')\n' +
      'Or run /plan to break down work before implementing.'
    );
  }
  const artifacts = (signals && signals.artifacts) || [];
  return (
    'Active project — planning artifacts detected (' + artifacts.join(', ') + ').\n' +
    'Next: /plan to break work into issues, or /implement once issues exist.'
  );
}

// Detect whether projectRoot looks greenfield or active.
// opts.artifactPaths  — override the default set of relative paths to probe
// opts.ghRunner       — injectable replacement for the gh execFileSync call
function detectProjectState(projectRoot, opts) {
  const options = opts || {};
  const artifactPaths = Array.isArray(options.artifactPaths)
    ? options.artifactPaths
    : DEFAULT_ARTIFACT_PATHS;

  const artifacts = artifactPaths.filter((rel) => {
    try {
      return fs.existsSync(path.join(projectRoot, rel));
    } catch {
      return false;
    }
  });

  const { openIssues, ghAvailable } = detectOpenIssues(options);

  const state =
    artifacts.length > 0 || (openIssues !== null && openIssues >= 1)
      ? 'active'
      : 'greenfield';

  return {
    state,
    signals: { artifacts, openIssues, ghAvailable },
  };
}

module.exports = {
  detectProjectState,
  detectOpenIssues,
  detectFirstOpenIssue,
  renderGuidance,
};
