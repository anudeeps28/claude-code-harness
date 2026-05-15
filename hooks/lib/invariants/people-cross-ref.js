const path = require('node:path');
const { read, extractWaitingBullets, isPlaceholderItem } = require('./shared');

function checkPeopleCrossRef(tasksDir, hardBlockReasons) {
  const peopleText = read(path.join(tasksDir, 'people.md'));
  const flagsText = read(path.join(tasksDir, 'flags-and-notes.md'));
  if (!peopleText || !flagsText) return;
  const { items } = extractWaitingBullets(peopleText);
  for (const { itemText, line } of items) {
    if (isPlaceholderItem(itemText)) continue;
    if (!flagsText.includes(itemText)) {
      hardBlockReasons.push(
        `people.md:${line} references "${itemText}" but it is not found in flags-and-notes.md`
      );
    }
  }
}

module.exports = checkPeopleCrossRef;
