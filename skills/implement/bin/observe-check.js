#!/usr/bin/env node
// observe-check.js — /implement's startup check of the item's Demo against the project's Observe
// section (F3 #38). Observe lives in tasks/lessons.md (enterprise) or tasks/notes.md (solo) and says
// how this harness may see the running app: environment, how to start it, screenshots, a read-only
// API and database, the e2e command.
//
// Usage: node observe-check.js --demo <file> [--observe <file>] [--plan <plan.md>]
//   --demo     the file holding the Demo: tasks/stories/<id>/ticket.md, or plan.md at plan approval
//   --observe  default: tasks/lessons.md, else tasks/notes.md
//   --plan     at plan approval: a probe is satisfied by a task named "Build the probe: <entry>"
//
// Output, one line each:
//   probe <entry>: ...           a code-level tool is missing; the plan must build it   (exit 0)
//   missing <entry>: ...         access is missing; the run stops                       (exit 1)
//   missing variable <NAME>: ... the named credential is not set; the run stops         (exit 1)
//   missing probe task: ...      (--plan) a probe with no task in the plan               (exit 1)
//   refused: ...                 the environment is prod (or unknown); the run stops    (exit 1)
//   unchecked: ...               no Demo, or no "Seen through:" line, to compare        (exit 0)
// Nothing printed, exit 0: everything the Demo needs is there. Exit 2: usage error.
//
// A credential's VALUE is never printed — not from the environment, and not when someone pasted a
// value into Observe where the variable's name belongs.

const fs = require('node:fs');
const path = require('node:path');
const { parseDemo } = require('./demo.js');

const UNSET = /^(|<!--.*-->|not applicable|n\/a|tbd|todo)$/i;
const VAR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const OK_ENVIRONMENTS = ['local', 'test'];
const PROD = /^(prod|production|live)$/i;

// What each way of seeing the Demo needs. access → stop when absent; probe → plan a task to build it;
// variable → an entry naming an environment variable that must be set ("none" means no login).
const NEEDS = {
  screenshot: [['Environment', 'access'], ['Start the app', 'access'], ['Screenshot', 'probe']],
  api: [['Environment', 'access'], ['API base URL', 'access'], ['API credential variable', 'variable']],
  database: [['Environment', 'access'], ['Database credential variable', 'variable'], ['Read-only queries', 'access']],
  log: [['Environment', 'access'], ['Start the app', 'access']],
  test: [['E2E command', 'probe']],
  person: [],
};

/** @returns {{found: boolean, entries: Map<string, string>}} keys are lower-cased entry names */
function parseObserve(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const start = lines.findIndex((l) => /^## Observe\s*$/.test(l));
  const entries = new Map();
  if (start === -1) return { found: false, entries };
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2} /.test(lines[i])) break;
    const m = lines[i].match(/^\s*-\s+([^:]+):\s*(.*?)\s*$/);
    if (!m) continue;
    const value = m[2].replace(/^`(.*)`$/, '$1').trim();
    if (UNSET.test(value)) continue;
    entries.set(m[1].trim().toLowerCase(), value);
  }
  return { found: true, entries };
}

function defaultObserveFile() {
  for (const f of [path.join('tasks', 'lessons.md'), path.join('tasks', 'notes.md')]) {
    if (fs.existsSync(f)) return f;
  }
  return null;
}

function planTaskNames(planText) {
  return [...planText.matchAll(/<name>\s*([\s\S]*?)\s*<\/name>/g)].map((m) => m[1].trim().toLowerCase());
}

/** @returns {{stops: string[], notes: string[]}} */
function check({ demoText, observeText, observeFile, planText, env }) {
  const demo = parseDemo(demoText);
  if (!demo) return { stops: [], notes: ['unchecked: no "## Demo" in the item; the plan must write one, and this check runs again at plan approval'] };
  if (demo.seenThrough.length === 0) return { stops: [], notes: ['unchecked: the Demo has no "Seen through:" line; the plan must add one, and this check runs again at plan approval'] };

  const { entries } = parseObserve(observeText || '');
  const where = observeFile || 'the lessons/notes file';
  const stops = [];
  const probes = [];
  const seen = new Set();

  for (const kind of demo.seenThrough) {
    for (const [entry, how] of NEEDS[kind]) {
      if (seen.has(entry)) continue;
      seen.add(entry);
      const value = entries.get(entry.toLowerCase());
      if (entry === 'Environment' && value !== undefined) {
        const allowed = /^yes$/i.test(entries.get('prod allowed') || '');
        if (PROD.test(value) && !allowed) stops.push('refused: Observe → Environment is prod. Use a local or test environment, or set "Prod allowed: yes" in Observe only if the project\'s rules allow it');
        else if (!PROD.test(value) && !OK_ENVIRONMENTS.includes(value.toLowerCase())) stops.push(`refused: Observe → Environment is "${value.slice(0, 40)}"; it must be local or test`);
        continue;
      }
      if (value === undefined) {
        const line = `${entry}: needed by the Demo's ${kind}; add it to the Observe section in ${where}`;
        if (how === 'probe') probes.push({ entry, line: `probe ${entry}: needed by the Demo's ${kind}; plan a task named "Build the probe: ${entry}"` });
        else stops.push(`missing ${line}`);
        continue;
      }
      if (how === 'variable' && !/^none$/i.test(value)) {
        if (!VAR_NAME.test(value)) stops.push(`missing ${entry}: must name an environment variable, not hold its value — fix it in ${where}`);
        else if (!env[value]) stops.push(`missing variable ${value}: named in Observe → ${entry}, not set in this environment`);
      }
    }
  }

  const notes = [];
  if (planText !== undefined) {
    const names = planTaskNames(planText);
    for (const p of probes) {
      if (!names.includes(`build the probe: ${p.entry}`.toLowerCase())) stops.push(`missing probe task: Build the probe: ${p.entry} (the plan must build it before the Demo can be seen)`);
    }
  } else {
    notes.push(...probes.map((p) => p.line));
  }
  return { stops, notes };
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = { '--demo': 'demo', '--observe': 'observe', '--plan': 'plan' }[argv[i]];
    if (!key || argv[i + 1] === undefined) throw new Error(`unknown or incomplete argument: ${argv[i]}`);
    args[key] = argv[++i];
  }
  if (!args.demo) throw new Error('--demo <file> is required');
  return args;
}

function main() {
  let args;
  try { args = parseArgs(process.argv.slice(2)); } catch (e) {
    process.stderr.write(`${e.message}\nusage: observe-check.js --demo <file> [--observe <file>] [--plan <plan.md>]\n`);
    process.exit(2);
  }
  const read = (f) => {
    try { return fs.readFileSync(f, 'utf8'); } catch {
      process.stderr.write(`cannot read ${f}\n`);
      process.exit(2);
    }
  };
  const observeFile = args.observe || defaultObserveFile();
  const { stops, notes } = check({
    demoText: read(args.demo),
    observeText: observeFile ? read(observeFile) : '',
    observeFile,
    planText: args.plan ? read(args.plan) : undefined,
    env: process.env,
  });
  const out = [...stops, ...notes];
  if (out.length) process.stdout.write(out.join('\n') + '\n');
  if (stops.length) process.exit(1);
}

if (require.main === module) main();

module.exports = { NEEDS, parseObserve, check };
