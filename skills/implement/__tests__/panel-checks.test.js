// Tests for the Feature panel's mechanical checks (F6), each run against a real git repo with a main
// branch and a Feature branch: migration-check.js (#55), loosened-scan.js (#58), claims-check.js (#56).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const BIN = path.join(__dirname, '..', 'bin');

function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function write(dir, files) {
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
}

// main holds `onMain`; the Feature branch adds `onBranch` on top.
function repo(onMain, onBranch) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-'));
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'core.autocrlf', 'false');
  write(dir, { 'README.md': 'shop\n', ...onMain });
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'main');
  git(dir, 'checkout', '-q', '-b', 'feature/1-x');
  write(dir, onBranch);
  git(dir, 'add', '.');
  git(dir, 'commit', '-q', '-m', 'feature');
  return dir;
}

function run(script, dir) {
  const r = spawnSync(process.execPath, [path.join(BIN, script), '--base', 'main', '--path', dir], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

// ── migration-check.js (#55) ─────────────────────────────────────────

test('Migration_NewFileSortsBeforeTheLastApplied_ReportedNamingBoth', () => {
  const dir = repo(
    { 'db/migrations/20240101000000_init.sql': 'x', 'db/migrations/20240301000000_orders.sql': 'x' },
    { 'db/migrations/20240201000000_seed_status.sql': 'x' },
  );
  const r = run('migration-check.js', dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^misordered: db\/migrations\/20240201000000_seed_status\.sql sorts before db\/migrations\/20240301000000_orders\.sql, already on main/m);
});

test('Migration_NewFileSortsLast_Ok', () => {
  const dir = repo({ 'db/migrations/20240101000000_init.sql': 'x' }, { 'db/migrations/20240401000000_more.sql': 'x' });
  const r = run('migration-check.js', dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^ok: db\/migrations: 1 new after 20240101000000_init\.sql$/m);
});

test('Migration_FlywayVersionsCompareAsNumbers_V10AfterV9', () => {
  const dir = repo({ 'src/main/resources/db/migration/V9__a.sql': 'x' }, { 'src/main/resources/db/migration/V10__b.sql': 'x' });
  assert.equal(run('migration-check.js', dir).code, 0, 'V10 sorts after V9, not before it');
});

test('Migration_OneFolderPerMigration_PrismaStyle_ComparesTheFolders', () => {
  const dir = repo(
    { 'prisma/migrations/20240301_orders/migration.sql': 'x' },
    { 'prisma/migrations/20240201_status/migration.sql': 'x' },
  );
  const r = run('migration-check.js', dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /misordered: prisma\/migrations\/20240201_status sorts before prisma\/migrations\/20240301_orders/);
});

test('Migration_NamesWithNoOrder_AlembicIds_ReportedUnchecked', () => {
  const dir = repo({ 'alembic/versions/ab12cd_init.py': 'x', 'alembic/versions/9f0e1d_orders.py': 'x' }, { 'alembic/versions/c3d4e5_status.py': 'x' });
  const r = run('migration-check.js', dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^unchecked: alembic\/versions: /m);
});

test('Migration_NoMigrationsOnTheBranch_PrintsNothing', () => {
  const dir = repo({ 'db/migrations/20240101_init.sql': 'x' }, { 'src/app.js': 'x' });
  const r = run('migration-check.js', dir);
  assert.equal(r.code, 0);
  assert.equal(r.out, '');
});

// ── loosened-scan.js (#58) ───────────────────────────────────────────

test('Loosened_TestSkipWithNoReason_IsAFinding', () => {
  const dir = repo({ 'test/orders.test.js': "test('a', () => {});\n" }, { 'test/orders.test.js': "test('a', () => {});\ntest.skip('totals add up', () => {});\n" });
  const r = run('loosened-scan.js', dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^loosened: test\/orders\.test\.js:2 {2}test skipped {2}reason: none$/m);
});

test('Loosened_SkipWithAReasonAbove_IsListedNotAFinding', () => {
  const dir = repo({}, { 'test/orders.test.js': '// flaky against the sandbox clock; owner: payments team; re-check in #88\ntest.skip(\'totals\', () => {});\n' });
  const r = run('loosened-scan.js', dir);
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /test skipped {2}reason: "flaky against the sandbox clock/);
});

test('Loosened_LintSwitchedOffAndCoverageLowered_BothListed', () => {
  const dir = repo(
    { 'jest.config.js': 'module.exports = { coverageThreshold: { global: { lines: 90 } } };\n' },
    { 'jest.config.js': 'module.exports = { coverageThreshold: { global: { lines: 60 } } };\n', 'src/a.js': '// eslint-disable-next-line\nconst a = 1;\n' },
  );
  const r = run('loosened-scan.js', dir);
  assert.match(r.out, /jest\.config\.js:1 {2}baseline changed/);
  assert.match(r.out, /src\/a\.js:1 {2}check switched off {2}reason: none/);
});

test('Loosened_NewScheduleAndCloudResource_ListedAsOps', () => {
  const dir = repo({}, {
    '.github/workflows/nightly.yml': 'on:\n  schedule:\n    - cron: "0 3 * * *"\n',
    'infra/main.tf': 'resource "aws_s3_bucket" "exports" {\n  bucket = "exports"\n}\n',
  });
  const r = run('loosened-scan.js', dir);
  assert.match(r.out, /^ops: \.github\/workflows\/nightly\.yml:\d+ {2}new schedule/m);
  assert.match(r.out, /^ops: infra\/main\.tf:1 {2}new cloud resource/m);
  assert.match(r.out, /^ops: \.github\/workflows\/nightly\.yml:1 {2}new pipeline {2}\(file added\)$/m);
  assert.equal(r.code, 0, 'ops lines are information for the PR, not findings');
});

// ── claims-check.js (#56) ────────────────────────────────────────────

test('Claims_CommentNamesATestThatDoesNotExist_Reported', () => {
  const dir = repo({ 'test/orders.test.js': "test('Orders_Total_AddsLines', () => {});\n" }, {
    'src/orders.js': '// Rounding is checked by `Orders_Total_RoundsToCents`\nmodule.exports = {};\n',
  });
  const r = run('claims-check.js', dir);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^claim: src\/orders\.js:1 {2}"checked by Orders_Total_RoundsToCents": Orders_Total_RoundsToCents is not in the repo$/m);
});

test('Claims_NamedTestExists_NotReported', () => {
  const dir = repo({ 'test/orders.test.js': "test('Orders_Total_AddsLines', () => {});\n" }, {
    'src/orders.js': '// covered by `Orders_Total_AddsLines`\n',
  });
  const r = run('claims-check.js', dir);
  assert.equal(r.code, 0, r.out);
});

test('Claims_DocPointsAtAMissingFile_Reported', () => {
  const dir = repo({}, { 'docs/orders.md': 'The format matches `schemas/order.schema.json`.\n' });
  const r = run('claims-check.js', dir);
  assert.match(r.out, /claim: docs\/orders\.md:1 {2}"matches schemas\/order\.schema\.json"/);
});

test('Claims_PlainProse_NotAClaim', () => {
  const dir = repo({}, { 'docs/orders.md': 'The total matches what the customer expects. See below.\n' });
  const r = run('claims-check.js', dir);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.out, '');
});
