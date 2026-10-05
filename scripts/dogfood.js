#!/usr/bin/env node
'use strict';

// Dogfood link: make this repo's own .claude/ point at the repo-root source via
// symlinks, so editing source IS editing the live harness — no copy, no sync
// step, no watcher. Run ONCE after a fresh clone (or if .claude/ dirs ever got
// replaced with real copies). Day-to-day you never run anything: edit source,
// restart Claude Code, and your changes are already live.
//
//   npm run dogfood
//
// Prerequisite: a base install must have created .claude/settings.json + manifest
// (node install/install.js --project . --yes --name '…' --project-name '…').
// This script only converts the skills/agents/hooks/rules dirs into symlinks.

const fs = require('fs');
const path = require('path');

const { planLinks } = require('./dogfood-links');

const repoRoot = path.resolve(__dirname, '..');
const claudeDir = path.join(repoRoot, '.claude');

// The tracker and code-platform adapters are flattened into `active/` at install time, so the link
// has to name the SELECTED adapter — read it from the manifest rather than guessing.
function readManifest() {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(claudeDir, '.harness-manifest.json'), 'utf8'));
    return { tracker: m.tracker || null, codePlatform: m.codePlatform || m.code_platform || null };
  } catch {
    return {};
  }
}

const LINKS = planLinks(readManifest());

if (!fs.existsSync(path.join(claudeDir, 'settings.json'))) {
  console.error(
    '  No base install found (.claude/settings.json missing).\n' +
    '  Run the installer once first:\n' +
    "    node install/install.js --project . --yes --name 'Your Name' --project-name 'claude-code-harness'\n" +
    '  then re-run: npm run dogfood'
  );
  process.exit(1);
}

let changed = 0;
for (const { from: name, to, relative } of LINKS) {
  const linkPath = path.join(claudeDir, ...name.split('/'));
  const target = relative.split('/').join(path.sep); // .claude/<name> -> repo-root/<to>
  const sourceDir = path.join(repoRoot, ...to.split('/'));

  if (!fs.existsSync(sourceDir)) {
    console.error(`  Source dir missing: ${to}/ — skipping.`);
    continue;
  }

  // Nested links (trackers/active) need their parent to exist first.
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });

  // Already the correct symlink? leave it.
  try {
    if (fs.lstatSync(linkPath).isSymbolicLink() && fs.readlinkSync(linkPath) === target) {
      continue;
    }
  } catch {
    /* linkPath doesn't exist yet — fall through to create it */
  }

  fs.rmSync(linkPath, { recursive: true, force: true });

  try {
    fs.symlinkSync(target, linkPath);
  } catch (err) {
    // Windows refuses symlink() unless the user has Developer Mode on or is elevated, so on a
    // normal Windows account this is the default outcome, not an edge case. Directory JUNCTIONS
    // need no such privilege and behave the same for our purposes — a path that resolves to
    // another directory. Junctions must be given an absolute target.
    if (err.code !== 'EPERM' || process.platform !== 'win32') throw err;
    try {
      fs.symlinkSync(sourceDir, linkPath, 'junction');
    } catch (junctionErr) {
      console.error(
        `  Could not link .claude/${name}.\n` +
        `    symlink failed: ${err.code}\n` +
        `    junction failed: ${junctionErr.code}\n` +
        '  On Windows, either turn on Developer Mode (Settings > System > For developers)\n' +
        '  or run this once from an elevated terminal. Dogfood mode is optional — the harness\n' +
        '  works fine from a plain install, you just have to reinstall after editing source.'
      );
      process.exitCode = 1;
      continue;
    }
    console.log(`  linked .claude/${name} -> ${target}  (junction — Windows without Developer Mode)`);
    changed++;
    continue;
  }

  console.log(`  linked .claude/${name} -> ${target}`);
  changed++;
}

console.log(
  changed === 0
    ? '  Already in dogfood link mode — source is the live harness. Nothing to do.'
    : '\n  Dogfood link mode set. Editing source now updates the live harness directly.\n' +
      '  Restart Claude Code to load changes (a running session cannot reload its own harness).'
);
