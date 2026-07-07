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

test('inventory-check_NewAgentMissingFromChangelog_Denies', () => {
  const dir = makeRepo({
    'README.md': '2 agents\n| `foo` | opus |\n| `bar` | opus |',
    'CHANGELOG.md': '## [Unreleased]\nnothing here',
    'agents/foo.md': '---\nname: foo\n---',
  });
  stageNewFile(dir, 'agents/bar.md', '---\nname: bar\n---');
  const r = runHook({ command: 'git commit -m "add bar"' }, dir);
  assert.strictEqual(r.exitCode, 2);
  assert.match(r.json.reason, /CHANGELOG\.md.*missing entry for `bar`/);
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

test('inventory-check_NewSkillMissingFromChangelog_Denies', () => {
  const dir = makeRepo({
    'README.md': '1 skills',
    'CHANGELOG.md': '## [Unreleased]\nnothing',
    'skills/foo/SKILL.md': '---\nname: foo\n---',
  });
  stageNewFile(dir, 'skills/bar/SKILL.md', '---\nname: bar\n---');
  const r = runHook({ command: 'git commit -m "add bar skill"' }, dir);
  assert.strictEqual(r.exitCode, 2);
  assert.match(r.json.reason, /CHANGELOG.*missing entry for skill `bar`/);
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
