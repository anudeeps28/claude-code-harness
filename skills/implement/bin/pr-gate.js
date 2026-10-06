#!/usr/bin/env node
// pr-gate.js — the gate before a Feature's PR (F6 #60). No PR while any criterion is not met or
// partly met, unless it is fixed and green, needs a person (its story stays needs-person), or the
// user chose to defer it and a tracker item for it exists and is linked from the PR body. Evidence is
// recorded by shape only (ARCHITECTURE.md §4): no raw rows, bodies or personal data.
//
// Usage: node pr-gate.js --feature <fid> [--root <home>] [--tracker-dir <dir>]
//
// Reads:
//   tasks/features/<fid>/feature-state.md      which stories merged
//   tasks/stories/<sid>/test-strategy.md       each merged story's criteria, as <sid>.<n>
//   tasks/features/<fid>/test-strategy.md      Feature-level and carried-over criteria, as F.<n> (optional)
//   tasks/features/<fid>/prove-it.md           the "## Gate" list Prove it wrote, one line per criterion:
//       - <ref>: met | partly | not-met | needs-person | deferred #<id>  [; broke: red|green|n/a]  [— <note>]
//   tasks/features/<fid>/pr-body.md            must link every deferral's #<id>
// A deferral's item is looked up with <tracker-dir>/get-issue.sh (default .claude/trackers/active,
// then trackers/active): it must exist and not be closed.
//
// Output: one line per problem ("refused: ..."), "needs-person: <ref>" and "deferred: <ref> → #<id>"
// lines, then "gate: open" (exit 0) or "gate: closed, <n> to fix" (exit 1). Exit 2: usage error.
// Never prints an evidence value it flags, only where it is and what kind.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readState } = require('./feature-state.js');
const { parseCriteria } = require('./proof-check.js');

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const GATE_LINE = /^-\s+([A-Za-z0-9]+\.\d+):\s+(met|partly|not-met|needs-person|deferred)(?:\s+#([A-Za-z0-9._-]+))?\s*(?:;\s*broke:\s*(red|green|n\/a))?\s*(?:[—–-]\s+(.*))?$/i;

// Raw evidence: personal data, or a field written with its value rather than its shape.
const RAW = [
  ['an email address', /[A-Z0-9._%+-]+@[A-Z0-9-]+(\.[A-Z0-9-]+)*\.[A-Z]{2,}/i],
  ['an SSN-shaped number', /\b\d{3}-\d{2}-\d{4}\b/],
  ['a phone number', /(\(\d{3}\)\s?|\b\d{3}[-. ])\d{3}[-. ]\d{4}\b/],
  ['a date of birth', /\b(dob|birth\w*)\b\W{0,20}\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}/i],
  ['a field with its value', /"(?!\w*(id|ids|status|code|type|kind|count|total|result|state)")\w+"\s*:\s*"[^"]{2,}"/i],
];

function shape(file) {
  if (!fs.existsSync(file)) return [];
  const found = [];
  fs.readFileSync(file, 'utf8').replace(/\r/g, '').split('\n').forEach((line, i) => {
    const hit = RAW.find(([, re]) => re.test(line));
    if (hit) found.push(`refused: ${path.basename(file)}:${i + 1} holds ${hit[0]}; record its shape only (counts, ids, field names, status codes, pass/fail)`);
  });
  return found;
}

function readGate(file) {
  const gate = new Map();
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, 'utf8').replace(/\r/g, '').split('\n');
  const start = lines.findIndex((l) => /^##\s+Gate\s*$/i.test(l));
  if (start === -1) return gate;
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2}\s/.test(line)) break;
    const m = line.match(GATE_LINE);
    if (m && !gate.has(m[1])) gate.set(m[1], { status: m[2].toLowerCase(), item: m[3], broke: m[4] && m[4].toLowerCase(), note: (m[5] || '').trim() });
  }
  return gate;
}

function criteriaOf(file, prefix) {
  if (!fs.existsSync(file)) return [];
  const list = parseCriteria(fs.readFileSync(file, 'utf8')) || [];
  return list.map((c) => ({ ref: `${prefix}.${c.n}`, text: c.text }));
}

function itemOpen(trackerDir, id) {
  const r = spawnSync('bash', [path.join(trackerDir, 'get-issue.sh'), id], { encoding: 'utf8' });
  if (r.status !== 0 || !(r.stdout || '').trim()) return 'does not exist';
  const state = (r.stdout.match(/\*\*State:\*\*\s*(\S+)/) || [])[1];
  if (state && /^(closed|done|resolved|completed|removed)$/i.test(state)) return `is ${state.toLowerCase()}`;
  return null;
}

function gate(root, fid, trackerDir) {
  const state = readState(root, fid);
  if (!state) return { lines: [`refused: no feature-state.md for Feature ${fid}`], bad: 1 };
  const dir = path.join(root, 'tasks', 'features', fid);
  const criteria = [
    ...state.stories.filter((s) => s.status === 'merged').flatMap((s) => criteriaOf(path.join(root, 'tasks', 'stories', s.id, 'test-strategy.md'), s.id)),
    ...criteriaOf(path.join(dir, 'test-strategy.md'), 'F'),
  ];
  const lines = [];
  let bad = 0;
  const refuse = (l) => { lines.push(`refused: ${l}`); bad++; };

  const unfinished = state.stories.filter((s) => !['merged', 'skipped'].includes(s.status));
  for (const s of unfinished) refuse(`story ${s.id} is ${s.status || 'pending'}, not merged; no PR while a story is unfinished`);

  const proved = readGate(path.join(dir, 'prove-it.md'));
  if (proved === null) refuse('no prove-it.md: Prove it has not run');
  const body = fs.existsSync(path.join(dir, 'pr-body.md')) ? fs.readFileSync(path.join(dir, 'pr-body.md'), 'utf8') : null;

  for (const c of criteria) {
    const g = proved && proved.get(c.ref);
    const name = `${c.ref} ("${c.text.slice(0, 70)}")`;
    if (!g) { if (proved) refuse(`${name} has no line in prove-it.md's Gate list`); continue; }
    const why = g.note ? `: ${g.note}` : '';
    if (g.broke === 'green') { refuse(`${name}: its test stayed green when the line that makes it true was changed; the proof lies`); continue; }
    if (g.status === 'not-met') refuse(`${name} is not met${why}`);
    else if (g.status === 'partly') refuse(`${name} is only partly met${why}`);
    else if (g.status === 'needs-person') lines.push(`needs-person: ${c.ref}`);
    else if (g.status === 'deferred') {
      if (!g.item || !ID_RE.test(g.item)) { refuse(`${name} is deferred with no tracker item; a deferral is an item, not a note`); continue; }
      const problem = itemOpen(trackerDir, g.item);
      if (problem) refuse(`${name} is deferred to #${g.item}, which ${problem}`);
      else if (body === null || !new RegExp(`#${g.item.replace(/\./g, '\\.')}\\b`).test(body)) refuse(`${name} is deferred to #${g.item}, but pr-body.md does not link it`);
      else lines.push(`deferred: ${c.ref} → #${g.item}`);
    }
  }

  for (const f of ['prove-it.md', 'pr-body.md']) for (const l of shape(path.join(dir, f))) { lines.push(l); bad++; }
  lines.push(bad ? `gate: closed, ${bad} to fix` : 'gate: open');
  return { lines, bad };
}

function main() {
  const argv = process.argv.slice(2);
  const o = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) { process.stderr.write(`bad argument: ${argv[i]}\n`); process.exit(2); }
    o[argv[i].slice(2)] = argv[i + 1];
  }
  if (!o.feature || !ID_RE.test(o.feature)) { process.stderr.write('usage: pr-gate.js --feature <fid> [--root <home>] [--tracker-dir <dir>]\n'); process.exit(2); }
  const root = path.resolve(o.root || '.');
  const trackerDir = o['tracker-dir'] || [path.join(root, '.claude', 'trackers', 'active'), path.join(root, 'trackers', 'active')].find((d) => fs.existsSync(d)) || path.join(root, 'trackers', 'active');
  const { lines, bad } = gate(root, o.feature, trackerDir);
  process.stdout.write(lines.join('\n') + '\n');
  process.exit(bad ? 1 : 0);
}

if (require.main === module) main();

module.exports = { gate, shape, readGate, GATE_LINE };
