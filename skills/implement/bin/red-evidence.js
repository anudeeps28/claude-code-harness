#!/usr/bin/env node
// red-evidence.js — has every criterion of a story a real red test before its code is written? (F72 #78)
//
// The evidence lives in the story's executor-state.md under "## Red evidence", one line per test:
//   - <test> | AC<n>[, AC<m>] | <verbatim failure line> | shape: assertion|not-implemented|compile|not-run
// Real red (rules/test-philosophy.md): an assertion failure, or a NotImplementedException from the
// method under test (shape not-implemented). A compile break or a test that never ran is not red.
//
// Usage:
//   node red-evidence.js check --state <executor-state.md> --criteria AC1,AC2
//     prints "ok", or one "refused: <AC> ..." line per criterion without a real red test
//
// Exit codes: 0 ok, 1 refused, 2 usage error.

const fs = require('node:fs');

const REAL = new Set(['assertion', 'not-implemented']);

function out(line) { process.stdout.write(line + '\n'); }
function fail(code, message) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function parseEvidence(text) {
  const rows = [];
  let inside = false;
  for (const line of text.replace(/\r/g, '').split('\n')) {
    if (/^#{1,6}\s/.test(line)) { inside = /^#{1,6}\s+Red evidence\s*$/i.test(line); continue; }
    if (!inside) continue;
    const m = line.match(/^- (.*)$/);
    if (!m) continue;
    const parts = m[1].split(' | ');
    if (parts.length < 4) continue;
    const shape = parts[parts.length - 1].match(/^shape:\s*(\S+)/);
    if (!shape) continue;
    const criteria = parts[1].split(/[,\s]+/).filter(Boolean).map((c) => c.toLowerCase());
    // The failure text may itself hold " | ": it is everything between the criteria and the shape.
    rows.push({ test: parts[0].trim(), criteria, failure: parts.slice(2, -1).join(' | '), shape: shape[1] });
  }
  return rows;
}

// A line labelled with a real shape whose text reads as a compile, load or setup error, or as nothing
// having run, is a mislabel: that is not the behaviour being absent. Both match only at the start of
// the failure line (after an optional "file(line,col): "), so an assertion message that merely names
// one of these ("expected SyntaxError to be thrown") stays an assertion.
const COMPILE = /^\s*(?:\S+\(\d+,\d+\):\s*)?(?:error (?:TS|CS)\d+|SyntaxError:|ReferenceError:|(?:Error: )?Cannot find module)/i;
const NOT_RUN = /^\s*(?:no tests (?:ran|found)|(?:Ran )?0 tests\b)/i;
function misread(row) {
  if (!REAL.has(row.shape)) return null;
  if (COMPILE.test(row.failure)) return 'compile';
  if (NOT_RUN.test(row.failure)) return 'not-run';
  return null;
}

function cmdCheck(opts) {
  if (!opts.state || !opts.criteria) return fail(2, 'usage: red-evidence.js check --state <executor-state.md> --criteria AC1,AC2');
  if (!fs.existsSync(opts.state)) { out(`refused: no executor-state.md at ${opts.state}`); return 1; }
  const rows = parseEvidence(fs.readFileSync(opts.state, 'utf8'));
  const wanted = opts.criteria.split(',').map((c) => c.trim()).filter(Boolean);
  if (!wanted.length) return fail(2, 'usage: red-evidence.js check --state <executor-state.md> --criteria AC1,AC2 (the list is empty)');
  const problems = [];
  for (const ac of wanted) {
    const mine = rows.filter((r) => r.criteria.includes(ac.toLowerCase()));
    if (mine.some((r) => REAL.has(r.shape) && !misread(r))) continue;
    if (!mine.length) problems.push(`refused: ${ac} has no red test`);
    else {
      problems.push(`refused: ${ac} has no real red: ${mine.map((r) => {
        const m = misread(r);
        return m ? `${r.test} is labelled ${r.shape} but reads as ${m}` : `${r.test} is shape ${r.shape}`;
      }).join('; ')}`);
    }
  }
  if (problems.length) { problems.forEach(out); return 1; }
  out('ok');
  return 0;
}

function parse(argv) {
  const [command, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i++) {
    if (!rest[i].startsWith('--')) return fail(2, `unexpected argument ${rest[i]}`);
    if (rest[i + 1] === undefined) fail(2, `${rest[i]} needs a value`);
    opts[rest[i].slice(2)] = rest[++i];
  }
  return { command, opts };
}

function main() {
  const { command, opts } = parse(process.argv.slice(2));
  if (command !== 'check') fail(2, 'usage: red-evidence.js check --state <executor-state.md> --criteria AC1,AC2');
  process.exit(cmdCheck(opts));
}

if (require.main === module) main();

module.exports = { parseEvidence };
