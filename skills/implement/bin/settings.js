// settings.js — reads the Feature-run settings from the project's lessons/notes file (F5):
// a "## Feature runs" section of "- key: value" lines, e.g.
//
//   ## Feature runs
//   - max-parallel-stories: 5
//   - worktree-size-gb: 3
//   - verify-lock: per-story
//
// Template placeholders ("<!-- ... -->") count as unset.

const fs = require('node:fs');
const path = require('node:path');

function lessonsFile(root) {
  for (const f of [path.join(root, 'tasks', 'lessons.md'), path.join(root, 'tasks', 'notes.md')]) {
    if (fs.existsSync(f)) return f;
  }
  return null;
}

/** @returns {Record<string, string>} */
function readSettings(root = process.cwd()) {
  const file = lessonsFile(root);
  const settings = {};
  if (!file) return settings;
  const lines = fs.readFileSync(file, 'utf8').replace(/\r/g, '').split('\n');
  const start = lines.findIndex((l) => /^## Feature runs\s*$/.test(l));
  if (start === -1) return settings;
  for (let i = start + 1; i < lines.length && !/^#{1,2} /.test(lines[i]); i++) {
    const m = lines[i].match(/^\s*-\s+([a-z][a-z0-9-]*):\s*`?([^`]*?)`?\s*$/);
    if (m && !/^<!--/.test(m[2]) && m[2] !== '' && !(m[1] in settings)) settings[m[1]] = m[2];
  }
  return settings;
}

module.exports = { readSettings, lessonsFile };
