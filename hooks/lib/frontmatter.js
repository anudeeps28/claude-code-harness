// Minimal YAML frontmatter parser for SKILL.md / agent.md.
// Handles simple `key: value` and `key: "quoted value"`. No anchors, no multiline.

const fs = require('node:fs');

function parse(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return {};
  const out = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function readFile(filePath) {
  try { return parse(fs.readFileSync(filePath, 'utf8')); }
  catch { return {}; }
}

module.exports = { parse, readFile };
