const path = require('node:path');
const { read, parseTable, isPlaceholderRow, PR_STATUSES } = require('./shared');

function checkPrStatuses(tasksDir, warnings) {
  const text = read(path.join(tasksDir, 'pr-queue.md'));
  if (!text) return;
  const rows = parseTable(text, (line) =>
    /\|\s*PR\s*#\s*\|\s*Branch\s*\|\s*Status\s*\|/i.test(line));
  for (const cells of rows) {
    if (cells.length < 3 || isPlaceholderRow(cells)) continue;
    const status = cells[2];
    if (!PR_STATUSES.has(status)) {
      warnings.push(`pr-queue.md: Status "${status}" not in allowed enum`);
    }
  }
}

module.exports = checkPrStatuses;
