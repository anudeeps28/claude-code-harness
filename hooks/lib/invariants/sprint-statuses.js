const path = require('node:path');
const { read, parseTable, isPlaceholderRow, findCurrentSprintFile, SPRINT_STATUSES } = require('./shared');

function checkSprintStatuses(tasksDir, warnings) {
  const sprintPath = findCurrentSprintFile(tasksDir);
  if (!sprintPath) return;
  const text = read(sprintPath);
  if (!text) return;
  const rows = parseTable(text, (line) =>
    /\|\s*Story\s*ID\s*\|.*\|\s*Status\s*\|/i.test(line));
  for (const cells of rows) {
    if (cells.length < 5 || isPlaceholderRow(cells)) continue;
    const status = cells[4];
    if (!SPRINT_STATUSES.has(status)) {
      warnings.push(`${path.basename(sprintPath)}: Status "${status}" not in allowed enum`);
    }
  }
}

module.exports = checkSprintStatuses;
