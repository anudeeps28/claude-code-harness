const path = require('node:path');
const { read, extractWaitingBullets, ONE_LINER_MAX } = require('./shared');

function checkPeopleOneLiner(tasksDir, warnings) {
  const peopleText = read(path.join(tasksDir, 'people.md'));
  if (!peopleText) return;
  const { allBullets } = extractWaitingBullets(peopleText);
  for (const { raw, line } of allBullets) {
    if (raw.length > ONE_LINER_MAX || /\n/.test(raw)) {
      warnings.push(`people.md:${line}: bullet exceeds ${ONE_LINER_MAX} chars (one-liner rule)`);
    }
  }
}

module.exports = checkPeopleOneLiner;
