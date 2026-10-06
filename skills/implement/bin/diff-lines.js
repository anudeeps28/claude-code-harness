// diff-lines.js — reads `git diff <base>...HEAD` in a work folder into per-line records, for the
// Feature panel's mechanical checks (F6: migration-check, loosened-scan, claims-check).
//
// added(cwd, base)  → [{ file, line, text, before }]  every added line, with its line number in the
//                      new file and the line just above it (added or context), for "is there a reason
//                      written next to it" checks
// removed(cwd, base) → [{ file, text }]
// addedFiles(cwd, base) → paths added on the branch
// Every path is repo-relative with forward slashes.

const { spawnSync } = require('node:child_process');

function git(cwd, args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(r.stderr || '').trim()}`);
  return r.stdout;
}

function parse(diff) {
  const added = [];
  const removed = [];
  let file = null;
  let line = 0;
  let before = '';
  for (const raw of diff.replace(/\r/g, '').split('\n')) {
    if (raw.startsWith('+++ ')) {
      file = raw === '+++ /dev/null' ? null : raw.slice(4).replace(/^b\//, '');
      continue;
    }
    if (raw.startsWith('--- ') || raw.startsWith('diff --git') || raw.startsWith('index ')) continue;
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { line = Number(hunk[1]); before = ''; continue; }
    if (raw.startsWith('-')) { if (file !== null || raw) removed.push({ file, text: raw.slice(1) }); continue; }
    if (raw.startsWith('+')) {
      if (file) added.push({ file, line, text: raw.slice(1), before });
      before = raw.slice(1);
      line++;
      continue;
    }
    if (raw.startsWith(' ')) { before = raw.slice(1); line++; }
  }
  return { added, removed };
}

function diffText(cwd, base) { return git(cwd, ['diff', '--no-color', '--no-ext-diff', '-U1', `${base}...HEAD`]); }

function added(cwd, base) { return parse(diffText(cwd, base)).added; }
function removed(cwd, base) { return parse(diffText(cwd, base)).removed; }
function addedFiles(cwd, base) {
  return git(cwd, ['diff', '--name-only', '--diff-filter=A', `${base}...HEAD`]).split('\n').map((s) => s.trim()).filter(Boolean);
}

module.exports = { git, parse, added, removed, addedFiles };
