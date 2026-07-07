// @ts-check
// Learnings store — read, write, score, and rank learning files.
//
// Two scopes:
//   project: <projectRoot>/.claude/learnings/*.json
//   global:  ~/.claude/learnings/*.json
//
// Each learning is a JSON file named by its content hash. Score tracks
// effectiveness: +1 when injected and the pattern doesn't recur, -1 when
// it recurs despite injection. Learnings with score <= -2 are auto-archived.
//
// Scoring is per-category: only learnings whose category matches a recurred
// category get penalized. Unrelated learnings get +1.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

const SCORE_ARCHIVE_THRESHOLD = -2;
const SCORE_PROMOTE_THRESHOLD = 5;
const MAX_INJECT = 5;
const DECAY_PER_MONTH = 0.9;

function globalDir() {
  return path.join(os.homedir(), '.claude', 'learnings');
}

function projectDir(projectRoot) {
  return path.join(projectRoot, '.claude', 'learnings');
}

function archiveDir(baseDir) {
  return path.join(baseDir, 'archived');
}

function contentHash(category, learning) {
  return crypto
    .createHash('sha256')
    .update(`${category}:${learning}`)
    .digest('hex')
    .slice(0, 16);
}

function readAll(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    const results = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf8');
        results.push(JSON.parse(raw));
      } catch { /* skip malformed */ }
    }
    return results;
  } catch { return []; }
}

function readLearnings(projectRoot) {
  const project = readAll(projectDir(projectRoot));
  const global = readAll(globalDir());
  return { project, global };
}

function writeAtomic(filePath, content) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, filePath);
}

function writeLearning(learning, scope, projectRoot) {
  const dir = scope === 'global' ? globalDir() : projectDir(projectRoot);
  fs.mkdirSync(dir, { recursive: true });

  const hash = learning.hash || contentHash(learning.category, learning.learning);
  const filePath = path.join(dir, `${hash}.json`);

  if (fs.existsSync(filePath)) return { written: false, hash, reason: 'duplicate' };

  const record = {
    hash,
    project: learning.project || '',
    date: learning.date || new Date().toISOString().slice(0, 10),
    category: learning.category,
    learning: learning.learning,
    context: learning.context || '',
    score: learning.score ?? 0,
    injections: learning.injections ?? 0,
    recurrences_after: learning.recurrences_after ?? 0,
  };

  writeAtomic(filePath, JSON.stringify(record, null, 2) + '\n');
  return { written: true, hash };
}

function scoreLearning(hash, delta, scope, projectRoot, { injected = false } = {}) {
  const dir = scope === 'global' ? globalDir() : projectDir(projectRoot);
  const filePath = path.join(dir, `${hash}.json`);

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const record = JSON.parse(raw);
    const updated = {
      ...record,
      score: (record.score || 0) + delta,
      injections: (record.injections || 0) + (injected ? 1 : 0),
      recurrences_after: (record.recurrences_after || 0) + (delta < 0 ? 1 : 0),
    };

    if (updated.score <= SCORE_ARCHIVE_THRESHOLD) {
      const dest = archiveDir(dir);
      fs.mkdirSync(dest, { recursive: true });
      writeAtomic(path.join(dest, `${hash}.json`), JSON.stringify(updated, null, 2) + '\n');
      try { fs.unlinkSync(filePath); } catch { /* already gone */ }
      return { archived: true, score: updated.score };
    }

    writeAtomic(filePath, JSON.stringify(updated, null, 2) + '\n');
    return { archived: false, score: updated.score };
  } catch { return { error: true }; }
}

function effectiveScore(learning) {
  const ageMonths = Math.max(0,
    (Date.now() - new Date(learning.date).getTime()) / (30 * 24 * 60 * 60 * 1000)
  );
  return (learning.score || 0) * Math.pow(DECAY_PER_MONTH, ageMonths);
}

function rankLearnings(learnings, context) {
  const contextLower = (context || '').toLowerCase();
  const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'that', 'this']);
  const keywords = contextLower
    .split(/[\s/\-_]+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  const scored = learnings
    .filter(l => (l.score || 0) > SCORE_ARCHIVE_THRESHOLD)
    .map(l => {
      let relevance = effectiveScore(l);

      const learningText = `${l.category} ${l.learning} ${l.context}`.toLowerCase();
      for (const kw of keywords) {
        if (learningText.includes(kw)) relevance += 1;
      }

      return { ...l, _relevance: relevance };
    })
    .sort((a, b) => b._relevance - a._relevance)
    .slice(0, MAX_INJECT);

  return scored.map(({ _relevance, ...rest }) => rest);
}

function promotionCandidates(projectRoot) {
  const { project, global } = readLearnings(projectRoot);
  const all = [...project, ...global];
  return all.filter(l => (l.score || 0) >= SCORE_PROMOTE_THRESHOLD);
}

module.exports = {
  readLearnings,
  writeLearning,
  scoreLearning,
  rankLearnings,
  effectiveScore,
  contentHash,
  promotionCandidates,
  globalDir,
  projectDir,
  SCORE_ARCHIVE_THRESHOLD,
  SCORE_PROMOTE_THRESHOLD,
  MAX_INJECT,
};
