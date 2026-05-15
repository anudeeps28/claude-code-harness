const ap = require('../artifact-parsers');
const { read } = require('./shared');

function checkNfrCoverage(projectRoot, warnings) {
  const prdPath = ap.findPrdPath(projectRoot);
  const archPath = ap.findArchPath(projectRoot);
  if (!prdPath || !archPath) return;

  const prdText = read(prdPath);
  const archText = read(archPath);
  if (!prdText || !archText) return;

  const nfrs = ap.extractNfrKeywords(prdText);
  if (!nfrs.length) return;

  const missing = ap.findMissingNfrs(archText, nfrs);
  for (const kw of missing) {
    warnings.push(
      `Artifact drift: PRD mentions NFR "${kw}" but ARCHITECTURE.md does not address it`
    );
  }
}

module.exports = checkNfrCoverage;
