const fs = require('node:fs');
const path = require('node:path');

const PR_STATUSES = new Set([
  'No PR yet',
  'PR raised',
  'CR comments — action needed',
  'CR comments fixed — awaiting human review',
  'Human review in progress',
  'Merged',
  'Abandoned',
]);

const SPRINT_STATUSES = new Set([
  'New', 'In Progress', 'Code Review', 'Done', 'Blocked', 'Carried Over',
]);

const ONE_LINER_MAX = 140;

const SPRINT_RE = /^sprint\d+\.md$/i;

const BRANCH_RE = /^(?:feature|fix|hotfix|chore)\/(?:\d{3,6}-)?[a-z0-9][a-z0-9-]*$/i;

function read(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}

function parseTable(text, headerPredicate) {
  const lines = text.split(/\r?\n/);
  const rows = [];
  let inTable = false;
  let separatorSeen = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!inTable) {
      if (headerPredicate(line)) inTable = true;
      continue;
    }
    if (!separatorSeen) {
      if (/^\|\s*:?-+/.test(line)) { separatorSeen = true; continue; }
      if (line === '' || !line.startsWith('|')) break;
      continue;
    }
    if (!line.startsWith('|')) break;
    const cells = line
      .replace(/^\|/, '').replace(/\|$/, '')
      .split('|').map((c) => c.trim());
    rows.push(cells);
  }
  return rows;
}

function isPlaceholderRow(cells) {
  return cells.every((c) => c === '' || c === '—' || c === '-' || c === '<!-- Add rows here -->');
}

function findCurrentSprintFile(tasksDir) {
  let entries;
  try { entries = fs.readdirSync(tasksDir); } catch { return null; }
  const sprints = entries
    .filter((f) => SPRINT_RE.test(f))
    .map((f) => ({ name: f, n: parseInt(f.match(/\d+/)[0], 10) }))
    .sort((a, b) => b.n - a.n);
  return sprints.length ? path.join(tasksDir, sprints[0].name) : null;
}

function extractWaitingBullets(text) {
  const lines = text.split(/\r?\n/);
  const items = [];
  const allBullets = [];
  let inWaiting = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\*\*Waiting on (from|for) them:\*\*/.test(line.trim())) {
      inWaiting = true; continue;
    }
    if (/^#{1,6}\s/.test(line) || /^\*\*[^*]+:\*\*/.test(line.trim())) {
      inWaiting = inWaiting && /Waiting on/.test(line);
      if (!/Waiting on/.test(line)) inWaiting = false;
    }
    if (inWaiting) {
      const bulletMatch = /^-\s+(.*)$/.exec(line);
      if (bulletMatch) {
        const bulletText = bulletMatch[1];
        allBullets.push({ raw: bulletText, line: i + 1 });
        const checkboxMatch = /^\[\s\]\s+(.*?)\s*\(see flags-and-notes\.md\)\s*$/.exec(bulletText);
        if (checkboxMatch) {
          const itemText = checkboxMatch[1].trim();
          items.push({ itemText, line: i + 1 });
        }
      } else if (line.trim() === '' || /^---/.test(line)) {
        // blank line or hr keeps us in the section until next header
      }
    }
  }
  return { items, allBullets };
}

function isPlaceholderItem(text) {
  return /^\[.*\]/.test(text.trim()) || text.trim() === '' || text.trim() === '(none)';
}

module.exports = {
  PR_STATUSES,
  SPRINT_STATUSES,
  ONE_LINER_MAX,
  SPRINT_RE,
  BRANCH_RE,
  read,
  parseTable,
  isPlaceholderRow,
  findCurrentSprintFile,
  extractWaitingBullets,
  isPlaceholderItem,
};
