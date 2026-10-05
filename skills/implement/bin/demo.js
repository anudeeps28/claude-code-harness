#!/usr/bin/env node
// demo.js — reads an item's "## Demo" section (F3 #37, #39). A Demo says what visibly changes and
// where you see it: a "Seen through:" line naming how (one or more of KINDS), then numbered steps.
//
// Usage:
//   node demo.js check <file>               the file has a well-formed Demo
//   node demo.js compare <ticket> <plan>    the plan's Demo is never weaker than the ticket's
//
// Prints one problem per line and exits 1; prints nothing and exits 0 when all is well. Exit 2 is a
// usage error. A ticket with no Demo (written before F3) is not an error for compare: the plan then
// has to carry one of its own.

const fs = require('node:fs');

const KINDS = ['screenshot', 'api', 'database', 'test', 'log', 'person'];

/**
 * @param {string} text
 * @returns {{seenThrough: string[], unknown: string[], steps: string[], hasSeenLine: boolean} | null}
 */
function parseDemo(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  let inFence = false;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('```')) inFence = !inFence;
    else if (!inFence && /^## Demo\s*$/.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return null;

  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^#{1,2} /.test(lines[i])) break;
    body.push(lines[i]);
  }

  const demo = { seenThrough: [], unknown: [], steps: [], hasSeenLine: false };
  for (const line of body) {
    const seen = line.match(/^\s*(?:\*\*)?Seen through:(?:\*\*)?\s*(.*)$/i);
    if (seen) {
      demo.hasSeenLine = true;
      for (const raw of seen[1].split(/[,|]/)) {
        const kind = raw.trim().toLowerCase();
        if (!kind) continue;
        (KINDS.includes(kind) ? demo.seenThrough : demo.unknown).push(kind);
      }
      continue;
    }
    const step = line.match(/^\s*\d+\.\s+(.*\S)/);
    if (step) demo.steps.push(step[1]);
  }
  return demo;
}

/** @returns {string[]} problems with the Demo in `text`, labelled with `where` */
function checkDemo(text, where) {
  const demo = parseDemo(text);
  if (!demo) return [`${where} has no "## Demo" section`];
  const problems = [];
  if (!demo.hasSeenLine || demo.seenThrough.length + demo.unknown.length === 0) {
    problems.push(`${where}: the Demo has no "Seen through:" line (one or more of: ${KINDS.join(', ')})`);
  }
  if (demo.unknown.length) {
    problems.push(`${where}: unknown "Seen through" kind ${demo.unknown.map((k) => `"${k}"`).join(', ')} (use: ${KINDS.join(', ')})`);
  }
  if (demo.steps.length === 0) {
    problems.push(`${where}: the Demo has no numbered step saying where the change is seen`);
  }
  return problems;
}

function compareDemos(ticketText, planText) {
  const ticket = parseDemo(ticketText);
  const plan = parseDemo(planText);
  if (!plan) return ['the plan has no "## Demo" section: restate the ticket\'s Demo, unchanged or more precise'];
  const problems = checkDemo(planText, 'the plan');
  if (!ticket) return problems;
  for (const kind of ticket.seenThrough) {
    if (!plan.seenThrough.includes(kind)) problems.push(`the plan's Demo drops "${kind}" from "Seen through" — it may be more precise, never weaker`);
  }
  if (plan.steps.length < ticket.steps.length) {
    problems.push(`the plan's Demo has fewer steps (${plan.steps.length}) than the ticket's (${ticket.steps.length}) — it may be more precise, never weaker`);
  }
  return problems;
}

function read(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch {
    process.stderr.write(`cannot read ${file}\n`);
    process.exit(2);
  }
}

function main(argv) {
  let problems;
  if (argv[0] === 'check' && argv.length === 2) problems = checkDemo(read(argv[1]), argv[1]);
  else if (argv[0] === 'compare' && argv.length === 3) problems = compareDemos(read(argv[1]), read(argv[2]));
  else {
    process.stderr.write('usage: demo.js check <file> | demo.js compare <ticket> <plan>\n');
    process.exit(2);
  }
  if (problems.length) {
    process.stdout.write(problems.join('\n') + '\n');
    process.exit(1);
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { KINDS, parseDemo, checkDemo, compareDemos };
