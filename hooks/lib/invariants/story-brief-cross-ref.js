const fs = require('node:fs');
const path = require('node:path');
const { read, parseTable, isPlaceholderRow, findCurrentSprintFile } = require('./shared');

function checkStoryBriefCrossRef(tasksDir, warnings) {
  const sprintPath = findCurrentSprintFile(tasksDir);
  if (!sprintPath) return;
  const text = read(sprintPath);
  if (!text) return;
  const storiesDir = path.join(tasksDir, 'stories');
  if (!fs.existsSync(storiesDir)) return;
  const rows = parseTable(text, (line) =>
    /\|\s*Story\s*ID\s*\|.*\|\s*Status\s*\|/i.test(line));
  for (const cells of rows) {
    if (cells.length < 5 || isPlaceholderRow(cells)) continue;
    const status = cells[4];
    if (status === 'Done' || status === 'Carried Over' || status === 'New') continue;
    const storyId = (cells[0].match(/\d+/) || [''])[0];
    if (!storyId) continue;
    const briefPath = path.join(storiesDir, storyId, 'brief.md');
    if (!fs.existsSync(briefPath)) {
      warnings.push(
        `${path.basename(sprintPath)}: story #${storyId} (${status}) has no tasks/stories/${storyId}/brief.md`
      );
    }
  }
}

module.exports = checkStoryBriefCrossRef;
