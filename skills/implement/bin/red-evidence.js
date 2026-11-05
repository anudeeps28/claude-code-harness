#!/usr/bin/env node
// red-evidence.js — has every criterion of a story a real red test before its code is written? (F72 #78)
//
// The evidence lives in the story's executor-state.md under "## Red evidence", one line per test:
//   - <test> | AC<n>[, AC<m>] | <verbatim failure line> | shape: assertion|not-implemented|compile|not-run
// Real red (rules/test-philosophy.md): an assertion failure, or a NotImplementedException from the
// method under test (shape not-implemented). A compile break or a test that never ran is not red.
// One more shape, `already-met`: the behaviour already exists, so the test cannot be seen red. It counts
// only when the failure field names the existing code as path:line (the main session opens it, confirms
// it is real code, and logs the decision); the test stays as a regression test.
//
// Usage:
//   node red-evidence.js check --state <executor-state.md> --criteria AC1,AC2
//     prints "ok", or one "refused: <AC> ..." line per criterion without a real red test
//   optional --root <dir>: an already-met row is also refused when its path does not exist under <dir>
//     or is a test file (a __tests__/test/tests folder, or a name like *.test.* / *.spec.*)
//
// Exit codes: 0 ok, 1 refused, 2 usage error.

const fs = require('node:fs');
const path = require('node:path');

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
// already-met: the behaviour exists, so no red can be seen. Accepted only when the failure field names
// the existing code as path:line, so the main session can open it and confirm it is real code.
const CODE_REF = /[^\s:]+\.[A-Za-z0-9]+:\d+/;
// With --root, the named path must also exist under the root and be product code, not a test file.
function isTestPath(p) {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
  const base = parts[parts.length - 1] || '';
  return parts.slice(0, -1).some((s) => ['__tests__', 'test', 'tests', 'spec'].includes(s.toLowerCase()) || /\.Tests?$/i.test(s))
    || /\.(test|spec)\./i.test(base) || /(_test\.|^test_|Tests?\.cs$)/i.test(base);
}
// null when the row is fine, else why the already-met row is refused.
function alreadyMetProblem(row, root) {
  const m = row.failure.match(CODE_REF);
  if (!m) return 'names no existing code as path:line';
  if (!root) return null;
  const rel = m[0].replace(/:\d+$/, '');
  // Resolve links first: a link inside the root that points outside it must not pass for code under it.
  let realRoot;
  let realAbs;
  try {
    realRoot = fs.realpathSync(path.resolve(root));
    realAbs = fs.realpathSync(path.resolve(root, rel));
  } catch { return `names ${rel}, which does not exist under the root`; }
  const inside = path.relative(realRoot, realAbs);
  if (inside.startsWith('..') || path.isAbsolute(inside)) return `names ${rel}, which does not exist under the root`;
  if (isTestPath(rel)) return `names ${rel}, which is a test file, not the existing product code`;
  return null;
}
function alreadyMet(row, root) {
  return row.shape === 'already-met' && alreadyMetProblem(row, root) === null;
}
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
    if (mine.some((r) => (REAL.has(r.shape) && !misread(r)) || alreadyMet(r, opts.root))) continue;
    if (!mine.length) problems.push(`refused: ${ac} has no red test`);
    else {
      problems.push(`refused: ${ac} has no real red: ${mine.map((r) => {
        if (r.shape === 'already-met') return `${r.test} is shape already-met but ${alreadyMetProblem(r, opts.root)}`;
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

