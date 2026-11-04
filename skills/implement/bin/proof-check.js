#!/usr/bin/env node
// proof-check.js — checks a plan's test-strategy.md, or a Feature plan (F3 #39, F72 #77): every
// acceptance criterion carries a proof, a way of seeing the real result, and what would make that
// proof lie, all decided before any code is written. A Feature plan holds one "## Story #<sid>"
// section per story; each is checked, or only one with --story.
//
// Usage: node proof-check.js <test-strategy.md | feature-plan.md> [--story <sid>]
//   --story <sid>  check only that story's section; a missing section is a problem
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
const path = require('node:path');

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

// A Feature plan lives at tasks/features/<fid>/plan.md; a single story's task plan is also called
// plan.md (tasks/stories/<sid>/plan.md), so the folder decides, not the file name.
function isFeaturePlan(file) {
  const parts = path.resolve(file).split(path.sep);
  return path.basename(file) === 'plan.md' && parts[parts.length - 3] === 'features';
}

// A Feature plan (tasks/features/<fid>/plan.md) holds one "## Story #<sid> — <title>" section per
// story. Returns [{ sid, text }] in file order, or [] when the file has none.
function storySections(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  const sections = [];
  let current = null;
  let inFence = false;
  for (const line of lines) {
    if (line.startsWith('```')) inFence = !inFence;
    const head = inFence ? null : line.match(/^## Story #(\S+?)(?:\s|$)/);
    if (head) { current = { sid: head[1], lines: [] }; sections.push(current); continue; }
    if (!inFence && /^## /.test(line)) { current = null; continue; }
    if (current) current.lines.push(line);
  }
  return sections.map((s) => ({ sid: s.sid, text: s.lines.join('\n') }));
}

// opts.story: check only that story's section. opts.featurePlan: the file is a Feature plan, so a
// file with no story sections is said to have none rather than to lack a test strategy.
function check(text, opts = {}) {
  const all = storySections(text);
  if (opts.story) {
    const sections = all.filter((s) => s.sid === opts.story);
    if (!sections.length) return { problems: [`no "## Story #${opts.story}" section`], people: [] };
    return checkSections(sections);
  }
  if (all.length) return checkSections(all);
  if (opts.featurePlan) return { problems: ['no "## Story #<sid>" sections in the Feature plan'], people: [] };
  return checkList(text, '', 'the test strategy');
}

function checkSections(sections) {
  const problems = [];
  const people = [];
  for (const s of sections) {
    const r = checkList(s.text, `#${s.sid} `, `story #${s.sid}'s section`);
    problems.push(...r.problems);
    people.push(...r.people);
  }
  return { problems, people };
}

function checkList(text, prefix, where) {
  const criteria = parseCriteria(text);
  if (!criteria) return { problems: [`${prefix}no "${HEADING}" list in ${where}`], people: [] };
  if (criteria.length === 0) return { problems: [`${prefix}the "${HEADING}" list has no numbered criteria`], people: [] };
  const problems = [];
  const people = [];
  for (const c of criteria) {
    const label = `${prefix}criterion ${c.n} ("${c.text.slice(0, 80)}")`;
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
  const usage = () => {
    process.stderr.write('usage: proof-check.js <test-strategy.md | feature-plan.md> [--story <sid>]\n');
    process.exit(2);
  };
  if (argv.length !== 1 && !(argv.length === 3 && argv[1] === '--story')) usage();
  let text;
  try { text = fs.readFileSync(argv[0], 'utf8'); } catch {
    process.stderr.write(`cannot read ${argv[0]}\n`);
    process.exit(2);
  }
  const story = argv.length === 3 ? argv[2].replace(/^#/, '') : null;
  if (argv.length === 3 && !story) usage();
  const { problems, people } = check(text, { story, featurePlan: isFeaturePlan(argv[0]) });
  const out = [...problems, ...people];
  if (out.length) process.stdout.write(out.join('\n') + '\n');
  if (problems.length) process.exit(1);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { PROOF_KINDS, parseCriteria, check, storySections };
