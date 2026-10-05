// Wayfinder end-to-end lifecycle test.
//
// Exercises the full /wayfinder flow described in skills/wayfinder/SKILL.md
// against the LOCAL tracker adapter with real files in a temp workspace —
// no mocks, no network. This is the executable spec for the wayfinding
// contract scripts (assign-issue, comment-issue, add-blocker, get-blockers,
// create-sub-issue) working together:
//
//   chart:  create map → create tickets → wire blocking (second pass)
//   work:   compute frontier → claim → resolve (comment + close) →
//           record decision on the map → frontier advances
//   finish: no open tickets → map closes
//
// The frontier is computed exactly as the skill prescribes: a map child that
// is open, unclaimed, and whose blockers are all closed.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ADAPTERS_DIR = path.join(REPO_ROOT, 'trackers');

const HAS_BASH = (() => {
  try {
    const r = spawnSync('bash', ['-c', 'echo ok'], { encoding: 'utf8' });
    return r.status === 0 && r.stdout.trim() === 'ok';
  } catch { return false; }
})();

// One persistent workspace for the whole lifecycle — state carries across steps.
function setupWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wayfinder-e2e-'));
  const adapterDir = path.join(root, 'local');
  fs.cpSync(path.join(ADAPTERS_DIR, 'local'), adapterDir, { recursive: true });
  fs.cpSync(path.join(ADAPTERS_DIR, 'lib'), path.join(root, 'lib'), { recursive: true });
  const issuesDir = path.join(root, 'tasks', 'issues');
  fs.mkdirSync(issuesDir, { recursive: true });
  return { root, adapterDir, issuesDir };
}

function makeRunner(ws) {
  return function run(script, args, { expectFail = false } = {}) {
    const env = {
      ...process.env,
      LOCAL_ISSUES_DIR: ws.issuesDir,
      TODO_OUTPUT: path.join(ws.root, 'tasks', 'todo.md'),
      RETRY_BACKOFF_1: '0',
      RETRY_BACKOFF_2: '0',
    };
    const r = spawnSync('bash', [path.join(ws.adapterDir, script), ...args], {
      // See conformance.test.js: `node --test` runs files concurrently and every call here spawns
      // bash. Under that contention process startup alone can exceed 15s on Windows, which made
      // this suite flaky in a way that looked like a real adapter failure. Only a genuine hang
      // should trip this.
      encoding: 'utf8', env, cwd: ws.root, timeout: 90000,
    });
    if (!expectFail) {
      assert.equal(r.status, 0, `${script} ${args.join(' ')} failed: ${r.stderr}`);
    }
    return r;
  };
}

// The frontier per SKILL.md: open ∧ unclaimed ∧ all blockers closed.
function computeFrontier(run, mapId) {
  const children = run('get-issue-children.sh', [String(mapId)]).stdout
    .split('\n')
    .map((line) => line.match(/^- \[( |x)\] #(\d+)/))
    .filter(Boolean)
    .map((m) => ({ id: Number(m[2]), open: m[1] === ' ' }));

  const openItems = JSON.parse(run('list-issues.sh', []).stdout);
  const openIds = new Set(openItems.map((i) => i.id));
  const claimedIds = new Set(openItems.filter((i) => i.assignees.length > 0).map((i) => i.id));

  return children
    .filter((c) => c.open && !claimedIds.has(c.id))
    .filter((c) => {
      const blockers = JSON.parse(run('get-blockers.sh', [String(c.id)]).stdout);
      return blockers.every((b) => !openIds.has(b));
    })
    .map((c) => c.id);
}

const t = HAS_BASH ? test : (name) => test(`${name} (skipped: bash not available)`, { skip: true }, () => {});

t('wayfinder_FullLifecycle_LocalTracker', () => {
  const ws = setupWorkspace();
  const run = makeRunner(ws);
  try {
    // ── Chart the map ────────────────────────────────────────────────
    const mapBody = '## Destination\nA billing spec ready to build from.\n\n## Notes\nConsult /grill-me for decisions.\n\n## Not yet specified\n- Tax handling (waits on provider choice)\n\n## Out of scope\n';
    const mapOut = run('create-issue.sh', ['Billing system — wayfinder map', mapBody, 'wayfinder:map']).stdout;
    const mapId = Number(mapOut.trim().split(/\s+/)[0]);
    assert.ok(mapId >= 1, `expected a map id, got: ${mapOut}`);

    const mk = (title, type) => {
      const out = run('create-sub-issue.sh', [String(mapId), title, '## Question\n' + title, `wayfinder:${type}`]).stdout;
      return JSON.parse(out).child;
    };
    const provider = mk('Pick a payment provider', 'research');
    const refunds = mk('Design the refund policy', 'grilling');
    const retries = mk('Choose a webhook retry strategy', 'grilling');

    // Wire blocking in a second pass: retry strategy waits on provider choice
    run('add-blocker.sh', [String(retries), String(provider)]);

    // ── Frontier: blocked ticket excluded, the rest takeable ─────────
    assert.deepEqual(computeFrontier(run, mapId).sort(), [provider, refunds].sort());

    // ── Work the map: claim, then resolve, one ticket ────────────────
    run('assign-issue.sh', [String(provider), 'session-a']);
    assert.deepEqual(computeFrontier(run, mapId), [refunds], 'claimed ticket must leave the frontier');

    run('comment-issue.sh', [String(provider), 'Decision: Stripe — best API docs, supports our currencies.']);
    run('close-issue.sh', [String(provider), 'resolved']);
    run('comment-issue.sh', [String(mapId), 'Decided: Pick a payment provider — Stripe.']);

    // Resolving the blocker releases the dependent ticket into the frontier
    assert.deepEqual(computeFrontier(run, mapId).sort(), [refunds, retries].sort());

    // Decision is recorded on the ticket AND gisted on the map
    const providerFile = fs.readFileSync(path.join(ws.issuesDir, `${provider}.md`), 'utf8');
    assert.match(providerFile, /state: closed/);
    assert.match(providerFile, /close_reason: resolved/);
    assert.match(providerFile, /Decision: Stripe/);
    const mapFile = fs.readFileSync(path.join(ws.issuesDir, `${mapId}.md`), 'utf8');
    assert.match(mapFile, /Decided: Pick a payment provider — Stripe\./);

    // ── Fog graduates into a fresh ticket once its blocker resolved ──
    const tax = mk('Decide tax handling per region', 'grilling');
    assert.ok(computeFrontier(run, mapId).includes(tax));

    // ── Finish: resolve the rest; empty frontier + no open children ──
    for (const id of [refunds, retries, tax]) {
      run('assign-issue.sh', [String(id), 'session-b']);
      run('comment-issue.sh', [String(id), `Decision recorded for ticket ${id}.`]);
      run('close-issue.sh', [String(id), 'resolved']);
    }
    assert.deepEqual(computeFrontier(run, mapId), []);
    assert.match(
      run('get-issue-children.sh', [String(mapId)]).stdout,
      /Progress: 4\/4 complete \(0 open\)/
    );

    run('close-issue.sh', [String(mapId), 'way is clear']);

    // ── Mirror hygiene: todo.md self-healed to "everything done" ─────
    // (render-todo.sh keeps a recently-closed section by design — the
    // signal is the open/closed tally, not absence of closed titles)
    const todo = fs.readFileSync(path.join(ws.root, 'tasks', 'todo.md'), 'utf8');
    assert.match(todo, /_0 open, 5 closed_/);
  } finally {
    try { fs.rmSync(ws.root, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

t('wayfinder_ConcurrentSessions_ClaimIsExclusive', () => {
  // Two sessions race for the same frontier: the claim (assignee) is what
  // the second session checks before starting work.
  const ws = setupWorkspace();
  const run = makeRunner(ws);
  try {
    const mapId = Number(run('create-issue.sh', ['Map', 'body', 'wayfinder:map']).stdout.trim().split(/\s+/)[0]);
    const ticket = JSON.parse(run('create-sub-issue.sh', [String(mapId), 'Only question', 'q', 'wayfinder:grilling']).stdout).child;

    run('assign-issue.sh', [String(ticket), 'session-a']);

    // Session B computes the frontier — the claimed ticket is not takeable
    assert.deepEqual(computeFrontier(run, mapId), []);

    // And the claim is visible in list-issues for anyone who asks
    const items = JSON.parse(run('list-issues.sh', []).stdout);
    const claimed = items.find((i) => i.id === ticket);
    assert.deepEqual(claimed.assignees, ['session-a']);
  } finally {
    try { fs.rmSync(ws.root, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});
