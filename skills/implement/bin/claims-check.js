#!/usr/bin/env node
// claims-check.js — every claim the branch adds in code or docs ("checked by X", "covered by Y",
// "see Z") whose X, Y or Z is nowhere in the repo (F6 #56). A comment naming a test that does not
// exist reads like a guarantee and guards nothing.
//
// Usage: node claims-check.js --base <ref> [--path <work folder>]
//
// A claim is an added line with one of the claim phrases followed by a name: in backticks or quotes,
// or a name that looks like code (a path, a dotted or snake_case or camelCase name). The name must
// appear somewhere in the tracked files other than in the claim itself: as a path, or as text.
// Whether X really does what is claimed is the acceptance reviewer's judgement; this only finds the
// claims whose X is not there at all.
//
// Output: "claim: <file>:<line>  "<phrase> <name>": <name> is not in the repo" per claim (exit 1).
// Nothing when every named thing exists. Exit 2: usage error.

const path = require('node:path');
const { git, added } = require('./diff-lines.js');

const PHRASES = 'checked by|covered by|tested by|tested in|verified by|enforced by|guarded by|proven by|proved by|asserted (?:by|in)|matches|conforms to|see';
const CLAIM_RE = new RegExp(`\\b(${PHRASES})\\s+(?:the\\s+)?(?:test\\s+|file\\s+|rule\\s+)?(?:\`([^\`]+)\`|"([^"]+)"|'([^']+)'|([A-Za-z_][\\w./:#-]*[\\w]))`, 'gi');
const CODE_LIKE = /[./_]|[a-z][A-Z]|::|#/;

function exists(cwd, name, self) {
  const clean = name.replace(/[#:].*$/, '').replace(/^\.\//, '');
  if (clean.includes('/') || /\.\w{1,5}$/.test(clean)) {
    const files = git(cwd, ['ls-files']).split('\n');
    if (files.some((f) => f === clean || f.endsWith('/' + clean))) return true;
  }
  let hits = '';
  try { hits = git(cwd, ['grep', '-n', '-F', '-e', name]); } catch { return false; }
  return hits.split('\n').filter(Boolean).some((h) => !(h.startsWith(`${self.file}:${self.line}:`)));
}

function check(cwd, base) {
  const lines = [];
  for (const rec of added(cwd, base)) {
    for (const m of rec.text.matchAll(CLAIM_RE)) {
      const quoted = m[2] || m[3] || m[4];
      const name = (quoted || m[5] || '').trim();
      if (!name || (!quoted && !CODE_LIKE.test(name))) continue;
      if (name.length < 3 || /^https?:/.test(name)) continue;
      if (!exists(cwd, name, rec)) lines.push(`claim: ${rec.file}:${rec.line}  "${m[1]} ${name}": ${name} is not in the repo`);
    }
  }
  return lines;
}

function main() {
  const argv = process.argv.slice(2);
  const o = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) { process.stderr.write(`bad argument: ${argv[i]}\n`); process.exit(2); }
    o[argv[i].slice(2)] = argv[i + 1];
  }
  if (!o.base) { process.stderr.write('usage: claims-check.js --base <ref> [--path <work folder>]\n'); process.exit(2); }
  const lines = check(path.resolve(o.path || '.'), o.base);
  if (lines.length) process.stdout.write(lines.join('\n') + '\n');
  process.exit(lines.length ? 1 : 0);
}

if (require.main === module) main();

module.exports = { check };
