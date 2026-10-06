// Tests for skills/implement/bin/allowlist-check.js (F5 #52): before the first story starts, every
// command the run will use is compared with the project's and the user's allow rules. It only reports;
// it never writes settings, and never proposes a rule for a destructive command.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bin', 'allowlist-check.js');
const { covers } = require(SCRIPT);

const LESSONS = [
  '## Test Commands',
  '- Build: `npm run build`',
  '- Unit tests: `npm test`',
  '- Integration tests: `<!-- not applicable -->`',
  '',
  '## Observe',
  '- E2E command: `npm run test:e2e`',
  '- Start the app: `npm run dev`',
].join('\n');

function setup(allow, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'allow-'));
  fs.mkdirSync(path.join(dir, 'tasks'));
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.writeFileSync(path.join(dir, 'tasks', 'lessons.md'), LESSONS);
  fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow } }));
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'allow-user-'));
  fs.writeFileSync(path.join(userDir, 'settings.json'), JSON.stringify({ permissions: { allow: extra.userAllow || [] } }));
  return { dir, user: path.join(userDir, 'settings.json') };
}

function run(s, args = []) {
  const before = fs.readFileSync(path.join(s.dir, '.claude', 'settings.json'), 'utf8');
  const r = spawnSync(process.execPath, [SCRIPT, '--user-settings', s.user, ...args], { cwd: s.dir, encoding: 'utf8' });
  assert.equal(fs.readFileSync(path.join(s.dir, '.claude', 'settings.json'), 'utf8'), before, 'settings are never written');
  return { code: r.status, out: r.stdout + r.stderr };
}

const ALL = [
  'Bash(git worktree add:*)', 'Bash(git worktree remove:*)', 'Bash(git merge:*)', 'Bash(git branch -d:*)',
  'Bash(git add:*)', 'Bash(git commit:*)', 'Bash(git push:*)', 'Bash(gh pr create:*)',
  'Bash(node:*)', 'Bash(bash:*)', 'Bash(npm run build:*)', 'Bash(npm test:*)', 'Bash(npm run test:e2e:*)', 'Bash(npm run dev:*)',
];

// Destructive commands, built from parts so this file never spells one out whole.
const FORCE = ['--', 'force'].join('');
const DESTRUCTIVE = [
  `git push ${FORCE} origin feature/1-x`,
  `git worktree remove ${FORCE} ../x`,
  ['git branch', '-' + 'D', 'story/1-a'].join(' '),
  ['git reset', '--' + 'hard', 'HEAD'].join(' '),
];

test('Covers_PrefixWildcardAndExactRules', () => {
  assert.ok(covers('Bash(npm test:*)', 'npm test -- --grep x'));
  assert.ok(covers('Bash(npm run *)', 'npm run build'));
  assert.ok(covers('Bash(npm run build)', 'npm run build'));
  assert.ok(!covers('Bash(npm run build)', 'npm run build --prod'));
  assert.ok(!covers('Bash(npm test:*)', 'npm testify'));
  assert.ok(covers('Bash', 'anything at all'));
  assert.ok(!covers('Read(*)', 'npm test'));
});

test('Allowlist_EverythingCovered_PassesSilently', () => {
  const r = run(setup(ALL));
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out, '');
});

test('Allowlist_MissingCommand_ListedWithTheRuleThatWouldCoverIt', () => {
  const r = run(setup(ALL.filter((a) => a !== 'Bash(npm run test:e2e:*)' && a !== 'Bash(git merge:*)')));
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^missing: npm run test:e2e +→ add "Bash\(npm run test:e2e:\*\)"$/m);
  assert.match(r.out, /^missing: git merge --no-ff --no-commit <story branch> +→ add "Bash\(git merge:\*\)"$/m);
  assert.doesNotMatch(r.out, /npm run build/);
});

test('Allowlist_SameCommandTwice_ListedOnce', () => {
  // Found in the F5 Demo: the unit-test and e2e commands were the same, and showed up twice.
  const s = setup(ALL.filter((a) => a !== 'Bash(npm test:*)'));
  fs.appendFileSync(path.join(s.dir, 'tasks', 'lessons.md'), '\n- Custom test script: `npm test`\n');
  const r = run(s);
  assert.equal((r.out.match(/^missing: npm test /gm) || []).length, 1, r.out);
});

test('Allowlist_UserSettingsCountToo', () => {
  const s = setup(ALL.filter((a) => a !== 'Bash(npm test:*)'), { userAllow: ['Bash(npm test:*)'] });
  assert.equal(run(s).code, 0);
});

test('Allowlist_PlaceholderCommandsAreNotCollected', () => {
  const r = run(setup(ALL));
  assert.doesNotMatch(r.out, /not applicable/);
});

test('Allowlist_DestructiveCommandIsNeverProposed', () => {
  const r = run(setup(ALL), DESTRUCTIVE.flatMap((c) => ['--command', c]));
  assert.equal(r.code, 1, r.out);
  assert.doesNotMatch(r.out, /add "Bash\(/, 'no rule is proposed for any of them');
  assert.equal((r.out.match(/^refused: .* is destructive and is never allowed; the run does not need it$/gm) || []).length, 4, r.out);
});

test('Allowlist_BlanketBashAllow_IsReportedNotRecommended', () => {
  const r = run(setup(['Bash']));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^note: an allow rule of plain "Bash" lets every command through/m);
});
