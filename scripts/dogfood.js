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

const repoRoot = path.resolve(__dirname, '..');
const claudeDir = path.join(repoRoot, '.claude');
const LINKED = ['skills', 'agents', 'hooks', 'rules'];

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
for (const name of LINKED) {
  const linkPath = path.join(claudeDir, name);
  const target = path.join('..', name); // relative: .claude/<name> -> ../<name>
  const sourceDir = path.join(repoRoot, name);

  if (!fs.existsSync(sourceDir)) {
    console.error(`  Source dir missing: ${name}/ — skipping.`);
    continue;
  }

  // Already the correct symlink? leave it.
  try {
    if (fs.lstatSync(linkPath).isSymbolicLink() && fs.readlinkSync(linkPath) === target) {
      continue;
    }
  } catch {
    /* linkPath doesn't exist yet — fall through to create it */
  }

  fs.rmSync(linkPath, { recursive: true, force: true });
  fs.symlinkSync(target, linkPath);
  console.log(`  linked .claude/${name} -> ${target}`);
  changed++;
}

console.log(
  changed === 0
    ? '  Already in dogfood link mode — source is the live harness. Nothing to do.'
    : '\n  Dogfood link mode set. Editing source now updates the live harness directly.\n' +
      '  Restart Claude Code to load changes (a running session cannot reload its own harness).'
);
