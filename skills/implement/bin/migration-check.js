#!/usr/bin/env node
// migration-check.js — does each new migration or seed file still work on a database that already
// exists (F6 #55)? CI starts from an empty database, so it cannot see a migration whose name sorts
// before one every existing environment has already applied: the migrator refuses the gap, or skips
// the file for good.
//
// Usage: node migration-check.js --base <ref> [--path <work folder>]
//
// The convention is read from the repo, never assumed. A ledger is the folder the new file (or, for
// one-folder-per-migration tools like Prisma, the new folder) sits in, when that folder already exists
// on <base> and its path names migrations or seeds. Its entries are compared in natural order, so
// V2 sorts before V10 (Flyway) and timestamps (EF Core, Rails, Prisma, Knex) sort as they are written.
// A ledger whose names carry no order (Alembic revision ids) is reported as unchecked: the reviewer
// follows its chain by reading the files.
//
// Output, one line each:
//   misordered: <ledger>/<new> sorts before <ledger>/<last>, already on <base> ...   (exit 1)
//   unchecked: <ledger>: ...
//   ok: <ledger>: <n> new after <last>
// Nothing at all when the branch adds no migration or seed. Exit 2: usage error.

const path = require('node:path');
const { git, addedFiles } = require('./diff-lines.js');

const LEDGER_RE = /(^|\/)[^/]*(migrat|seed|alembic|flyway|liquibase|changelog)[^/]*(\/|$)|(^|\/)versions(\/|$)/i;
const ORDERED_RE = /^(V?\d)/i;
// Files that live in a ledger without being one of its entries.
const NOT_AN_ENTRY_RE = /^(_|\.|readme|.*snapshot)/i;

const natural = (a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

function entriesAt(cwd, base, dir) {
  const r = git(cwd, ['ls-tree', '--name-only', `${base}:${dir}`].filter(Boolean));
  return r.split('\n').map((s) => s.trim()).filter(Boolean);
}

function dirExistsAt(cwd, base, dir) {
  try { git(cwd, ['cat-file', '-e', `${base}:${dir}`]); return true; } catch { return false; }
}

/** For each added path, the ledger it lands in and the new entry's name there, or null. */
function ledgerOf(cwd, base, file) {
  const parts = file.split('/');
  // Walk up from the file's own folder to the deepest folder that already exists on base.
  for (let i = parts.length - 1; i >= 1; i--) {
    const dir = parts.slice(0, i).join('/');
    if (!dirExistsAt(cwd, base, dir)) continue;
    if (!LEDGER_RE.test(dir + '/')) return null;
    return { dir, entry: parts[i] };
  }
  return null;
}

function check(cwd, base) {
  const lines = [];
  let bad = 0;
  const byLedger = new Map();
  for (const file of addedFiles(cwd, base)) {
    const l = ledgerOf(cwd, base, file);
    if (!l || NOT_AN_ENTRY_RE.test(l.entry)) continue;
    if (!byLedger.has(l.dir)) byLedger.set(l.dir, new Set());
    byLedger.get(l.dir).add(l.entry);
  }
  for (const [dir, news] of byLedger) {
    const applied = entriesAt(cwd, base, dir).filter((e) => !NOT_AN_ENTRY_RE.test(e));
    if (applied.length === 0) continue;
    if (!applied.every((e) => ORDERED_RE.test(e))) {
      lines.push(`unchecked: ${dir}: its names carry no order (revision ids?); follow the chain in the files to check the new ones come last`);
      continue;
    }
    const last = [...applied].sort(natural).pop();
    let fine = 0;
    for (const entry of [...news].sort(natural)) {
      if (!ORDERED_RE.test(entry)) continue;
      if (natural(entry, last) < 0) {
        lines.push(`misordered: ${dir}/${entry} sorts before ${dir}/${last}, already on ${base}; an environment that has applied ${last} will refuse or skip it. Rename it to sort last`);
        bad++;
      } else fine++;
    }
    if (fine) lines.push(`ok: ${dir}: ${fine} new after ${last}`);
  }
  return { lines, bad };
}

function main() {
  const argv = process.argv.slice(2);
  const o = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) { process.stderr.write(`bad argument: ${argv[i]}\n`); process.exit(2); }
    o[argv[i].slice(2)] = argv[i + 1];
  }
  if (!o.base) { process.stderr.write('usage: migration-check.js --base <ref> [--path <work folder>]\n'); process.exit(2); }
  const { lines, bad } = check(path.resolve(o.path || '.'), o.base);
  if (lines.length) process.stdout.write(lines.join('\n') + '\n');
  process.exit(bad ? 1 : 0);
}

if (require.main === module) main();

module.exports = { check, natural, LEDGER_RE };
