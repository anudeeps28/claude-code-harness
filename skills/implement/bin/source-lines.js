#!/usr/bin/env node
// source-lines.js — keeps a story's requirement lines whole from the source document to the merged
// code. A story planned from a document (a PRD, a design doc, a grill or wayfinder summary) carries
// the lines it was traced to, verbatim, in a "## Source requirements" section:
//
//   ## Source requirements
//   Source: docs/weekly-review-design.md
//   Coverage: tasks/coverage/weekly-review-design.md
//   - [D-5b.3] who engages: change from last month
//
// and the plan's test strategy carries each one as a criterion that starts with its id and quotes it:
//
//   **Acceptance criteria and their proofs:**
//   1. [D-5b.3] who engages: change from last month
//
// Usage:
//   node source-lines.js read <ticket-or-brief>            the lines, "doc-without-lines: <path>", or "none"
//   node source-lines.js compare <ticket-or-brief> <test-strategy.md>
//                                                          every line is a criterion, verbatim; the plan
//                                                          may add criteria, never drop or reword one
//   node source-lines.js compare <ticket> <feature-plan.md> --story <sid>
//                                                          the same, over that story's "## Story #<sid>"
//                                                          section of the Feature plan only
//   node source-lines.js coverage <coverage.md>            every requirement row is mapped
//   node source-lines.js audit <coverage.md> [--items <id,id>]
//                                                          every in-scope row's Audit is Built
//
// Prints one problem per line and exits 1; exits 0 when all is well; exit 2 is a usage error.

const fs = require('node:fs');
const { parseCriteria, storySections } = require('./proof-check');

const SECTION = /^## Source requirements\s*$/;
const ID = '[A-Za-z0-9][A-Za-z0-9._-]*';
const LINE = new RegExp(`^-\\s+\\[(${ID})\\]\\s+(.*\\S)\\s*$`);
const DOC_REF = /^\s*(?:\*\*)?(?:design(?: doc)?|source|prd|spec)(?:\*\*)?:\s*`?([^\s`]+)`?/i;
const PLACEHOLDER = /^(|tbd|todo|\?|-|—|none|n\/?a|\.\.\.|<.*>)$/i;
const AUDIT_VALUES = ['built', 'partly', 'missing'];

/** Lines outside code fences, so an example inside ``` is never read as the real thing. */
function unfenced(text) {
  let inFence = false;
  return text.replace(/\r/g, '').split('\n').map((line) => {
    if (line.trimStart().startsWith('```')) { inFence = !inFence; return ''; }
    return inFence ? '' : line;
  });
}

/** Whitespace collapsed, wrapping quotes and trailing punctuation stripped: verbatim, not byte-equal. */
function norm(s) {
  let t = s.replace(/\s+/g, ' ').trim();
  for (let i = 0; i < 3; i++) {
    t = t.replace(/[.;,]+$/, '').trim();
    const m = t.match(/^(["'`“‘])([\s\S]*)(["'`”’])$/);
    if (m) t = m[2].trim();
  }
  return t;
}

/**
 * @returns {{source: string|null, coverage: string|null, lines: {id: string, text: string}[],
 *   bad: string[], docRef: string|null, hasSection: boolean}}
 */
function readSource(text) {
  const lines = unfenced(text);
  const out = { source: null, coverage: null, lines: [], bad: [], docRef: null, hasSection: false };
  let inSection = false;
  for (const line of lines) {
    if (SECTION.test(line)) { inSection = true; out.hasSection = true; continue; }
    if (inSection && /^#{1,6} /.test(line)) inSection = false;
    if (inSection) {
      const src = line.match(/^\s*Source:\s*(.*\S)/i);
      if (src) { out.source = src[1]; continue; }
      const cov = line.match(/^\s*Coverage:\s*(.*\S)/i);
      if (cov) { out.coverage = cov[1]; continue; }
      const m = line.match(LINE);
      if (m) out.lines.push({ id: m[1], text: m[2] });
      else if (/^-\s/.test(line)) out.bad.push(line.trim());
      continue;
    }
    if (!out.docRef) {
      const ref = line.match(DOC_REF);
      if (ref && (/\//.test(ref[1]) || /\.(md|txt)$/i.test(ref[1]))) out.docRef = ref[1];
    }
  }
  return out;
}

function compare(sourceText, strategyText, storyId) {
  if (storyId) {
    // A Feature plan: read only this story's "## Story #<sid>" section.
    const section = storySections(strategyText).find((s) => s.sid === String(storyId));
    if (!section) return [`no "## Story #${storyId}" section in the Feature plan`];
    strategyText = section.text;
  }
  const src = readSource(sourceText);
  if (src.lines.length === 0) return src.bad.map((b) => `bad line: "${b}" — write it as "- [<id>] <the line, verbatim>"`);
  const criteria = parseCriteria(strategyText);
  if (!criteria) return ['no "**Acceptance criteria and their proofs:**" list in the test strategy'];
  const tagged = new Map();
  const problems = [];
  const known = new Set(src.lines.map((l) => l.id));
  for (const c of criteria) {
    const m = c.text.match(new RegExp(`^\\[(${ID})\\]\\s*(.*)$`));
    if (!m) continue;
    if (!known.has(m[1])) {
      problems.push(`unknown [${m[1]}]: criterion ${c.n} is tagged with an id that is not one of the story's source lines`);
      continue;
    }
    if (!tagged.has(m[1])) tagged.set(m[1], []);
    tagged.get(m[1]).push({ n: c.n, text: m[2] });
  }
  for (const line of src.lines) {
    const found = tagged.get(line.id);
    if (!found) {
      problems.push(`missing [${line.id}] "${line.text}": no acceptance criterion carries it — the plan may add criteria, never drop one`);
      continue;
    }
    const want = norm(line.text);
    if (!found.some((f) => norm(f.text).startsWith(want))) {
      problems.push(`changed [${line.id}]: the criterion must quote the line verbatim (detail goes on a line below it) — source says "${line.text}", plan says "${found[0].text}"`);
    }
  }
  return [...src.bad.map((b) => `bad line: "${b}"`), ...problems];
}

function splitRow(line) {
  const cells = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/);
  return cells.map((c) => c.replace(/\\\|/g, '|').trim());
}

/** @returns {{rows: {id: string, requirement: string, mapped: string, audit: string|null}[]} | null} */
function readCoverage(text) {
  const lines = unfenced(text);
  let header = -1;
  let cols = null;
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim().startsWith('|')) continue;
    const cells = splitRow(lines[i]).map((c) => c.toLowerCase());
    if (cells.includes('id') && cells.includes('mapped to')) {
      header = i;
      cols = { id: cells.indexOf('id'), requirement: cells.indexOf('requirement'), mapped: cells.indexOf('mapped to'), audit: cells.indexOf('audit') };
      break;
    }
  }
  if (header === -1 || !cols) return null;
  const rows = [];
  for (let i = header + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) break;
    const cells = splitRow(line);
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    rows.push({
      id: cells[cols.id] || '',
      requirement: cols.requirement >= 0 ? cells[cols.requirement] || '' : '',
      mapped: cells[cols.mapped] || '',
      audit: cols.audit >= 0 ? cells[cols.audit] || '' : null,
    });
  }
  return { rows };
}

const isOutOfScope = (mapped) => /^out of scope\b/i.test(mapped);

function checkCoverage(text) {
  const cov = readCoverage(text);
  if (!cov) return ['no coverage table: expected a table with "Id" and "Mapped to" columns'];
  if (cov.rows.length === 0) return ['the coverage table has no requirement rows'];
  const problems = [];
  const seen = new Set();
  for (const r of cov.rows) {
    if (!new RegExp(`^${ID}$`).test(r.id)) { problems.push(`bad id "${r.id}": ids are letters, digits, dots, dashes`); continue; }
    if (seen.has(r.id)) problems.push(`duplicate [${r.id}]: every requirement line has exactly one id`);
    seen.add(r.id);
    if (PLACEHOLDER.test(r.mapped)) problems.push(`unmapped [${r.id}] "${r.requirement}": map it to a story or Feature criterion, or "Out of scope — <reason>" for the owner to approve`);
    else if (isOutOfScope(r.mapped) && !/^out of scope\s*[—–:-]\s*\S/i.test(r.mapped)) problems.push(`out-of-scope without a reason [${r.id}]: write "Out of scope — <reason>"`);
  }
  return problems;
}

function checkAudit(text, items) {
  const cov = readCoverage(text);
  if (!cov) return { problems: ['no coverage table: expected a table with "Id" and "Mapped to" columns'], complete: false };
  const problems = [];
  for (const r of cov.rows) {
    if (isOutOfScope(r.mapped)) continue;
    if (items && !items.some((id) => new RegExp(`#${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(r.mapped))) continue;
    const value = (r.audit || '').split(/\s+/)[0].toLowerCase();
    if (!value) problems.push(`unaudited [${r.id}]`);
    else if (!AUDIT_VALUES.includes(value)) problems.push(`bad audit [${r.id}]: "${r.audit}" (use Built, Partly or Missing)`);
    else if (value !== 'built') problems.push(`open [${r.id}]: ${value[0].toUpperCase()}${value.slice(1)}`);
  }
  return { problems, complete: problems.length === 0 };
}

function read(file) {
  try { return fs.readFileSync(file, 'utf8'); } catch {
    process.stderr.write(`cannot read ${file}\n`);
    process.exit(2);
  }
}

function usage() {
  process.stderr.write('usage: source-lines.js read <file> | compare <ticket-or-brief> <test-strategy.md|feature-plan.md> [--story <sid>] | coverage <coverage.md> | audit <coverage.md> [--items <id,id>]\n');
  process.exit(2);
}

function main(argv) {
  const [cmd, ...rest] = argv;
  let out = [];
  let failed = false;
  if (cmd === 'read' && rest.length === 1) {
    const src = readSource(read(rest[0]));
    if (src.bad.length) { out = src.bad.map((b) => `bad line: "${b}" — write it as "- [<id>] <the line, verbatim>"`); failed = true; }
    else if (src.lines.length) {
      if (src.source) out.push(`source: ${src.source}`);
      if (src.coverage) out.push(`coverage: ${src.coverage}`);
      for (const l of src.lines) out.push(`line [${l.id}] ${l.text}`);
    } else if (src.docRef) out.push(`doc-without-lines: ${src.docRef}`);
    else out.push('none');
  } else if (cmd === 'compare' && (rest.length === 2 || (rest.length === 4 && rest[2] === '--story'))) {
    out = compare(read(rest[0]), read(rest[1]), rest.length === 4 ? rest[3].replace(/^#/, '') : null);
    failed = out.length > 0;
  } else if (cmd === 'coverage' && rest.length === 1) {
    out = checkCoverage(read(rest[0]));
    failed = out.length > 0;
  } else if (cmd === 'audit' && (rest.length === 1 || (rest.length === 3 && rest[1] === '--items'))) {
    const items = rest.length === 3 ? rest[2].split(',').map((s) => s.trim().replace(/^#/, '')).filter(Boolean) : null;
    const { problems, complete } = checkAudit(read(rest[0]), items);
    out = complete ? ['complete'] : problems;
    failed = !complete;
  } else usage();
  if (out.length) process.stdout.write(out.join('\n') + '\n');
  if (failed) process.exit(1);
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { readSource, compare, readCoverage, checkCoverage, checkAudit, norm };
