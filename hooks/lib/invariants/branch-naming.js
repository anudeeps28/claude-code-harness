const path = require('node:path');
const { read, parseTable, isPlaceholderRow, BRANCH_RE } = require('./shared');

function checkBranchNaming(tasksDir, warnings) {
  const text = read(path.join(tasksDir, 'pr-queue.md'));
  if (!text) return;
  const rows = parseTable(text, (line) =>
    /\|\s*PR\s*#\s*\|\s*Branch\s*\|\s*Status\s*\|/i.test(line));
  for (const cells of rows) {
    if (cells.length < 2 || isPlaceholderRow(cells)) continue;
    const branch = cells[1];
    if (!branch || branch === '—') continue;
    if (!BRANCH_RE.test(branch)) {
      warnings.push(`pr-queue.md: branch "${branch}" doesn't match feature/fix/hotfix/chore pattern`);
    }
  }
}

module.exports = checkBranchNaming;
