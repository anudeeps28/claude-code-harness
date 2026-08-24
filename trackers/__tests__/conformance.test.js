// Tracker adapter conformance suite.
//
// Validates that each tracker adapter (ADO, GitHub, Todoist) honours the contract
// documented in trackers/README.md. New adapters (Linear, Jira, local, ...) must
// pass every test in this file before they're considered conformant.
//
// The tracker interface is 8 scripts (D14): 7 task scripts + list-issues.sh.
// PR-review-thread scripts now live in code-platform/ (see WS1).
//
// Mocking strategy: PATH override. The test prepends fixtures/bin/ to PATH
// so the adapter's `az` / `gh` invocations hit our bash stub scripts which
// pattern-match argv and return canned JSON from fixtures/responses/.
//
// Skipped on platforms without bash (e.g. raw Windows cmd). Git Bash on
// Windows works fine — that's where we run today.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ADAPTERS_DIR = path.join(REPO_ROOT, 'trackers');
const FIXTURES_BIN = path.join(__dirname, 'fixtures', 'bin');
const FIXTURES_LOCAL_ISSUES = path.join(__dirname, 'fixtures', 'local-issues');
const GOLDEN_DIR = path.join(__dirname, 'golden');

const HAS_BASH = (() => {
  try {
    const r = spawnSync('bash', ['-c', 'echo ok'], { encoding: 'utf8' });
    return r.status === 0 && r.stdout.trim() === 'ok';
  } catch { return false; }
})();

function describe(name, fn) {
  if (!HAS_BASH) {
    test(`${name} (skipped: bash not available)`, { skip: true }, () => {});
    return;
  }
  fn();
}

// Copy the chosen adapter into a temp dir, sed-replacing placeholders so the
// adapter scripts pass their own pre-flight checks under test.
function prepareAdapter(adapter) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `tracker-${adapter}-`));
  const adapterDir = path.join(tmp, adapter);
  fs.cpSync(path.join(ADAPTERS_DIR, adapter), adapterDir, { recursive: true });
  fs.cpSync(path.join(ADAPTERS_DIR, 'lib'), path.join(tmp, 'lib'), { recursive: true });

  // ADO scripts have a hardcoded ADO_PROJECT="YOUR_ADO_PROJECT" placeholder
  // that the installer rewrites. Do the same for tests.
  if (adapter === 'ado') {
    for (const file of fs.readdirSync(adapterDir)) {
      const p = path.join(adapterDir, file);
      let txt = fs.readFileSync(p, 'utf8');
      txt = txt.replace(/ADO_PROJECT="YOUR_ADO_PROJECT"/g, 'ADO_PROJECT="TEST_PROJ"');
      txt = txt.replace(/ADO_REPO="YOUR_ADO_REPO"/g, 'ADO_REPO="test-repo"');
      txt = txt.replace(/ADO_ORG_PATH="[^"]*"/g, 'ADO_ORG_PATH="https://dev.azure.com/test-org"');
      fs.writeFileSync(p, txt);
    }
  }
  return { root: tmp, adapterDir };
}

function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

function runScript(adapter, script, args, { fixtureMode, fixtureAuth, retryCounter, retrySucceedAt, extraEnv } = {}) {
  const { root, adapterDir } = prepareAdapter(adapter);
  try {
    // bash always uses ':' as PATH separator, regardless of host OS.
    // path.delimiter is ';' on Windows, which would corrupt PATH for bash.
    const env = {
      ...process.env,
      PATH: `${FIXTURES_BIN}:${process.env.PATH}`,
      RETRY_BACKOFF_1: '0',
      RETRY_BACKOFF_2: '0',
    };
    if (adapter === 'todoist') env.TODOIST_CLI = path.join(FIXTURES_BIN, 'td');
    if (fixtureMode) env.FIXTURE_MODE = fixtureMode;
    if (fixtureAuth) env.FIXTURE_AUTH = fixtureAuth;
    if (retryCounter) {
      env.FIXTURE_RETRY_COUNTER = retryCounter;
      env.FIXTURE_RETRY_SUCCEED_AT = String(retrySucceedAt || 2);
    }
    if (extraEnv) Object.assign(env, extraEnv);
    const result = spawnSync('bash', [path.join(adapterDir, script), ...args], {
      encoding: 'utf8',
      env,
      timeout: 15000,
    });
    return {
      exitCode: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    };
  } finally { cleanup(root); }
}

// Local backend uses a temp tasks/issues/ dir instead of PATH-override mocks.
function prepareLocalAdapter() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-local-'));
  const adapterDir = path.join(tmp, 'local');
  fs.cpSync(path.join(ADAPTERS_DIR, 'local'), adapterDir, { recursive: true });
  fs.cpSync(path.join(ADAPTERS_DIR, 'lib'), path.join(tmp, 'lib'), { recursive: true });

  // Seed fixture tasks/issues/ directory
  const issuesDir = path.join(tmp, 'tasks', 'issues');
  fs.mkdirSync(issuesDir, { recursive: true });
  fs.cpSync(FIXTURES_LOCAL_ISSUES, issuesDir, { recursive: true });

  // Create tasks/ dir for todo.md output
  fs.mkdirSync(path.join(tmp, 'tasks'), { recursive: true });

  return { root: tmp, adapterDir, issuesDir };
}

function runLocalScript(script, args, { issuesDir } = {}) {
  const { root, adapterDir, issuesDir: defaultIssuesDir } = prepareLocalAdapter();
  const effectiveIssuesDir = issuesDir || defaultIssuesDir;
  try {
    const env = {
      ...process.env,
      LOCAL_ISSUES_DIR: effectiveIssuesDir,
      TODO_OUTPUT: path.join(root, 'tasks', 'todo.md'),
      RETRY_BACKOFF_1: '0',
      RETRY_BACKOFF_2: '0',
    };
    const result = spawnSync('bash', [path.join(adapterDir, script), ...args], {
      encoding: 'utf8',
      env,
      cwd: root,
      timeout: 15000,
    });
    return {
      exitCode: result.status,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      root,
      issuesDir: effectiveIssuesDir,
    };
  } finally { cleanup(root); }
}

// Like runLocalScript but returns root for inspection before cleanup
function runLocalScriptKeep(script, args) {
  const { root, adapterDir, issuesDir } = prepareLocalAdapter();
  const env = {
    ...process.env,
    LOCAL_ISSUES_DIR: issuesDir,
    TODO_OUTPUT: path.join(root, 'tasks', 'todo.md'),
    RETRY_BACKOFF_1: '0',
    RETRY_BACKOFF_2: '0',
  };
  const result = spawnSync('bash', [path.join(adapterDir, script), ...args], {
    encoding: 'utf8',
    env,
    cwd: root,
    timeout: 15000,
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    root,
    issuesDir,
    adapterDir,
  };
}

function readGolden(adapter, name) {
  return fs.readFileSync(path.join(GOLDEN_DIR, adapter, name), 'utf8');
}

function normalize(s) {
  return s.replace(/\r\n/g, '\n').trim();
}

// ── Argument validation contract ──────────────────────────────────────

describe('arg-validation', () => {
  for (const adapter of ['ado', 'github', 'todoist']) {
    test(`${adapter}_GetIssue_NoArg_Exits1WithJsonError`, () => {
      const r = runScript(adapter, 'get-issue.sh', []);
      assert.equal(r.exitCode, 1);
      assert.match(r.stderr, /\{"error":/);
    });

    test(`${adapter}_CloseIssue_NoArg_Exits1WithJsonError`, () => {
      const r = runScript(adapter, 'close-issue.sh', []);
      assert.equal(r.exitCode, 1);
      assert.match(r.stderr, /\{"error":/);
    });

    // Wayfinding scripts (contract v3.1): all reject missing args the same way
    for (const [script, name] of Object.entries({
      'assign-issue.sh': 'AssignIssue',
      'comment-issue.sh': 'CommentIssue',
      'add-blocker.sh': 'AddBlocker',
      'get-blockers.sh': 'GetBlockers',
      'create-sub-issue.sh': 'CreateSubIssue',
    })) {
      test(`${adapter}_${name}_NoArgs_Exits1WithJsonError`, () => {
        const r = runScript(adapter, script, []);
        assert.equal(r.exitCode, 1);
        assert.match(r.stderr, /\{"error":/);
      });
    }
  }

  test('local_GetIssue_NoArg_Exits1WithJsonError', () => {
    const r = runLocalScript('get-issue.sh', []);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('local_CloseIssue_NoArg_Exits1WithJsonError', () => {
    const r = runLocalScript('close-issue.sh', []);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('local_CreateIssue_NoArg_Exits1WithJsonError', () => {
    const r = runLocalScript('create-issue.sh', []);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('local_AddLabel_NoArgs_Exits1WithJsonError', () => {
    const r = runLocalScript('add-label.sh', []);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('local_RemoveLabel_NoArgs_Exits1WithJsonError', () => {
    const r = runLocalScript('remove-label.sh', []);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('local_GetIssueChildren_NoArg_Exits1WithJsonError', () => {
    const r = runLocalScript('get-issue-children.sh', []);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('local_GetSprintIssues_NoArg_Exits1WithJsonError', () => {
    const r = runLocalScript('get-sprint-issues.sh', []);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  for (const [script, name] of Object.entries({
    'assign-issue.sh': 'AssignIssue',
    'comment-issue.sh': 'CommentIssue',
    'add-blocker.sh': 'AddBlocker',
    'get-blockers.sh': 'GetBlockers',
    'create-sub-issue.sh': 'CreateSubIssue',
  })) {
    test(`local_${name}_NoArgs_Exits1WithJsonError`, () => {
      const r = runLocalScript(script, []);
      assert.equal(r.exitCode, 1);
      assert.match(r.stderr, /\{"error":/);
    });
  }
});

// ── Happy path: stdout contract ──────────────────────────────────────

describe('happy-path-stdout', () => {
  test('ado_GetIssue_HappyPath_MatchesGoldenMarkdown', () => {
    const r = runScript('ado', 'get-issue.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.equal(normalize(r.stdout), normalize(readGolden('ado', 'get-issue.happy.md')));
  });

  test('github_GetIssue_HappyPath_MatchesGoldenMarkdown', () => {
    const r = runScript('github', 'get-issue.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.equal(normalize(r.stdout), normalize(readGolden('github', 'get-issue.happy.md')));
  });

  test('todoist_GetIssue_HappyPath_MatchesGoldenMarkdown', () => {
    const r = runScript('todoist', 'get-issue.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.equal(normalize(r.stdout), normalize(readGolden('todoist', 'get-issue.happy.md')));
  });

  // td v1.74 `task view --json` carries no completion flag; state is derived
  // from active-list membership. An active task reads OPEN with a real project.
  test('todoist_GetIssue_ActiveTask_ReportsOpenWithProject', () => {
    const r = runScript('todoist', 'get-issue.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /\*\*State:\*\* OPEN/);
    assert.match(r.stdout, /\*\*Project:\*\* 111/);
    assert.match(r.stdout, /\*\*Section:\*\* 555/);
  });

  // 5678 is viewable but absent from the active list -> must read CLOSED.
  test('todoist_GetIssue_CompletedTask_ReportsClosed', () => {
    const r = runScript('todoist', 'get-issue.sh', ['5678']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /\*\*State:\*\* CLOSED/);
    assert.match(r.stdout, /\*\*Project:\*\* 111/);
  });

  test('github_CloseIssue_HappyPath_ExitsZero', () => {
    const r = runScript('github', 'close-issue.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /Closed issue #1234/);
  });

  test('todoist_CloseIssue_HappyPath_ExitsZero', () => {
    const r = runScript('todoist', 'close-issue.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /Completed task 1234/);
  });

  test('ado_CloseIssue_HappyPath_ExitsZero', () => {
    const r = runScript('ado', 'close-issue.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /Closed work item #1234/);
  });

  test('local_GetIssue_HappyPath_MatchesGoldenMarkdown', () => {
    const r = runLocalScript('get-issue.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.equal(normalize(r.stdout), normalize(readGolden('local', 'get-issue.happy.md')));
  });

  test('local_CloseIssue_HappyPath_ExitsZero', () => {
    const r = runLocalScript('close-issue.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /Closed task #1234/);
  });

  test('local_CreateIssue_HappyPath_CreatesFileAndPrintsId', () => {
    const result = runLocalScriptKeep('create-issue.sh', ['New task', 'A body', 'feature']);
    try {
      assert.equal(result.exitCode, 0, `non-zero exit: ${result.stderr}`);
      assert.match(result.stdout, /1237/);
      const newFile = path.join(result.issuesDir, '1237.md');
      assert.ok(fs.existsSync(newFile), 'Expected 1237.md to be created');
      const content = fs.readFileSync(newFile, 'utf8');
      assert.match(content, /title: New task/);
      assert.match(content, /state: open/);
      assert.match(content, /labels: \[feature\]/);
    } finally { cleanup(result.root); }
  });

  test('local_ListIssues_HappyPath_ReturnsOpenTasksJSON', () => {
    const r = runLocalScript('list-issues.sh', []);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    const items = JSON.parse(r.stdout);
    assert.ok(Array.isArray(items));
    assert.equal(items.length, 2);
    assert.equal(items[0].id, 1234);
    assert.equal(items[0].state, 'open');
    assert.equal(items[1].id, 1235);
  });

  test('local_GetIssueChildren_HappyPath_ReturnsChildren', () => {
    const r = runLocalScript('get-issue-children.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /Child Tasks for Task #1234/);
    assert.match(r.stdout, /#1235/);
  });

  test('local_AddLabel_HappyPath_AddsLabel', () => {
    const result = runLocalScriptKeep('add-label.sh', ['1234', 'urgent']);
    try {
      assert.equal(result.exitCode, 0, `non-zero exit: ${result.stderr}`);
      assert.match(result.stdout, /Added label/);
      const content = fs.readFileSync(path.join(result.issuesDir, '1234.md'), 'utf8');
      assert.match(content, /urgent/);
    } finally { cleanup(result.root); }
  });

  test('local_RemoveLabel_HappyPath_RemovesLabel', () => {
    const result = runLocalScriptKeep('remove-label.sh', ['1234', 'feature']);
    try {
      assert.equal(result.exitCode, 0, `non-zero exit: ${result.stderr}`);
      assert.match(result.stdout, /Removed label/);
      const content = fs.readFileSync(path.join(result.issuesDir, '1234.md'), 'utf8');
      assert.ok(!content.match(/labels:.*feature/));
    } finally { cleanup(result.root); }
  });

  // ── Wayfinding scripts (contract v3.1) ─────────────────────────────

  test('github_AssignIssue_HappyPath_AssignsToMe', () => {
    const r = runScript('github', 'assign-issue.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /Assigned issue #1234 to @me/);
  });

  test('github_CommentIssue_HappyPath_ExitsZero', () => {
    const r = runScript('github', 'comment-issue.sh', ['1234', 'Decision recorded']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /Commented on issue #1234/);
  });

  test('github_AddBlocker_HappyPath_RecordsBlocker', () => {
    const r = runScript('github', 'add-blocker.sh', ['1234', '77']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /Issue #1234 is now blocked by #77/);
  });

  test('github_AddBlocker_AlreadyBlocked_ExitsZeroIdempotent', () => {
    const r = runScript('github', 'add-blocker.sh', ['4321', '12']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /already blocked by #12/);
  });

  test('github_GetBlockers_NoBlockers_ReturnsEmptyArray', () => {
    const r = runScript('github', 'get-blockers.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.deepEqual(JSON.parse(r.stdout), []);
  });

  test('github_GetBlockers_WithBlockers_ReturnsIds', () => {
    const r = runScript('github', 'get-blockers.sh', ['4321']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.deepEqual(JSON.parse(r.stdout), [12, 14]);
  });

  test('ado_AssignIssue_HappyPath_AssignsSignedInUser', () => {
    const r = runScript('ado', 'assign-issue.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /Assigned work item #1234 to Test User/);
  });

  test('ado_CommentIssue_HappyPath_ExitsZero', () => {
    const r = runScript('ado', 'comment-issue.sh', ['1234', 'Decision recorded']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /Commented on work item #1234/);
  });

  test('ado_AddBlocker_HappyPath_AddsPredecessorLink', () => {
    const r = runScript('ado', 'add-blocker.sh', ['1234', '77']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /Work item #1234 is now blocked by #77/);
  });

  test('ado_GetBlockers_NoBlockers_ReturnsEmptyArray', () => {
    const r = runScript('ado', 'get-blockers.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.deepEqual(JSON.parse(r.stdout), []);
  });

  test('ado_GetBlockers_WithBlockers_ReturnsPredecessorIds', () => {
    const r = runScript('ado', 'get-blockers.sh', ['4321']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.deepEqual(JSON.parse(r.stdout), [12]);
  });

  test('ado_CreateSubIssue_HappyPath_CreatesAndLinksChild', () => {
    const r = runScript('ado', 'create-sub-issue.sh', ['1234', 'Child task', 'A body']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.parent, 1234);
    assert.equal(out.child, 5678);
  });

  // ── ADO create-time env overrides (/to-issues destination + work item type) ──
  //
  // These pin the three defects that make an ADO board silently wrong: `--tags`
  // is not a valid arg on `az boards work-item create` (unrecognized-arguments
  // failure), a hardcoded type can't create the parent Feature, and a missing
  // area/iteration lands items at the project root where no filtered board view
  // shows them.

  // Runs an ADO script with an argv log and returns the recorded `az` command lines.
  function runAdoAndCaptureArgs(script, args, extraEnv = {}) {
    const logFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ado-args-')), 'az.log');
    try {
      const r = runScript('ado', script, args, {
        extraEnv: { ...extraEnv, FIXTURE_ARGS_LOG: logFile },
      });
      const lines = fs.existsSync(logFile)
        ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean)
        : [];
      return { ...r, argLines: lines, createLine: lines.find((l) => l.includes('work-item create')) || '' };
    } finally { cleanup(path.dirname(logFile)); }
  }

  test('ado_CreateIssue_Tags_PassedAsSystemTagsFieldNotTagsFlag', () => {
    const r = runAdoAndCaptureArgs('create-issue.sh', ['A story', 'A body', 'priority:medium']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.createLine, /--fields System\.Tags=priority:medium/);
    assert.ok(!/--tags/.test(r.createLine), `--tags is not a valid create arg: ${r.createLine}`);
  });

  test('ado_CreateIssue_NoEnvOverrides_DefaultsToUserStoryAndOmitsPaths', () => {
    const r = runAdoAndCaptureArgs('create-issue.sh', ['A story', 'A body', 'priority:medium']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.createLine, /--type User Story/);
    assert.ok(!/--area/.test(r.createLine), `area should be omitted when unset: ${r.createLine}`);
    assert.ok(!/--iteration/.test(r.createLine), `iteration should be omitted when unset: ${r.createLine}`);
  });

  test('ado_CreateIssue_WorkItemTypeEnv_CreatesFeature', () => {
    const r = runAdoAndCaptureArgs(
      'create-issue.sh',
      ['A feature', 'A body', 'priority:medium'],
      { ADO_WORK_ITEM_TYPE: 'Feature' },
    );
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.createLine, /--type Feature/);
  });

  test('ado_CreateIssue_AreaAndIterationEnv_ForwardedToAz', () => {
    const r = runAdoAndCaptureArgs(
      'create-issue.sh',
      ['A story', 'A body', 'priority:medium'],
      { ADO_AREA_PATH: 'TEST_PROJ\\Harness', ADO_ITERATION_PATH: 'TEST_PROJ\\Sprint 3' },
    );
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.createLine, /--area TEST_PROJ\\Harness/);
    assert.match(r.createLine, /--iteration TEST_PROJ\\Sprint 3/);
  });

  test('ado_CreateSubIssue_NoEnvOverrides_DefaultsToTask', () => {
    const r = runAdoAndCaptureArgs('create-sub-issue.sh', ['1234', 'Child task', 'A body']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.createLine, /--type Task/);
  });

  test('ado_CreateSubIssue_EnvOverrides_StoryTypeAndPathsForwarded', () => {
    const r = runAdoAndCaptureArgs(
      'create-sub-issue.sh',
      ['1234', 'A story', 'A body', 'priority:medium'],
      {
        ADO_WORK_ITEM_TYPE: 'Product Backlog Item',
        ADO_AREA_PATH: 'TEST_PROJ\\Harness',
        ADO_ITERATION_PATH: 'TEST_PROJ\\Sprint 3',
      },
    );
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.createLine, /--type Product Backlog Item/);
    assert.match(r.createLine, /--area TEST_PROJ\\Harness/);
    assert.match(r.createLine, /--iteration TEST_PROJ\\Sprint 3/);
    assert.match(r.createLine, /--fields System\.Tags=priority:medium/);
    assert.ok(!/--tags/.test(r.createLine), `--tags is not a valid create arg: ${r.createLine}`);
  });

  // ── Todoist create-time env overrides (/to-issues native priority + milestone header) ──
  //
  // Todoist has two abilities the flat adapter args cannot express: native p1-p4
  // priority (which actually SORTS the list, unlike a `priority:high` text label)
  // and uncompletable tasks (a task with no checkbox — used as a milestone header
  // so a whole milestone can't be ticked off by accident). /to-issues passes both
  // as optional env vars, the same passthrough shape ADO_WORK_ITEM_TYPE uses, so
  // the skill stays backend-agnostic and adapters that lack the concept ignore it.

  // Runs a Todoist script with an argv log and returns the recorded `td` command lines.
  function runTodoistAndCaptureArgs(script, args, extraEnv = {}) {
    const logFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'td-args-')), 'td.log');
    try {
      const r = runScript('todoist', script, args, {
        extraEnv: { ...extraEnv, FIXTURE_ARGS_LOG: logFile },
      });
      const lines = fs.existsSync(logFile)
        ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean)
        : [];
      return { ...r, argLines: lines, createLine: lines.find((l) => l.startsWith('task add')) || '' };
    } finally { cleanup(path.dirname(logFile)); }
  }

  test('todoist_CreateIssue_NoEnvOverrides_OmitsPriorityAndUncompletable', () => {
    const r = runTodoistAndCaptureArgs('create-issue.sh', ['A story', 'A body', 'priority:medium']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.ok(!/--priority/.test(r.createLine), `priority should be omitted when unset: ${r.createLine}`);
    assert.ok(!/--uncompletable/.test(r.createLine), `uncompletable should be omitted when unset: ${r.createLine}`);
  });

  test('todoist_CreateIssue_PriorityEnv_ForwardedToTd', () => {
    const r = runTodoistAndCaptureArgs(
      'create-issue.sh',
      ['A story', 'A body', 'priority:high'],
      { TRACKER_PRIORITY: 'p1' },
    );
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.createLine, /--priority p1/);
    // The text label still travels — native priority augments it, never replaces it.
    assert.match(r.createLine, /--labels priority:high/);
  });

  test('todoist_CreateIssue_UncompletableEnv_ForwardedToTd', () => {
    const r = runTodoistAndCaptureArgs(
      'create-issue.sh',
      ['Milestone: Foundations', 'A body', ''],
      { TRACKER_UNCOMPLETABLE: '1' },
    );
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.createLine, /--uncompletable/);
  });

  test('todoist_CreateIssue_InvalidPriority_FailsLoudly', () => {
    const r = runTodoistAndCaptureArgs(
      'create-issue.sh',
      ['A story', 'A body', ''],
      { TRACKER_PRIORITY: 'urgent' },
    );
    assert.notEqual(r.exitCode, 0, 'an unusable priority must fail, not be silently dropped');
    assert.match(r.stderr, /TRACKER_PRIORITY/);
    assert.equal(r.createLine, '', 'no task should be created on invalid input');
  });

  test('todoist_CreateSubIssue_PriorityEnv_ForwardedToTd', () => {
    const r = runTodoistAndCaptureArgs(
      'create-sub-issue.sh',
      ['1234', 'A story', 'A body', 'priority:medium'],
      { TRACKER_PRIORITY: 'p2' },
    );
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.createLine, /--priority p2/);
    assert.match(r.createLine, /--parent id:1234/);
  });

  test('todoist_CreateSubIssue_InvalidPriority_FailsLoudly', () => {
    const r = runTodoistAndCaptureArgs(
      'create-sub-issue.sh',
      ['1234', 'A story', 'A body', ''],
      { TRACKER_PRIORITY: 'p9' },
    );
    assert.notEqual(r.exitCode, 0, 'an unusable priority must fail, not be silently dropped');
    assert.match(r.stderr, /TRACKER_PRIORITY/);
  });

  // The passthrough must be inert everywhere else: a backend with no such concept
  // ignores the vars rather than failing, so /to-issues can set them unconditionally.
  for (const adapter of ['github', 'local', 'ado']) {
    test(`${adapter}_CreateIssue_TodoistOnlyEnvVars_Ignored`, () => {
      const r = runScript(adapter, 'create-issue.sh', ['A story', 'A body', 'priority:medium'], {
        extraEnv: { TRACKER_PRIORITY: 'p1', TRACKER_UNCOMPLETABLE: '1' },
      });
      assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    });
  }

  test('todoist_AssignIssue_HappyPath_AddsClaimedLabel', () => {
    const r = runScript('todoist', 'assign-issue.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /Assigned task #1234/);
  });

  test('todoist_CommentIssue_HappyPath_ExitsZero', () => {
    const r = runScript('todoist', 'comment-issue.sh', ['1234', 'Decision recorded']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /Commented on task #1234/);
  });

  test('todoist_AddBlocker_HappyPath_RecordsBlocker', () => {
    const r = runScript('todoist', 'add-blocker.sh', ['1234', '77']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.match(r.stdout, /Task #1234 is now blocked by #77/);
  });

  test('todoist_GetBlockers_NoBlockers_ReturnsEmptyArray', () => {
    const r = runScript('todoist', 'get-blockers.sh', ['1234']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.deepEqual(JSON.parse(r.stdout), []);
  });

  test('todoist_GetBlockers_WithBlockers_ReturnsIds', () => {
    // Todoist IDs are alphanumeric, so they come back as JSON strings
    const r = runScript('todoist', 'get-blockers.sh', ['4321']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    assert.deepEqual(JSON.parse(r.stdout), ['12']);
  });

  test('todoist_CreateSubIssue_HappyPath_CreatesSubtask', () => {
    // Todoist IDs are alphanumeric, so they come back as JSON strings
    const r = runScript('todoist', 'create-sub-issue.sh', ['1234', 'Child task', 'A body']);
    assert.equal(r.exitCode, 0, `non-zero exit: ${r.stderr}`);
    const out = JSON.parse(r.stdout);
    assert.equal(out.parent, '1234');
    assert.equal(out.child, '9876543');
  });

  test('local_AssignIssue_HappyPath_SetsAssigneeField', () => {
    const result = runLocalScriptKeep('assign-issue.sh', ['1234', 'testdev']);
    try {
      assert.equal(result.exitCode, 0, `non-zero exit: ${result.stderr}`);
      assert.match(result.stdout, /Assigned task #1234 to testdev/);
      const content = fs.readFileSync(path.join(result.issuesDir, '1234.md'), 'utf8');
      assert.match(content, /assignee: testdev/);
    } finally { cleanup(result.root); }
  });

  test('local_CommentIssue_HappyPath_AppendsComment', () => {
    const result = runLocalScriptKeep('comment-issue.sh', ['1234', 'My decision']);
    try {
      assert.equal(result.exitCode, 0, `non-zero exit: ${result.stderr}`);
      assert.match(result.stdout, /Commented on task #1234/);
      const content = fs.readFileSync(path.join(result.issuesDir, '1234.md'), 'utf8');
      assert.match(content, /\*\*Comment \(/);
      assert.match(content, /My decision/);
    } finally { cleanup(result.root); }
  });

  test('local_AddBlocker_And_GetBlockers_RoundTrip', () => {
    const result = runLocalScriptKeep('add-blocker.sh', ['1234', '1235']);
    try {
      assert.equal(result.exitCode, 0, `non-zero exit: ${result.stderr}`);
      assert.match(result.stdout, /Task #1234 is now blocked by #1235/);
      const content = fs.readFileSync(path.join(result.issuesDir, '1234.md'), 'utf8');
      assert.match(content, /blocked_by: \[1235\]/);

      const env = {
        ...process.env,
        LOCAL_ISSUES_DIR: result.issuesDir,
        RETRY_BACKOFF_1: '0',
        RETRY_BACKOFF_2: '0',
      };
      const readBack = spawnSync(
        'bash',
        [path.join(result.adapterDir, 'get-blockers.sh'), '1234'],
        { encoding: 'utf8', env, cwd: result.root, timeout: 15000 }
      );
      assert.equal(readBack.status, 0, `non-zero exit: ${readBack.stderr}`);
      assert.deepEqual(JSON.parse(readBack.stdout), [1235]);
    } finally { cleanup(result.root); }
  });

  test('local_CreateSubIssue_HappyPath_SetsParentField', () => {
    const result = runLocalScriptKeep('create-sub-issue.sh', ['1234', 'Child task', 'A body', 'wayfinder:grilling']);
    try {
      assert.equal(result.exitCode, 0, `non-zero exit: ${result.stderr}`);
      const out = JSON.parse(result.stdout);
      assert.equal(out.parent, 1234);
      assert.equal(out.child, 1237);
      const content = fs.readFileSync(path.join(result.issuesDir, '1237.md'), 'utf8');
      assert.match(content, /parent: 1234/);
      assert.match(content, /labels: \[wayfinder:grilling\]/);
    } finally { cleanup(result.root); }
  });
});

// ── Failure-mode contract ────────────────────────────────────────────

describe('failure-modes', () => {
  test('ado_GetIssue_NotFound_Exits1WithJsonStderr', () => {
    const r = runScript('ado', 'get-issue.sh', ['9999']);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('github_GetIssue_NotFound_Exits1WithJsonStderr', () => {
    const r = runScript('github', 'get-issue.sh', ['9999']);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('ado_GetIssue_AuthExpired_Exits1WithAuthError', () => {
    const r = runScript('ado', 'get-issue.sh', ['1234'], { fixtureAuth: 'expired' });
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /az login|auth/i);
  });

  test('github_GetIssue_AuthExpired_Exits1WithAuthError', () => {
    const r = runScript('github', 'get-issue.sh', ['1234'], { fixtureAuth: 'expired' });
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /gh auth|expired/i);
  });

  test('todoist_GetIssue_NotFound_Exits1WithJsonStderr', () => {
    const r = runScript('todoist', 'get-issue.sh', ['9999']);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('todoist_GetIssue_AuthExpired_Exits1WithAuthError', () => {
    const r = runScript('todoist', 'get-issue.sh', ['1234'], { fixtureAuth: 'expired' });
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /auth/i);
  });

  test('local_GetIssue_NotFound_Exits1WithJsonStderr', () => {
    const r = runLocalScript('get-issue.sh', ['9999']);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('local_CloseIssue_AlreadyClosed_Exits1WithError', () => {
    const r = runLocalScript('close-issue.sh', ['1236']);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /already closed/);
  });

  for (const adapter of ['ado', 'github', 'todoist']) {
    test(`${adapter}_AssignIssue_NotFound_Exits1WithJsonStderr`, () => {
      const r = runScript(adapter, 'assign-issue.sh', ['1234'], { fixtureMode: 'not-found' });
      assert.equal(r.exitCode, 1);
      assert.match(r.stderr, /\{"error":/);
    });
  }

  test('local_AssignIssue_NotFound_Exits1WithJsonStderr', () => {
    const r = runLocalScript('assign-issue.sh', ['8888']);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('local_AddBlocker_MissingBlocker_Exits1WithJsonStderr', () => {
    const r = runLocalScript('add-blocker.sh', ['1234', '8888']);
    assert.equal(r.exitCode, 1);
    assert.match(r.stderr, /\{"error":/);
  });

  test('local_GetIssue_MissingDir_Exits1WithAuthError', () => {
    // Run with a non-existent issues dir to trigger check_auth_local failure
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-local-nodir-'));
    const adapterDir = path.join(tmp, 'local');
    fs.cpSync(path.join(ADAPTERS_DIR, 'local'), adapterDir, { recursive: true });
    fs.cpSync(path.join(ADAPTERS_DIR, 'lib'), path.join(tmp, 'lib'), { recursive: true });
    try {
      const env = {
        ...process.env,
        LOCAL_ISSUES_DIR: path.join(tmp, 'nonexistent'),
        RETRY_BACKOFF_1: '0',
        RETRY_BACKOFF_2: '0',
      };
      const result = spawnSync('bash', [path.join(adapterDir, 'get-issue.sh'), '1234'], {
        encoding: 'utf8', env, cwd: tmp, timeout: 15000,
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /not found/i);
    } finally { cleanup(tmp); }
  });
});

// ── Retry behaviour ──────────────────────────────────────────────────

describe('retry', () => {
  test('ado_GetIssue_TransientFailure_RetriesAndSucceeds', () => {
    const counter = path.join(os.tmpdir(), `retry-counter-${process.pid}-${Date.now()}`);
    try {
      const r = runScript('ado', 'get-issue.sh', ['1234'], {
        retryCounter: counter,
        retrySucceedAt: 2,
      });
      // retry.sh tries 3 times with backoff; succeeds on attempt 2.
      assert.equal(r.exitCode, 0, `expected success after retry, got ${r.exitCode}: ${r.stderr}`);
      // Sanity: stub recorded 2 invocations of the work-item call (the auth
      // calls run before the retry counter starts incrementing relative to the
      // adapter call, but at least 2 total attempts must have happened).
      const count = parseInt(fs.readFileSync(counter, 'utf8'), 10);
      assert.ok(count >= 2, `expected >=2 stub invocations, got ${count}`);
    } finally {
      try { fs.unlinkSync(counter); } catch { /* ignore */ }
    }
  });

  test('github_GetIssue_TransientFailure_RetriesAndSucceeds', () => {
    const counter = path.join(os.tmpdir(), `retry-counter-${process.pid}-${Date.now()}`);
    try {
      const r = runScript('github', 'get-issue.sh', ['1234'], {
        retryCounter: counter,
        retrySucceedAt: 2,
      });
      assert.equal(r.exitCode, 0, `expected success after retry: ${r.stderr}`);
      const count = parseInt(fs.readFileSync(counter, 'utf8'), 10);
      assert.ok(count >= 2);
    } finally {
      try { fs.unlinkSync(counter); } catch { /* ignore */ }
    }
  });

  test('todoist_GetIssue_TransientFailure_RetriesAndSucceeds', () => {
    const counter = path.join(os.tmpdir(), `retry-counter-${process.pid}-${Date.now()}`);
    try {
      const r = runScript('todoist', 'get-issue.sh', ['1234'], {
        retryCounter: counter,
        retrySucceedAt: 2,
      });
      assert.equal(r.exitCode, 0, `expected success after retry: ${r.stderr}`);
      const count = parseInt(fs.readFileSync(counter, 'utf8'), 10);
      assert.ok(count >= 2);
    } finally {
      try { fs.unlinkSync(counter); } catch { /* ignore */ }
    }
  });
});

// ── Contract presence (8 task scripts, D14) ─────────────────────────

describe('contract-presence', () => {
  for (const adapter of ['ado', 'github', 'todoist', 'local']) {
    test(`${adapter}_HasAllContractScripts`, () => {
      const required = [
        'get-issue.sh',
        'get-issue-children.sh',
        'get-sprint-issues.sh',
        'create-issue.sh',
        'add-label.sh',
        'remove-label.sh',
        'close-issue.sh',
        'list-issues.sh',
        // Wayfinding operations (contract v3.1)
        'assign-issue.sh',
        'comment-issue.sh',
        'add-blocker.sh',
        'get-blockers.sh',
        'create-sub-issue.sh',
      ];
      for (const f of required) {
        assert.ok(
          fs.existsSync(path.join(ADAPTERS_DIR, adapter, f)),
          `${adapter} missing ${f}`
        );
      }
    });

    test(`${adapter}_AllScriptsSourceSharedLibs`, () => {
      const dir = path.join(ADAPTERS_DIR, adapter);
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.sh')) continue;
        const txt = fs.readFileSync(path.join(dir, f), 'utf8');
        assert.match(txt, /source.*lib\/retry\.sh/, `${f} must source retry.sh`);
        assert.match(txt, /source.*lib\/auth-check\.sh/, `${f} must source auth-check.sh`);
      }
    });
  }
});
