#!/usr/bin/env node
// proof-check.js — checks a plan's test-strategy.md (F3 #39): every acceptance criterion carries a
// proof, a way of seeing the real result, and what would make that proof lie, all decided before any
// code is written.
//
// Usage: node proof-check.js <test-strategy.md>
//
// The list it reads:
//   **Acceptance criteria and their proofs:**
//   1. <criterion>
//      - Proof: <kind> — <the test or check>
//      - Seen by: <how the real result is seen>
//      - Would lie if: <a named mutation or missing assertion that would let it pass anyway>
//
// Prints one problem per line and exits 1. A criterion proven by a sign-off is not a problem: it
// prints "needs-person: ..." and exits 0, because only a person can close it. Exit 2: usage error.

const fs = require('node:fs');

const PROOF_KINDS = ['unit', 'integration', 'e2e', 'ui-automation', 'graded-eval', 'sign-off'];
const HEADING = '**Acceptance criteria and their proofs:**';
const FIELDS = ['Proof', 'Seen by', 'Would lie if'];
const PLACEHOLDER = /^(|tbd|todo|n\/?a|none|-|—|\?|\.\.\.|<.*>)$/i;

function parseCriteria(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const start = lines.findIndex((l) => l.trim() === HEADING);
  if (start === -1) return null;
  const criteria = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\*\*.+:\*\*\s*$/.test(line.trim()) || /^#{1,6} /.test(line)) break;
    const top = line.match(/^(\d+)\.\s+(.*\S)/);
    if (top) { criteria.push({ n: Number(top[1]), text: top[2], fields: {} }); continue; }
    const field = line.match(/^\s+[-*]\s+(Proof|Seen by|Would lie if):\s*(.*?)\s*$/i);
    if (field && criteria.length) {
      const name = FIELDS.find((f) => f.toLowerCase() === field[1].toLowerCase());
      criteria[criteria.length - 1].fields[name] = field[2];
    }
  }
  return criteria;
}

function check(text) {
  const criteria = parseCriteria(text);
  if (!criteria) return { problems: [`no "${HEADING}" list in the test strategy`], people: [] };
  if (criteria.length === 0) return { problems: [`the "${HEADING}" list has no numbered criteria`], people: [] };
  const problems = [];
  const people = [];
  for (const c of criteria) {
    const label = `criterion ${c.n} ("${c.text.slice(0, 80)}")`;
    for (const f of FIELDS) {
      if (!(f in c.fields)) problems.push(`${label}: no "${f}:" line`);
      else if (PLACEHOLDER.test(c.fields[f].trim())) problems.push(`${label}: "${f}:" is empty or a placeholder`);
    }
    if ('Proof' in c.fields) {
      const kind = c.fields.Proof.split(/\s+[—–-]\s+|\s+/)[0].toLowerCase();
      if (!PROOF_KINDS.includes(kind)) {
        problems.push(`${label}: proof kind "${kind}" is not one of ${PROOF_KINDS.join(', ')}`);
      } else if (kind === 'sign-off') {
        people.push(`needs-person: ${label} is proven by a sign-off; the story goes to needs-person until a person gives it`);
      }
    }
  }
  return { problems, people };
}

function main(argv) {
  if (argv.length !== 1) {
    process.stderr.write('usage: proof-check.js <test-strategy.md>\n');
    process.exit(2);
  }
  let text;
  try { text = fs.readFileSync(argv[0], 'utf8'); } catch {
    process.stderr.write(`cannot read ${argv[0]}\n`);
    process.exit(2);
  }
  const { problems, people } = check(text);
  const out = [...problems, ...people];
  if (out.length) process.stdout.write(out.join('\n') + '\n');
  if (problems.length) process.exit(1);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { PROOF_KINDS, parseCriteria, check };
