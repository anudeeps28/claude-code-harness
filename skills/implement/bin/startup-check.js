#!/usr/bin/env node
// startup-check.js — /implement's check, before Phase 1, that every agent, skill and adapter
// script it names is installed (#22). Reads the "## Required tools" list in ../SKILL.md, so the
// list lives next to the instructions that use it and a probe test keeps the two in step.
//
// Usage: node startup-check.js [--claude-dir <dir>]... [--with rework]
//   --claude-dir  where to look; repeatable, first match wins. Default: ./.claude then ~/.claude
//   --with rework check what a --rework run needs instead of what a build needs
//
// Prints one "missing <kind>: <name> (needed by <phase>)" line per missing tool and exits 1;
// prints nothing and exits 0 when everything is there.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const SKILL_PATH = path.join(__dirname, '..', 'SKILL.md');
const ENTRY_RE = /^- (agent|skill|tracker-script|code-platform-script) `([^`]+)` — (.+?) · (build|rework|both)\s*$/;

const KIND_PATH = {
  agent: (name) => path.join('agents', `${name}.md`),
  skill: (name) => path.join('skills', name, 'SKILL.md'),
  'tracker-script': (name) => path.join('trackers', 'active', name),
  'code-platform-script': (name) => path.join('code-platform', 'active', name),
};

/** @returns {{kind: string, name: string, phase: string, only: string|undefined}[]} */
function readRequired(skillPath = SKILL_PATH) {
  const text = fs.readFileSync(skillPath, 'utf8').replace(/\r/g, '');
  const start = text.indexOf('\n## Required tools');
  if (start === -1) throw new Error(`no "## Required tools" section in ${skillPath}`);
  const end = text.indexOf('\n## ', start + 1);
  const required = [];
  for (const line of text.slice(start, end === -1 ? undefined : end).split('\n')) {
    const m = line.match(ENTRY_RE);
    if (!m) continue;
    required.push({ kind: m[1], name: m[2], phase: m[3], only: m[4] === 'both' ? undefined : m[4] });
  }
  return required;
}

function parseArgs(argv) {
  const dirs = [];
  let mode = 'build';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--claude-dir') dirs.push(argv[++i]);
    else if (argv[i] === '--with' && argv[i + 1] === 'rework') { mode = 'rework'; i++; }
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (dirs.length === 0) dirs.push(path.join(process.cwd(), '.claude'), path.join(os.homedir(), '.claude'));
  return { dirs, mode };
}

function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) {
    process.stderr.write(`${e.message}\n`);
    process.exit(2);
  }
  const missing = [];
  for (const r of readRequired()) {
    if (r.only && r.only !== args.mode) continue;
    const rel = KIND_PATH[r.kind](r.name);
    if (!args.dirs.some((d) => fs.existsSync(path.join(d, rel)))) {
      missing.push(`missing ${r.kind}: ${r.name} (needed by ${r.phase})`);
    }
  }
  if (missing.length) {
    process.stdout.write(missing.join('\n') + '\n');
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { readRequired };
