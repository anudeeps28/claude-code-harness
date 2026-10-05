// @ts-check
const fs = require('node:fs');
const path = require('node:path');
const ap = require('../artifact-parsers');

function checkAcTestCoverage(projectRoot, warnings) {
  const todoText = ap.readWorkItemsText(projectRoot);
  if (!todoText) return;

  const acMatches = todoText.match(/<acceptance[^>]*>([\s\S]*?)<\/acceptance>/gi);
  if (!acMatches || !acMatches.length) return;

  const testDirs = ['tests', 'test', '__tests__', 'spec'];
  let hasTests = false;
  for (const d of testDirs) {
    if (fs.existsSync(path.join(projectRoot, d))) { hasTests = true; break; }
  }
  if (fs.existsSync(path.join(projectRoot, 'src')) && !hasTests) {
    try {
      const srcFiles = fs.readdirSync(path.join(projectRoot, 'src'));
      hasTests = srcFiles.some((f) => /\.test\.|\.spec\./i.test(f));
    } catch { /* ignore */ }
  }

  if (!hasTests) {
    warnings.push(
      'Artifact drift: work items have acceptance criteria but no test directory found — consider adding tests'
    );
  }
}

module.exports = checkAcTestCoverage;
