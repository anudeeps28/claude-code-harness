'use strict';

// Lightweight parsers for artifact drift detection.
// Used by drift-check.js to detect inconsistencies across PRD, ARCHITECTURE.md,
// ADRs, work items, and code. Designed to be fast and fail-safe — a parser
// returning [] is always safe (means "nothing to check").

// ── NFR extraction ──────────────────────────────────────────────────────────

// Canonical NFR keywords. If a PRD mentions these in an NFR section,
// the architecture doc should address them somewhere.
const NFR_KEYWORDS = [
  'latency', 'availability', 'throughput', 'scalability',
  'performance', 'rto', 'rpo', 'uptime', 'response time',
  'concurrent users', 'requests per second',
  'encryption', 'authentication', 'authorization',
];

// Extract a markdown section by heading pattern. Returns the text between
// the matched heading and the next heading of equal or higher level.
function extractSection(text, headingPattern) {
  const lines = text.split(/\r?\n/);
  let inSection = false;
  const sectionLines = [];
  let sectionLevel = 0;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const title = headingMatch[2];
      if (!inSection && headingPattern.test(title)) {
        inSection = true;
        sectionLevel = level;
        continue;
      }
      if (inSection && level <= sectionLevel) break;
    }
    if (inSection) sectionLines.push(line);
  }
  return sectionLines.length ? sectionLines.join('\n') : null;
}

// Extract NFR keywords mentioned in the PRD's non-functional requirements section.
function extractNfrKeywords(prdText) {
  const section = extractSection(prdText, /non.?functional|nfr/i);
  if (!section) return [];
  const lower = section.toLowerCase();
  return NFR_KEYWORDS.filter((kw) => lower.includes(kw));
}

// Check which NFR keywords from the PRD are missing in the architecture doc.
function findMissingNfrs(archText, nfrKeywords) {
  const lower = archText.toLowerCase();
  return nfrKeywords.filter((kw) => !lower.includes(kw));
}

// ── Mermaid component extraction ────────────────────────────────────────────

// Extract named components from Mermaid diagrams in an architecture doc.
// Matches patterns like: SVC1[Service Name], DB[(Database)], UI[Web UI]
function extractMermaidComponents(archText) {
  const blocks = archText.match(/```mermaid\s*\n[\s\S]*?```/g);
  if (!blocks) return [];

  const names = new Set();
  for (const block of blocks) {
    // Node with label: ID[Label] or ID[(Label)] or ID([Label]) or ID{{Label}}
    const nodeRe = /\w+\[(?:[({])?([^\]]+?)(?:[)}])?\]/g;
    let m;
    while ((m = nodeRe.exec(block)) !== null) {
      const label = m[1].trim();
      if (label && label.length > 1) names.add(label);
    }
  }
  return [...names];
}

// ── Heading / section reference extraction ──────────────────────────────────

// Extract all markdown headings with their numbering (if present).
function extractHeadings(text) {
  const headings = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^(#{1,6})\s+(.+)$/);
    if (m) {
      const raw = m[2].trim();
      const numMatch = raw.match(/^(\d+(?:\.\d+)*)/);
      headings.push({
        level: m[1].length,
        text: raw,
        number: numMatch ? numMatch[1] : null,
      });
    }
  }
  return headings;
}

// Extract PRD section references from todo.md or work item text.
// Matches: "PRD Section 3.2", "Section 3.2", "PRD §3.2", "§3.2"
function extractPrdSectionRefs(text) {
  const refs = [];
  const re = /(?:PRD\s+)?(?:Section|§)\s*(\d+(?:\.\d+)*)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    refs.push(m[1]);
  }
  return [...new Set(refs)];
}

// ── ADR parsing ─────────────────────────────────────────────────────────────

// Extract the status from an ADR (accepted, proposed, superseded, etc.)
function extractAdrStatus(adrText) {
  const m = adrText.match(/Status[*:\s]+(.+)/i);
  return m ? m[1].trim().toLowerCase().replace(/[*]/g, '') : 'unknown';
}

// Extract the decision text from an ADR's "Decision" section.
function extractAdrDecision(adrText) {
  return extractSection(adrText, /^Decision$/i) || '';
}

// Extract technology names from an ADR decision section.
// Returns {chosen: [...], rejected: [...]} based on common phrasing.
function extractAdrTechChoices(adrText) {
  const decision = extractAdrDecision(adrText);
  if (!decision) return { chosen: [], rejected: [] };

  const chosen = [];
  const rejected = [];

  // "We will use X" / "We chose X" / "Use X"
  const chosenRe = /(?:will use|chose|use|adopt|selected?)\s+([A-Z][A-Za-z0-9/-]+)/gi;
  let m;
  while ((m = chosenRe.exec(decision)) !== null) {
    chosen.push(m[1].trim());
  }

  // "over X" / "instead of X" / "rejected X" / "not X"
  const rejectedRe = /(?:over|instead of|rejected?|not)\s+([A-Z][A-Za-z0-9/-]+)/gi;
  while ((m = rejectedRe.exec(decision)) !== null) {
    rejected.push(m[1].trim());
  }

  return { chosen, rejected };
}

// ── Project root finder ─────────────────────────────────────────────────────

const fs = require('node:fs');
const pathMod = require('node:path');

// Walk up from a file path to find the project root (directory with .git/ or CLAUDE.md).
function findProjectRoot(filePath) {
  let dir = pathMod.dirname(filePath);
  for (let i = 0; i < 15; i++) {
    try {
      if (fs.existsSync(pathMod.join(dir, '.git')) || fs.existsSync(pathMod.join(dir, 'CLAUDE.md'))) {
        return dir;
      }
    } catch { /* ignore fs errors */ }
    const parent = pathMod.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// ── Artifact file locators ──────────────────────────────────────────────────

// Find the PRD file. Checks common locations.
function findPrdPath(projectRoot) {
  const candidates = [
    pathMod.join(projectRoot, 'PRD.md'),
    pathMod.join(projectRoot, 'prd.md'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Find the architecture doc. Checks common locations.
function findArchPath(projectRoot) {
  const candidates = [
    pathMod.join(projectRoot, 'docs', 'ARCHITECTURE.md'),
    pathMod.join(projectRoot, 'ARCHITECTURE.md'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

// Find all ADR files.
function findAdrPaths(projectRoot) {
  const adrDir = pathMod.join(projectRoot, 'docs', 'adr');
  try {
    return fs.readdirSync(adrDir)
      .filter((f) => f.endsWith('.md') && /^\d{4}/.test(f))
      .map((f) => pathMod.join(adrDir, f));
  } catch { return []; }
}

// Find todo.md (enterprise pack).
function findTodoPath(projectRoot) {
  const p = pathMod.join(projectRoot, 'tasks', 'todo.md');
  return fs.existsSync(p) ? p : null;
}

module.exports = {
  NFR_KEYWORDS,
  extractSection,
  extractNfrKeywords,
  findMissingNfrs,
  extractMermaidComponents,
  extractHeadings,
  extractPrdSectionRefs,
  extractAdrStatus,
  extractAdrDecision,
  extractAdrTechChoices,
  findProjectRoot,
  findPrdPath,
  findArchPath,
  findAdrPaths,
  findTodoPath,
};
