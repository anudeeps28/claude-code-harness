const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync, execFileSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', 'inventory-check.js');

function runHook(toolInput, cwd) {
  const result = spawnSync(
    process.execPath,
    [HOOK],
    {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: toolInput }),
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_HARNESS_WORK_ROOT: '' },
      cwd,
    }
  );
  let parsed = null;
  try { parsed = result.stdout ? JSON.parse(result.stdout) : null; } catch {}
  return { exitCode: result.status, stdout: result.stdout, json: parsed };
}

function makeRepo(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-check-'));
  execFileSync('git', ['init', '-b', 'main'], { cwd: dir });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir });
  return dir;
}

function stageNewFile(dir, rel, content) {
  const full = path.join(dir, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
  execFileSync('git', ['add', rel], { cwd: dir });
}

test('inventory-check_NonCommitCommand_Allows', () => {
  const r = runHook({ command: 'git status' }, process.cwd());
  assert.strictEqual(r.exitCode, 0);
});

test('inventory-check_CommitWithNoNewAgents_Allows', () => {
  const dir = makeRepo({
    'README.md': '1 agents, 1 skills\n| `foo` | opus |',
    'CHANGELOG.md': '## [Unreleased]\nfoo',
    'agents/foo.md': '---\nname: foo\n---',
  });
  stageNewFile(dir, 'src/app.js', 'console.log("hi")');
  const r = runHook({ command: 'git commit -m "add app"' }, dir);
  assert.strictEqual(r.exitCode, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('inventory-check_NewAgentMissingFromReadmeTable_Denies', () => {
  const dir = makeRepo({
    'README.md': '1 agents\n## Agents\n| Agent | Model |\n| `foo` | opus |',
    'CHANGELOG.md': '## [Unreleased]\nbar-agent added',
    'agents/foo.md': '---\nname: foo\n---',
  });
  stageNewFile(dir, 'agents/bar.md', '---\nname: bar\n---');
  const r = runHook({ command: 'git commit -m "add bar"' }, dir);
  assert.strictEqual(r.exitCode, 2);
  assert.match(r.json.reason, /README\.md agent table missing row for `bar`/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('inventory-check_NewAgentMissingFromChangelog_Warns', () => {
  const dir = makeRepo({
    'README.md': '2 agents\n| `foo` | opus |\n| `bar` | opus |',
    'CHANGELOG.md': '## [Unreleased]\nnothing here',
    'agents/foo.md': '---\nname: foo\n---',
  });
  stageNewFile(dir, 'agents/bar.md', '---\nname: bar\n---');
  const r = runHook({ command: 'git commit -m "add bar"' }, dir);
  assert.strictEqual(r.exitCode, 0);
  assert.match(r.json.hookSpecificOutput.additionalContext, /no entry for new agent `bar`/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('inventory-check_AgentCountMismatch_Denies', () => {
  const dir = makeRepo({
    'README.md': '1 agents\n| `foo` | opus |\n| `bar` | opus |',
    'CHANGELOG.md': '## [Unreleased]\nbar',
    'agents/foo.md': '---\nname: foo\n---',
  });
  stageNewFile(dir, 'agents/bar.md', '---\nname: bar\n---');
  const r = runHook({ command: 'git commit -m "add bar"' }, dir);
  assert.strictEqual(r.exitCode, 2);
  assert.match(r.json.reason, /README\.md says 1 agents but agents\/ has 2/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('inventory-check_AllUpdated_Allows', () => {
  const dir = makeRepo({
    'README.md': '2 agents\n| `foo` | opus |\n| `bar` | opus |',
    'CHANGELOG.md': '## [Unreleased]\nbar added',
    'agents/foo.md': '---\nname: foo\n---',
  });
  stageNewFile(dir, 'agents/bar.md', '---\nname: bar\n---');
  const r = runHook({ command: 'git commit -m "add bar"' }, dir);
  assert.strictEqual(r.exitCode, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('inventory-check_NewSkillMissingFromChangelog_Warns', () => {
  const dir = makeRepo({
    'README.md': '2 skills',
    'CHANGELOG.md': '## [Unreleased]\nnothing',
    'skills/foo/SKILL.md': '---\nname: foo\n---',
  });
  stageNewFile(dir, 'skills/bar/SKILL.md', '---\nname: bar\n---');
  const r = runHook({ command: 'git commit -m "add bar skill"' }, dir);
  assert.strictEqual(r.exitCode, 0);
  assert.match(r.json.hookSpecificOutput.additionalContext, /no entry for new skill `bar`/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('inventory-check_VersionBumpEmptyUnreleased_Denies', () => {
  const dir = makeRepo({
    'README.md': '1 skills',
    'CHANGELOG.md': '## [Unreleased]\n\n## [3.0.0]\n- old stuff',
    'VERSION': '3.0.0',
    'skills/foo/SKILL.md': '---\nname: foo\n---',
  });
  fs.writeFileSync(path.join(dir, 'VERSION'), '3.1.0');
  execFileSync('git', ['add', 'VERSION'], { cwd: dir });
  const r = runHook({ command: 'git commit -m "bump version"' }, dir);
  assert.strictEqual(r.exitCode, 2);
  assert.match(r.json.reason, /\[Unreleased\] has no entries/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('inventory-check_VersionBumpWithUnreleasedEntries_Allows', () => {
  const dir = makeRepo({
    'README.md': '1 skills',
    'CHANGELOG.md': '## [Unreleased]\n\n### Added\n\n- new thing\n\n## [3.0.0]\n- old',
    'VERSION': '3.0.0',
    'skills/foo/SKILL.md': '---\nname: foo\n---',
  });
  fs.writeFileSync(path.join(dir, 'VERSION'), '3.1.0');
  execFileSync('git', ['add', 'VERSION'], { cwd: dir });
  const r = runHook({ command: 'git commit -m "bump version"' }, dir);
  assert.strictEqual(r.exitCode, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('inventory-check_NewHook_Warns', () => {
  const dir = makeRepo({
    'README.md': '1 skills',
    'CHANGELOG.md': '## [Unreleased]\n\n- something',
  });
  stageNewFile(dir, 'hooks/new-thing.js', '// hook');
  const r = runHook({ command: 'git commit -m "add hook"' }, dir);
  assert.strictEqual(r.exitCode, 0);
  assert.match(r.json.hookSpecificOutput.additionalContext, /New hook `new-thing\.js`/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('inventory-check_RemovedSkill_Warns', () => {
  const dir = makeRepo({
    'README.md': '1 skills',
    'CHANGELOG.md': '## [Unreleased]\n\n- x',
    'skills/foo/SKILL.md': '---\nname: foo\n---',
    'skills/bar/SKILL.md': '---\nname: bar\n---',
  });
  execFileSync('git', ['rm', 'skills/bar/SKILL.md'], { cwd: dir });
  const r = runHook({ command: 'git commit -m "remove bar"' }, dir);
  assert.strictEqual(r.exitCode, 0);
  assert.match(r.json.hookSpecificOutput.additionalContext, /Skill `bar` removed/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('inventory-check_LandingPageCountMismatch_Warns', () => {
  const dir = makeRepo({
    'README.md': '2 skills',
    'CHANGELOG.md': '## [Unreleased]\n\n- bar added',
    'docs/index.html': '<div class="num">1</div><div class="what">Skills</div>',
    'skills/foo/SKILL.md': '---\nname: foo\n---',
  });
  stageNewFile(dir, 'skills/bar/SKILL.md', '---\nname: bar\n---');
  const r = runHook({ command: 'git commit -m "add bar"' }, dir);
  assert.strictEqual(r.exitCode, 0);
  assert.match(r.json.hookSpecificOutput.additionalContext, /docs\/index\.html shows 1 Skills but skills\/ has 2/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('inventory-check_ModifiedAgentNotNew_Allows', () => {
  const dir = makeRepo({
    'README.md': '1 agents\n| `foo` | opus |',
    'CHANGELOG.md': '## [Unreleased]',
    'agents/foo.md': '---\nname: foo\n---\nold content',
  });
  fs.writeFileSync(path.join(dir, 'agents/foo.md'), '---\nname: foo\n---\nnew content');
  execFileSync('git', ['add', 'agents/foo.md'], { cwd: dir });
  const r = runHook({ command: 'git commit -m "update foo"' }, dir);
  assert.strictEqual(r.exitCode, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});
