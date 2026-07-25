// Doc-consistency probe for `--rework <PR#>` mode in skills/implement/SKILL.md.
//
// This is not a code test — it's a probe that asserts the SKILL.md prose stays internally
// consistent as the file evolves: frontmatter mentions --rework, a dedicated Rework mode
// section exists, it only references scripts that actually exist on disk, it never opens a
// new PR/branch, the Hard rules section documents it, and none of the pre-existing flags/STOP
// tokens regressed.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const SKILL_PATH = path.join(REPO_ROOT, 'skills', 'implement', 'SKILL.md');

const SKILL_MD = fs.readFileSync(SKILL_PATH, 'utf8');

function extractFrontmatter(content) {
  const lines = content.split('\n');
  const dashIndices = [];
  for (let i = 0; i < lines.length && dashIndices.length < 2; i++) {
    if (lines[i].trim() === '---') dashIndices.push(i);
  }
  if (dashIndices.length < 2) return null;
  return lines.slice(dashIndices[0] + 1, dashIndices[1]).join('\n');
}

function extractReworkSection(content) {
  const match = content.match(/## Rework mode[\s\S]*?(?=\n## )/);
  return match ? match[0] : null;
}

function extractHardRulesSection(content) {
  const idx = content.indexOf('## Hard rules');
  if (idx === -1) return null;
  return content.slice(idx);
}

const FRONTMATTER = extractFrontmatter(SKILL_MD);
const REWORK_SECTION = extractReworkSection(SKILL_MD);
const HARD_RULES_SECTION = extractHardRulesSection(SKILL_MD);

test('ReworkSection_Exists', () => {
  assert.ok(REWORK_SECTION, 'Expected a "## Rework mode" section followed by another "## " heading, but none was found');
});

test('Frontmatter_MentionsReworkInDescriptionAndArgumentHint', () => {
  assert.ok(FRONTMATTER, 'Expected a frontmatter block delimited by the first two "---" lines');
  const descriptionLine = FRONTMATTER.split('\n').find((l) => l.startsWith('description:'));
  const argumentHintLine = FRONTMATTER.split('\n').find((l) => l.startsWith('argument-hint:'));
  assert.ok(descriptionLine, 'Expected a description: line in frontmatter');
  assert.ok(argumentHintLine, 'Expected an argument-hint: line in frontmatter');
  assert.match(descriptionLine, /--rework/, 'description: usage string must mention --rework');
  assert.match(argumentHintLine, /--rework/, 'argument-hint: must mention --rework');
});

test('ArgParsing_DefinesReworkWithPRNumber', () => {
  const matchesRegex = /--rework\s+<?PR/i.test(SKILL_MD);
  const matchesBullet = /--rework\s*<PR#>/.test(SKILL_MD);
  assert.ok(matchesRegex || matchesBullet, 'Expected the SKILL.md body to define "--rework <PR#>" (via arg-parsing regex or a bullet)');
});

test('ReworkSection_ReferencesOnlyScriptsThatExistOnDisk', () => {
  assert.ok(REWORK_SECTION, 'Rework mode section must exist to check its script references');

  const requiredScripts = ['get-pr-review-threads.sh', 'reply-pr-thread.sh', 'resolve-pr-thread.sh'];
  for (const script of requiredScripts) {
    assert.ok(REWORK_SECTION.includes(script), `Rework mode section must mention ${script}`);
  }

  const mentionedScripts = new Set(REWORK_SECTION.match(/[\w-]+\.sh/g) || []);
  assert.ok(mentionedScripts.size > 0, 'Expected at least one .sh script mentioned in the Rework mode section');

  for (const script of mentionedScripts) {
    const inGithubAdapter = fs.existsSync(path.join(REPO_ROOT, 'code-platform', 'github', script));
    const inActiveAdapter = fs.existsSync(path.join(REPO_ROOT, '.claude', 'code-platform', 'active', script));
    assert.ok(
      inGithubAdapter || inActiveAdapter,
      `Rework mode section mentions "${script}" but it does not exist under code-platform/github/ or .claude/code-platform/active/`
    );
  }
});

test('ReworkSection_NeverOpensNewPrOrBranch', () => {
  assert.ok(REWORK_SECTION, 'Rework mode section must exist to check for new-PR/new-branch commands');
  // Guard the INTENT ("never opens a new PR/branch"), not just two literal spellings — cover the
  // common alternate forms an edit might reach for.
  const forbiddenNewPr = [/gh\s+pr\s+create\b/, /gh\s+pr\s+new\b/];
  const forbiddenNewBranch = [/checkout\s+-b\b/, /switch\s+-c\b/, /switch\s+--create\b/, /worktree\s+add\b/];
  for (const re of forbiddenNewPr) {
    assert.doesNotMatch(REWORK_SECTION, re, `Rework mode must never open a new PR (matched ${re}) — it updates the existing PR in place`);
  }
  for (const re of forbiddenNewBranch) {
    assert.doesNotMatch(REWORK_SECTION, re, `Rework mode must never create a new branch (matched ${re}) — it checks out the PR's existing head branch`);
  }
});

test('HardRules_MentionsRework', () => {
  assert.ok(HARD_RULES_SECTION, 'Expected a "## Hard rules" section');
  assert.match(HARD_RULES_SECTION, /--rework/, 'Hard rules section must document --rework');
});

test('Regression_ExistingStopTokensAndFlagsStillPresent', () => {
  const requiredTokens = [
    'STOP 1', 'STOP 1.5', 'STOP 3',
    '--discuss', '--research', '--quick', '--auto', '--full', '--autonomous',
  ];
  for (const token of requiredTokens) {
    assert.ok(SKILL_MD.includes(token), `Expected SKILL.md to still contain "${token}"`);
  }
});
