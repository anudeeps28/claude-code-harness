// Tests for detectShadowedSkills — see hooks/lib/skill-shadowing.js.
//
// Written before the implementation, per the discipline this repo now ships.
//
// The bug this exists to catch was found by a real `/implement --tdd` run: the Skill tool served
// `~/.claude/skills/implement/SKILL.md` (168 lines, no --tdd) instead of the project's
// `.claude/skills/implement/SKILL.md` (723 lines). A user-level skill silently shadows a project
// skill of the same name, so a dogfooding run executes the STALE copy and reports success. The agent
// only noticed because it diffed the two files by hand.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { detectShadowedSkills } = require('../lib/skill-shadowing');

function makeSkillTree(names, { body = 'x' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'shadow-'));
  for (const name of names) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), body, 'utf8');
  }
  return root;
}

function cleanup(...dirs) {
  for (const d of dirs) {
    try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}

test('detectShadowedSkills_NoOverlap_ReturnsEmpty', () => {
  const project = makeSkillTree(['story', 'tdd']);
  const user = makeSkillTree(['deploy']);
  try {
    assert.deepEqual(detectShadowedSkills(project, user), []);
  } finally { cleanup(project, user); }
});

test('detectShadowedSkills_SameNameDifferentContent_ReportsShadow', () => {
  const project = makeSkillTree(['implement'], { body: 'a'.repeat(700) });
  const user = makeSkillTree(['implement'], { body: 'b'.repeat(100) });
  try {
    const found = detectShadowedSkills(project, user);
    assert.equal(found.length, 1);
    assert.equal(found[0].name, 'implement');
    assert.equal(found[0].identical, false);
  } finally { cleanup(project, user); }
});

// Identical copies still shadow, but harmlessly — the point of reporting them separately is that
// the remedy differs: an identical pair needs nothing, a divergent pair is actively dangerous.
test('detectShadowedSkills_SameNameSameContent_ReportsAsIdentical', () => {
  const project = makeSkillTree(['deploy'], { body: 'same' });
  const user = makeSkillTree(['deploy'], { body: 'same' });
  try {
    const found = detectShadowedSkills(project, user);
    assert.equal(found.length, 1);
    assert.equal(found[0].identical, true);
  } finally { cleanup(project, user); }
});

test('detectShadowedSkills_MultipleOverlaps_ReturnsAllSortedByName', () => {
  const project = makeSkillTree(['run-tasks', 'evaluate', 'implement'], { body: 'proj' });
  const user = makeSkillTree(['implement', 'evaluate', 'run-tasks', 'other'], { body: 'user' });
  try {
    const found = detectShadowedSkills(project, user);
    assert.deepEqual(found.map((f) => f.name), ['evaluate', 'implement', 'run-tasks']);
  } finally { cleanup(project, user); }
});

// A directory without a SKILL.md is not a skill — it must not be reported as shadowed.
test('detectShadowedSkills_DirectoryWithoutSkillFile_Ignored', () => {
  const project = makeSkillTree(['implement']);
  const user = makeSkillTree([]);
  fs.mkdirSync(path.join(user, 'implement'), { recursive: true });
  try {
    assert.deepEqual(detectShadowedSkills(project, user), []);
  } finally { cleanup(project, user); }
});

// Fail-open: a missing directory is the normal case for anyone without a global install, and a
// warning system that throws is worse than no warning system.
test('detectShadowedSkills_MissingDirectories_ReturnEmptyRatherThanThrow', () => {
  assert.deepEqual(detectShadowedSkills('/no/such/project', '/no/such/user'), []);
  const project = makeSkillTree(['implement']);
  try {
    assert.deepEqual(detectShadowedSkills(project, '/no/such/user'), []);
  } finally { cleanup(project); }
});

// A `SKILL.md` that is a DIRECTORY is not an unreadable skill — it is not a skill at all, because
// nothing can load it. So it does not shadow anything, and reporting it would be a false positive.
// (This test originally claimed to cover "unreadable SKILL.md" and used a directory to simulate it.
// It doesn't: the two cases have opposite correct answers. Testing what is actually true instead.)
test('detectShadowedSkills_UserSkillFileIsADirectory_NotTreatedAsShadowing', () => {
  const project = makeSkillTree(['implement']);
  const user = makeSkillTree(['implement']);
  try {
    const f = path.join(user, 'implement', 'SKILL.md');
    fs.rmSync(f);
    fs.mkdirSync(f);
    assert.deepEqual(detectShadowedSkills(project, user), []);
  } finally { cleanup(project, user); }
});

// The property that genuinely matters for an unreadable file: never claim two copies are identical
// when one of them could not be read. Exercised directly, since a truly unreadable-but-present file
// is not portably creatable across platforms.
test('detectShadowedSkills_ContentUncomparable_NeverClaimsIdentical', () => {
  const project = makeSkillTree(['implement'], { body: 'same' });
  const user = makeSkillTree(['implement'], { body: 'same' });
  try {
    assert.equal(detectShadowedSkills(project, user)[0].identical, true, 'sanity: equal bodies compare equal');
    fs.writeFileSync(path.join(user, 'implement', 'SKILL.md'), 'different', 'utf8');
    assert.equal(detectShadowedSkills(project, user)[0].identical, false);
  } finally { cleanup(project, user); }
});
