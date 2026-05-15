const path = require('node:path');
const ap = require('../artifact-parsers');
const { read } = require('./shared');

function checkAdrConsistency(projectRoot, warnings, hardBlockReasons) {
  const archPath = ap.findArchPath(projectRoot);
  if (!archPath) return;
  const archText = read(archPath);
  if (!archText) return;

  const adrPaths = ap.findAdrPaths(projectRoot);
  if (!adrPaths.length) return;

  for (const adrPath of adrPaths) {
    const adrText = read(adrPath);
    if (!adrText) continue;

    const status = ap.extractAdrStatus(adrText);
    if (status !== 'accepted') continue;

    const { chosen, rejected } = ap.extractAdrTechChoices(adrText);
    if (!chosen.length || !rejected.length) continue;

    for (const tech of rejected) {
      const section2 = ap.extractSection(archText, /platform|selection|rationale/i);
      if (!section2) continue;
      const s2Lower = section2.toLowerCase();
      const techLower = tech.toLowerCase();
      const anyChosenPresent = chosen.some((c) => s2Lower.includes(c.toLowerCase()));
      if (s2Lower.includes(techLower) && !anyChosenPresent) {
        hardBlockReasons.push(
          `Artifact contradiction: ${path.basename(adrPath)} chose ${chosen.join('/')} ` +
          `over ${tech}, but ARCHITECTURE.md platform rationale references ${tech} ` +
          `without the chosen technology — run /sync-tasks to resolve`
        );
      }
    }
  }
}

module.exports = checkAdrConsistency;
