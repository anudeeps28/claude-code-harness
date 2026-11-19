'use strict';
// Private to the scripts module: check 2's heading half (rules/modules.md, "The boundary check").
// A path to a module's main file followed by a quoted or bold heading must name "Interface": the
// section headings of a SKILL.md, an agent or a README are private. Only module main files count: a
// pointer into rules/ ("rules/deferrals.md", "The ship test") is allowed, because rules are not modules,
// and so are pointers to non-module files such as `brief.md "Goal"`. Free wording ("in Phase 3") is not
// matched; the architect reviewer is the backstop for it.

const { PATH_BOUNDARY, checkOptions, exemptSet, pointerSources } = require('./common.js');

const MAIN_FILE = '(?:skills\\/[a-z0-9-]+\\/SKILL\\.md|agents\\/[A-Za-z0-9_-]+\\.md|(?:hooks|trackers|code-platform|install|scripts)\\/README\\.md)';
// path, then closers and a separator (`, ` `: ` ` `), then "heading", “heading” or **heading**
const HEADING_POINTER_RE = new RegExp(
  `${PATH_BOUNDARY}(?:\\.claude\\/)?(${MAIN_FILE})[\`'*)]*[,:;]?\\s*(?:"([^"\\n]+)"|\\u201c([^\\u201d\\n]+)\\u201d|\\*\\*([^*\\n]+)\\*\\*)`, 'g');

function checkHeadingPointers(root, options = {}) {
  checkOptions(options);
  const exe = exemptSet(options);
  const problems = [];
  for (const { rel: by, lines } of pointerSources(root)) {
    // An exempt skill (the frontend-design bundle) is not held to the boundary rules.
    if (by.startsWith('skills/') && exe.has(by.split('/')[1])) continue;
    lines.forEach((line, i) => {
      for (const m of line.matchAll(HEADING_POINTER_RE)) {
        const heading = (m[2] || m[3] || m[4]).trim();
        if (heading === 'Interface' || m[1] === by) continue;
        problems.push(`${by}:${i + 1}: points at heading "${heading}" in ${m[1]}; point at its Interface block`);
      }
    });
  }
  return problems;
}

module.exports = { checkHeadingPointers };
