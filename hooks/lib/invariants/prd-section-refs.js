// @ts-check
const ap = require('../artifact-parsers');
const { read } = require('./shared');

function checkPrdSectionRefs(projectRoot, warnings) {
  const prdPath = ap.findPrdPath(projectRoot);
  if (!prdPath) return;

  const prdText = read(prdPath);
  const todoText = ap.readWorkItemsText(projectRoot);
  if (!prdText || !todoText) return;

  const refs = ap.extractPrdSectionRefs(todoText);
  if (!refs.length) return;

  const headings = ap.extractHeadings(prdText);
  const sectionNumbers = new Set(headings.map((h) => h.number).filter(Boolean));
  const headingTexts = headings.map((h) => h.text);

  for (const ref of refs) {
    const exists = sectionNumbers.has(ref)
      || headingTexts.some((t) => t.startsWith(ref));
    if (!exists) {
      warnings.push(
        `Artifact drift: a work item references "PRD Section ${ref}" but that section does not exist in PRD.md`
      );
    }
  }
}

module.exports = checkPrdSectionRefs;
