'use strict';
// The /implement SKILL.md paragraph that gives the test lock to the agents that run suites, and the agents it
// names (not a test file itself). The several-sessions probe checks the paragraph; the boundary family compares
// the agents it names with the agents' own text (scripts/__tests__/boundaries-lock-agents.test.js).

const { interfaceOf } = require('../../../scripts/lib/boundaries.js');

// Whitespace runs as one space and bold marks removed, so a wrapped phrase is one phrase.
const flat = (t) => t.replace(/\*\*/g, '').replace(/\s+/g, ' ');

// The Feature "Shared test resources" paragraph of "### Run the stories", flattened; null when it is not there.
function lockParagraph(skillText) {
  const lines = skillText.split('\n');
  const start = lines.findIndex((l) => l.startsWith('### Run the stories'));
  if (start === -1) return null;
  let end = lines.length;
  let inFence = false;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('```')) inFence = !inFence;
    else if (!inFence && /^#{1,3} /.test(lines[i])) { end = i; break; }
  }
  const m = flat(lines.slice(start, end).join('\n')).match(/Shared test resources\.[\s\S]*?(?=Then loop on)/);
  return m ? m[0] : null;
}

// The agents the paragraph names: each backticked word that is the name of an agent in `root`'s agents/.
function lockAgents(skillText, root) {
  const paragraph = lockParagraph(skillText);
  if (!paragraph) return [];
  const isAgent = (n) => { try { interfaceOf(root, `agents/${n}`); return true; } catch { return false; } };
  return [...new Set([...paragraph.matchAll(/`([a-z][a-z-]+)`/g)].map((m) => m[1]))].filter(isAgent).sort();
}

module.exports = { lockParagraph, lockAgents };
