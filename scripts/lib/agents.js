'use strict';
// Private to the scripts module: check 3, a skill uses only its own and shared agents. An agent is
// used when a line starts it (see isLaunchLine in ./common.js, which callersOf also applies; the
// possessive exclusion below is this check's own); a bare path such as `agents/<name>.md` or a prose
// mention is not use. Every .md in the skill folder is read except its __tests__, with code-fenced
// lines blanked.

const { PATH_BOUNDARY, escapeRe, isLaunchLine, checkOptions, exemptSet, pointerSources } = require('./common.js');
const { agentOwners } = require('./interface.js');

function checkAgentUse(root, options = {}) {
  checkOptions(options);
  const exe = exemptSet(options);
  const agents = agentOwners(root).map(({ name, owner }) => ({
    name,
    owner,
    re: new RegExp(`${PATH_BOUNDARY}${escapeRe(name)}(?![A-Za-z0-9_-]|['’]s\\b)`),
  }));
  const problems = [];
  for (const { rel, lines } of pointerSources(root)) {
    const m = /^skills\/([^/]+)\//.exec(rel);
    if (!m || exe.has(m[1])) continue;
    for (const { name, owner, re } of agents) {
      if (owner === 'shared' || owner === m[1]) continue;
      const at = lines.findIndex((l, i) => re.test(l) && isLaunchLine(lines, i));
      if (at !== -1) {
        problems.push(`${rel}:${at + 1}: uses ${name} (owner ${owner || 'none'}); a skill uses only its own and shared agents`);
      }
    }
  }
  return problems;
}

module.exports = { checkAgentUse };
