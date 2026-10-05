// local-todo-render.test.js — #66: tracker writes must not rebuild tasks/todo.md.
//
// render-todo.sh used to run after every local write (and on list-issues), costing ~32s per call
// on Windows Git Bash with 47 issues, twice per create-sub-issue. todo.md is a convenience mirror of
// tasks/issues/, so it is now rebuilt only on request: by hand, or when LOCAL_RENDER_TODO=1 is set.
//
// The golden board (golden/local/todo-board.md) was captured from the pre-#66 renderer, so the
// single-pass rewrite is held to byte-identical output.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ADAPTERS_DIR = path.join(REPO_ROOT, 'trackers');
const GOLDEN_BOARD = path.join(__dirname, 'golden', 'local', 'todo-board.md');
const TIMEOUT_MS = 90000; // process startup under `node --test` contention on Windows (see notes.md)

const HAS_BASH = (() => {
  try {
    const r = spawnSync('bash', ['-c', 'echo ok'], { encoding: 'utf8' });
    return r.status === 0 && r.stdout.trim() === 'ok';
  } catch { return false; }
})();
const t = HAS_BASH ? test : (name, fn) => test(`${name} (skipped: bash not available)`, { skip: true }, fn);

// Board fixture: two label groups, a multi-label item, an unlabeled item, and closed items with and
// without a reason, so every branch of the renderer is exercised.
const BOARD_ISSUES = {
  1: { title: 'Alpha feature', state: 'open', labels: '[feature, priority:high]' },
  2: { title: 'Beta bug "quoted"', state: 'open', labels: '[bug]' },
  3: { title: 'Gamma unlabeled', state: 'open', labels: '[]' },
  4: { title: 'Delta done', state: 'closed', labels: '[feature]', closed: '2026-07-02T10:00:00Z', reason: 'completed' },
  5: { title: 'Epsilon dropped', state: 'closed', labels: '[]', closed: '2026-07-03T10:00:00Z', reason: 'null' },
  10: { title: 'Zeta second feature', state: 'open', labels: '[feature]' },
};

function issueFile(id, i) {
  return [
    '---',
    `id: ${id}`,
    `title: ${i.title}`,
    `state: ${i.state}`,
    `labels: ${i.labels}`,
    'parent: null',
    'assignee: null',
    'blocked_by: []',
    'created: 2026-07-01T10:00:00Z',
    `closed: ${i.closed || 'null'}`,
    `close_reason: ${i.reason || 'null'}`,
    '---',
    '',
    'Body.',
    '',
  ].join('\n');
}

function workspace(issues = BOARD_ISSUES) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-render-'));
  fs.cpSync(path.join(ADAPTERS_DIR, 'local'), path.join(root, 'local'), { recursive: true });
  fs.cpSync(path.join(ADAPTERS_DIR, 'lib'), path.join(root, 'lib'), { recursive: true });
  const issuesDir = path.join(root, 'tasks', 'issues');
  fs.mkdirSync(issuesDir, { recursive: true });
  for (const [id, i] of Object.entries(issues)) fs.writeFileSync(path.join(issuesDir, `${id}.md`), issueFile(id, i));
  return { root, issuesDir, todo: path.join(root, 'tasks', 'todo.md') };
}

function run(ws, script, args = [], extraEnv = {}) {
  const env = {
    ...process.env,
    LOCAL_ISSUES_DIR: ws.issuesDir,
    TODO_OUTPUT: ws.todo,
    RETRY_BACKOFF_1: '0',
    RETRY_BACKOFF_2: '0',
  };
  delete env.LOCAL_RENDER_TODO; // a value inherited from the shell must not leak into the default case
  Object.assign(env, extraEnv);
  const scriptPath = script.startsWith('lib/') ? path.join(ws.root, script) : path.join(ws.root, 'local', script);
  return spawnSync('bash', [scriptPath, ...args], { encoding: 'utf8', env, cwd: ws.root, timeout: TIMEOUT_MS });
}

function cleanup(ws) { try { fs.rmSync(ws.root, { recursive: true, force: true }); } catch { /* ignore */ } }

// Every local script that used to rebuild todo.md, with arguments valid against BOARD_ISSUES.
const CALLS = [
  ['create-issue.sh', ['New item', 'body', 'feature']],
  ['create-sub-issue.sh', ['1', 'New child', 'body', 'feature']],
  ['close-issue.sh', ['2', 'done']],
  ['add-label.sh', ['1', 'extra']],
  ['remove-label.sh', ['1', 'feature']],
  ['assign-issue.sh', ['1', 'someone']],
  ['comment-issue.sh', ['1', 'a comment']],
  ['add-blocker.sh', ['10', '1']],
  ['list-issues.sh', []],
];

for (const [script, args] of CALLS) {
  t(`local_${script}_DoesNotRebuildTodoByDefault`, () => {
    const ws = workspace();
    try {
      const r = run(ws, script, args);
      assert.strictEqual(r.status, 0, `${script} failed: ${r.stderr}`);
      assert.ok(!fs.existsSync(ws.todo), `${script} rebuilt todo.md without LOCAL_RENDER_TODO=1`);
    } finally { cleanup(ws); }
  });
}

t('local_CreateIssue_RebuildsTodoWhenOptedIn', () => {
  const ws = workspace();
  try {
    const r = run(ws, 'create-issue.sh', ['New item', 'body', 'feature'], { LOCAL_RENDER_TODO: '1' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.ok(fs.existsSync(ws.todo), 'todo.md was not rebuilt with LOCAL_RENDER_TODO=1');
    assert.match(fs.readFileSync(ws.todo, 'utf8'), /New item/);
  } finally { cleanup(ws); }
});

t('local_RenderTodo_OutputMatchesGoldenBoard', () => {
  const ws = workspace();
  try {
    const r = run(ws, 'lib/render-todo.sh', [ws.issuesDir]);
    assert.strictEqual(r.status, 0, r.stderr);
    const actual = fs.readFileSync(ws.todo, 'utf8');
    if (process.env.UPDATE_GOLDEN === '1') {
      fs.mkdirSync(path.dirname(GOLDEN_BOARD), { recursive: true });
      fs.writeFileSync(GOLDEN_BOARD, actual);
    }
    assert.strictEqual(actual, fs.readFileSync(GOLDEN_BOARD, 'utf8'));
  } finally { cleanup(ws); }
});
