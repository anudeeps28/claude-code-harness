// @ts-check
// Detect user-level skills that shadow project skills of the same name.
//
// WHY THIS EXISTS
//
// Claude Code resolves a skill by name, and a user-level skill (~/.claude/skills/<name>) wins over a
// project one (.claude/skills/<name>). That is fine when they are the same, and quietly catastrophic
// when they are not: a project can carry a 723-line `implement` skill with a whole test-first mode in
// it, invoke `implement`, and get served a stale 168-line copy that has never heard of it — with no
// error, no warning, and a run that reports success having done something else entirely.
//
// This was found by a real `/implement --tdd` run in this repo. The agent noticed only because it
// diffed the two files by hand. Nothing in the harness would have told it.
//
// It matters most for dogfooding, which is precisely when the project copy is the one under test.

const fs = require('node:fs');
const path = require('node:path');

/**
 * @typedef {object} ShadowedSkill
 * @property {string} name       skill directory name
 * @property {boolean} identical true when both SKILL.md files have identical content
 * @property {string} projectPath
 * @property {string} userPath
 */

/**
 * A directory is a skill only if it contains a SKILL.md.
 * @param {string} dir
 * @returns {Set<string>}
 */
function skillNamesIn(dir) {
  /** @type {Set<string>} */
  const names = new Set();
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return names; // missing directory is the normal case for anyone without a global install
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      if (fs.statSync(path.join(dir, entry.name, 'SKILL.md')).isFile()) names.add(entry.name);
    } catch {
      /* no SKILL.md — not a skill */
    }
  }
  return names;
}

/**
 * @param {string} p
 * @returns {string|null} file content, or null if it cannot be read
 */
function readOrNull(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Find skills that exist in BOTH trees, where the user-level copy takes precedence.
 *
 * Fail-open by design: a missing or unreadable path yields no findings rather than an exception. A
 * warning system that throws is worse than no warning system — it turns a diagnostic into an outage.
 *
 * @param {string} projectSkillsDir e.g. <repo>/.claude/skills
 * @param {string} userSkillsDir    e.g. ~/.claude/skills
 * @returns {ShadowedSkill[]} sorted by name; empty when nothing is shadowed
 */
function detectShadowedSkills(projectSkillsDir, userSkillsDir) {
  const projectNames = skillNamesIn(projectSkillsDir);
  if (projectNames.size === 0) return [];
  const userNames = skillNamesIn(userSkillsDir);
  if (userNames.size === 0) return [];

  /** @type {ShadowedSkill[]} */
  const shadowed = [];
  for (const name of [...projectNames].sort()) {
    if (!userNames.has(name)) continue;
    const projectPath = path.join(projectSkillsDir, name, 'SKILL.md');
    const userPath = path.join(userSkillsDir, name, 'SKILL.md');
    const projectBody = readOrNull(projectPath);
    const userBody = readOrNull(userPath);
    // If either side cannot be read we cannot claim they match. Report it as divergent — the
    // conservative answer, since the cost of a missed warning is a silently wrong run.
    const identical = projectBody !== null && userBody !== null && projectBody === userBody;
    shadowed.push({ name, identical, projectPath, userPath });
  }
  return shadowed;
}

/**
 * Render a short operator-facing warning, or null when there is nothing worth saying.
 * Identical copies are counted but not named — they shadow harmlessly.
 *
 * @param {ShadowedSkill[]} shadowed
 * @returns {string|null}
 */
function formatShadowWarning(shadowed) {
  const divergent = shadowed.filter((s) => !s.identical);
  if (divergent.length === 0) return null;
  const names = divergent.map((s) => s.name).join(', ');
  const identicalCount = shadowed.length - divergent.length;
  return (
    `SKILL SHADOWING: ${divergent.length} user-level skill(s) differ from this project's and take ` +
    `precedence over them: ${names}. Invoking one of these runs the ~/.claude copy, NOT the project ` +
    'copy — so edits made here will appear to have no effect, and a run can silently execute an ' +
    'older flow and still report success. Either reinstall the global harness from this repo so the ' +
    'copies match, or read the project file directly instead of invoking the skill by name.' +
    (identicalCount > 0 ? ` (${identicalCount} further skill(s) are shadowed but identical — harmless.)` : '')
  );
}

module.exports = { detectShadowedSkills, formatShadowWarning };
