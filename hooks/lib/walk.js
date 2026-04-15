// Thin wrapper over fs.readdirSync with recursion + predicate filter.
// Requires Node 20+ for the { recursive: true } option.

const fs = require('node:fs');
const path = require('node:path');

function walk(root, { match, maxDepth = Infinity } = {}) {
  if (!fs.existsSync(root)) return [];
  const results = [];
  try {
    const entries = fs.readdirSync(root, { recursive: true, withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const parent = entry.parentPath || entry.path || root;
      const full = path.join(parent, entry.name);
      const rel = path.relative(root, full);
      const depth = rel.split(path.sep).length;
      if (depth > maxDepth) continue;
      if (match && !match(full, entry.name, rel)) continue;
      results.push(full);
    }
  } catch { /* ignore — return whatever we collected */ }
  return results.sort();
}

module.exports = { walk };
