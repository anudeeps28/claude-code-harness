'use strict';

// Fetch-on-demand harness source resolution.
//
// The updater no longer depends on a persistent local clone. Instead it resolves
// a *source directory* on demand from the manifest's `update` config, uses it, and
// (for fetched sources) deletes it. Three channels:
//
//   latest  (default) → shallow-clone the default branch into a temp dir
//   pinned            → shallow-clone a specific version tag into a temp dir
//   local             → use an existing local clone in place (dogfood / offline dev)
//
// git and temp-dir creation are injectable so this module is unit-testable without
// network access.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULT_REPO_URL = 'https://github.com/anudeeps28/claude-code-harness';
const VALID_CHANNELS = new Set(['latest', 'pinned', 'local']);

function defaultRunGit(args, opts = {}) {
  return spawnSync('git', args, { timeout: opts.timeout || 60000, stdio: 'pipe' });
}

function defaultMkTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cch-src-'));
}

function rmTemp(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

// Coerce a manifest `update` block (possibly partial or absent) into a well-formed
// config with defaults filled. Never mutates its input.
function normalizeUpdateConfig(update) {
  const u = update && typeof update === 'object' ? update : {};
  const channel = VALID_CHANNELS.has(u.channel) ? u.channel : 'latest';
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    repoUrl: str(u.repoUrl) || DEFAULT_REPO_URL,
    channel,
    pinnedVersion: str(u.pinnedVersion),
    localPath: str(u.localPath),
  };
}

// Candidate git refs to try for a pinned version, tolerating both "3.2.0" and
// "v3.2.0" tag naming.
function pinnedRefCandidates(version) {
  const v = version.trim();
  const alt = v.startsWith('v') ? v.slice(1) : `v${v}`;
  return alt === v ? [v] : [v, alt];
}

// Resolve a usable harness source directory from the update config.
// Returns { dir, cleanup, ephemeral, channel }. Callers MUST invoke cleanup()
// (a no-op for the local channel) when done — use try/finally.
function resolveSource(update, opts = {}) {
  const cfg = normalizeUpdateConfig(update);
  const runGit = opts.runGit || defaultRunGit;
  const mkTempDir = opts.mkTempDir || defaultMkTempDir;

  if (cfg.channel === 'local') {
    if (!cfg.localPath) {
      throw new Error('update.channel is "local" but update.localPath is not set. '
        + 'Point it at a harness clone, or switch to --latest.');
    }
    if (!fs.existsSync(cfg.localPath) || !fs.existsSync(path.join(cfg.localPath, 'VERSION'))) {
      throw new Error(`Local harness source not found at ${cfg.localPath} (no VERSION file). `
        + 'Fix update.localPath in the manifest, or switch to --latest.');
    }
    return { dir: cfg.localPath, cleanup: () => {}, ephemeral: false, channel: 'local' };
  }

  // latest | pinned → shallow clone into a throwaway temp dir.
  const refs = cfg.channel === 'pinned'
    ? pinnedRefCandidates(cfg.pinnedVersion || '')
    : [null];
  if (cfg.channel === 'pinned' && !cfg.pinnedVersion) {
    throw new Error('update.channel is "pinned" but update.pinnedVersion is not set.');
  }

  let lastErr = '';
  for (const ref of refs) {
    const tmp = mkTempDir();
    const args = ['clone', '--depth', '1'];
    if (ref) args.push('--branch', ref);
    args.push(cfg.repoUrl, tmp);
    const res = runGit(args, { timeout: opts.timeout || 60000 });
    if (res && res.status === 0 && fs.existsSync(path.join(tmp, 'VERSION'))) {
      return { dir: tmp, cleanup: () => rmTemp(tmp), ephemeral: true, channel: cfg.channel };
    }
    lastErr = (res && res.stderr ? res.stderr.toString().trim() : '') || lastErr;
    rmTemp(tmp);
  }

  const what = cfg.channel === 'pinned'
    ? `version "${cfg.pinnedVersion}"`
    : 'the latest version';
  throw new Error(`Could not fetch ${what} from ${cfg.repoUrl}.\n`
    + `  ${lastErr || 'Check your network connection and the repo URL.'}`);
}

// Migrate a legacy manifest (with answers.harnessRepoPath and no `update` block)
// to the fetch-on-demand shape. Returns { changed, manifest } — never mutates input.
// Best-effort: if the old clone still has an origin remote, its URL is preserved so
// forks keep updating from their own remote.
function migrateUpdateConfig(manifest, opts = {}) {
  if (manifest && manifest.update && typeof manifest.update === 'object') {
    return { changed: false, manifest };
  }
  const answers = (manifest && manifest.answers) || {};
  const oldPath = answers.harnessRepoPath;
  let repoUrl = DEFAULT_REPO_URL;

  if (oldPath && fs.existsSync(oldPath)) {
    const runGit = opts.runGit || defaultRunGit;
    try {
      const res = runGit(['-C', oldPath, 'remote', 'get-url', 'origin'], { timeout: 5000 });
      if (res && res.status === 0) {
        const url = (res.stdout || '').toString().trim();
        if (url) repoUrl = url.replace(/\.git$/, '');
      }
    } catch { /* fall back to default */ }
  }

  const newAnswers = { ...answers };
  delete newAnswers.harnessRepoPath;
  const migrated = {
    ...manifest,
    schemaVersion: 2,
    answers: newAnswers,
    update: { repoUrl, channel: 'latest', pinnedVersion: null, localPath: null },
  };
  return { changed: true, manifest: migrated };
}

module.exports = {
  DEFAULT_REPO_URL,
  VALID_CHANNELS,
  normalizeUpdateConfig,
  pinnedRefCandidates,
  resolveSource,
  migrateUpdateConfig,
};
