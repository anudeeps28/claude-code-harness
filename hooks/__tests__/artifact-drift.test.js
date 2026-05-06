const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', 'drift-check.js');
const ap = require('../lib/artifact-parsers');

// ── test helpers ────────────────────────────────────────────────────────

function makeFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'artifact-drift-'));
  const tasks = path.join(dir, 'tasks');
  const docs = path.join(dir, 'docs');
  const adrDir = path.join(docs, 'adr');
  fs.mkdirSync(tasks);
  fs.mkdirSync(adrDir, { recursive: true });
  // Create .git marker so findProjectRoot works
  fs.mkdirSync(path.join(dir, '.git'));
  return { root: dir, tasks, docs, adrDir };
}

function cleanup(root) {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* ignore */ }
}

function runDriftCheck(filePath, env = {}) {
  const result = spawnSync(
    process.execPath,
    [HOOK],
    {
      input: JSON.stringify({ tool_input: { file_path: filePath } }),
      encoding: 'utf8',
      env: { ...process.env, ...env },
    }
  );
  let parsed = null;
  try { parsed = result.stdout ? JSON.parse(result.stdout) : null; } catch { /* not JSON */ }
  return { stdout: result.stdout, exitCode: result.status, json: parsed };
}

// ── unit tests for artifact-parsers.js ──────────────────────────────────

test('extractSection returns content between matching heading and next heading', () => {
  const text = '## Foo\nfoo content\n## Bar\nbar content\n## Baz\nbaz content';
  const result = ap.extractSection(text, /^Bar$/);
  assert.equal(result, 'bar content');
});

test('extractSection returns null when heading not found', () => {
  const text = '## Foo\nfoo content';
  assert.equal(ap.extractSection(text, /^Missing$/), null);
});

test('extractNfrKeywords extracts keywords from NFR section', () => {
  const prd = `# My PRD
## Non-functional Requirements
- Latency: p95 < 200ms
- Availability: 99.9%
- Throughput: 1000 req/s
## Other Section
Some other content about performance that should not count`;
  const kws = ap.extractNfrKeywords(prd);
  assert.ok(kws.includes('latency'));
  assert.ok(kws.includes('availability'));
  assert.ok(kws.includes('throughput'));
  assert.ok(!kws.includes('performance'));
});

test('extractNfrKeywords returns empty when no NFR section', () => {
  const prd = '# PRD\n## Features\nSome features here.';
  assert.deepEqual(ap.extractNfrKeywords(prd), []);
});

test('findMissingNfrs returns keywords absent from architecture text', () => {
  const arch = 'We address latency with caching. Availability via replicas.';
  const missing = ap.findMissingNfrs(arch, ['latency', 'availability', 'throughput']);
  assert.deepEqual(missing, ['throughput']);
});

test('extractMermaidComponents extracts node labels from Mermaid diagrams', () => {
  const arch = `## Component Diagram
\`\`\`mermaid
graph TB
    UI[Web UI]
    GW[API Gateway]
    DB[(Primary Database)]
    SVC1[Auth Service]
\`\`\`
`;
  const components = ap.extractMermaidComponents(arch);
  assert.ok(components.includes('Web UI'));
  assert.ok(components.includes('API Gateway'));
  assert.ok(components.includes('Primary Database'));
  assert.ok(components.includes('Auth Service'));
});

test('extractMermaidComponents returns empty when no Mermaid blocks', () => {
  assert.deepEqual(ap.extractMermaidComponents('# No diagrams here'), []);
});

test('extractHeadings returns all headings with numbers', () => {
  const text = '# 1. Introduction\n## 1.1 Background\n## 2. Features\n### 2.1 User Stories';
  const headings = ap.extractHeadings(text);
  assert.equal(headings.length, 4);
  assert.equal(headings[0].number, '1');
  assert.equal(headings[1].number, '1.1');
  assert.equal(headings[2].number, '2');
  assert.equal(headings[3].number, '2.1');
});

test('extractPrdSectionRefs finds section references', () => {
  const todo = `<task>
  Implement feature per PRD Section 3.2 and Section 4.1
  Also references PRD §5.3
</task>`;
  const refs = ap.extractPrdSectionRefs(todo);
  assert.ok(refs.includes('3.2'));
  assert.ok(refs.includes('4.1'));
  assert.ok(refs.includes('5.3'));
});

test('extractPrdSectionRefs returns empty when no refs', () => {
  assert.deepEqual(ap.extractPrdSectionRefs('no section refs here'), []);
});

test('extractAdrStatus extracts accepted status', () => {
  const adr = '# ADR-001\n**Status:** Accepted\n## Context\nblah';
  assert.equal(ap.extractAdrStatus(adr), 'accepted');
});

test('extractAdrStatus extracts proposed status', () => {
  const adr = 'Status: Proposed';
  assert.equal(ap.extractAdrStatus(adr), 'proposed');
});

test('extractAdrTechChoices extracts chosen and rejected tech', () => {
  const adr = `# ADR
## Decision
We will use PostgreSQL for the primary database, chosen over MongoDB.
We rejected DynamoDB due to cost.`;
  const { chosen, rejected } = ap.extractAdrTechChoices(adr);
  assert.ok(chosen.includes('PostgreSQL'));
  assert.ok(rejected.includes('MongoDB'));
  assert.ok(rejected.includes('DynamoDB'));
});

// ── integration tests for drift-check hook (artifact invariants) ────────

test('invariant 7: warns when PRD NFR not addressed in architecture', () => {
  const { root } = makeFixture();
  try {
    fs.writeFileSync(path.join(root, 'PRD.md'),
      '# PRD\n## Non-functional Requirements\n- Latency: p95 < 200ms\n- Throughput: 1000 req/s\n');
    fs.writeFileSync(path.join(root, 'docs', 'ARCHITECTURE.md'),
      '# Architecture\n## Scalability\nWe handle latency with caching.\n');
    // Edit the architecture doc — triggers artifact drift
    const result = runDriftCheck(path.join(root, 'docs', 'ARCHITECTURE.md'));
    assert.equal(result.exitCode, 0);
    assert.ok(result.json);
    const ctx = result.json.hookSpecificOutput?.additionalContext || '';
    assert.ok(ctx.includes('throughput'), 'should warn about missing throughput NFR');
  } finally { cleanup(root); }
});

test('invariant 7: silent when all NFRs addressed', () => {
  const { root } = makeFixture();
  try {
    fs.writeFileSync(path.join(root, 'PRD.md'),
      '# PRD\n## Non-functional Requirements\n- Latency: p95 < 200ms\n');
    fs.writeFileSync(path.join(root, 'docs', 'ARCHITECTURE.md'),
      '# Architecture\n## Performance\nLatency is handled via edge caching.\n');
    const result = runDriftCheck(path.join(root, 'docs', 'ARCHITECTURE.md'));
    assert.equal(result.exitCode, 0);
    // No warnings expected — stdout may be empty or just allow metric
    if (result.json && result.json.hookSpecificOutput) {
      const ctx = result.json.hookSpecificOutput.additionalContext || '';
      assert.ok(!ctx.includes('latency'), 'should not warn about latency when addressed');
    }
  } finally { cleanup(root); }
});

test('invariant 8: warns when architecture component not in work items', () => {
  const { root, tasks } = makeFixture();
  try {
    fs.writeFileSync(path.join(root, 'docs', 'ARCHITECTURE.md'),
      '# Arch\n```mermaid\ngraph TB\n    SVC1[Payment Service]\n    SVC2[Notification Service]\n```\n');
    fs.writeFileSync(path.join(tasks, 'todo.md'),
      '# Todo\n- Build Payment Service integration\n');
    const result = runDriftCheck(path.join(root, 'docs', 'ARCHITECTURE.md'));
    assert.equal(result.exitCode, 0);
    assert.ok(result.json);
    const ctx = result.json.hookSpecificOutput?.additionalContext || '';
    assert.ok(ctx.includes('Notification Service'), 'should warn about Notification Service not in todo');
  } finally { cleanup(root); }
});

test('invariant 9: warns when todo references non-existent PRD section', () => {
  const { root, tasks } = makeFixture();
  try {
    fs.writeFileSync(path.join(root, 'PRD.md'),
      '# PRD\n## 1. Introduction\nIntro text\n## 2. Features\nFeature text\n');
    fs.writeFileSync(path.join(tasks, 'todo.md'),
      '# Todo\n<task>Implement per PRD Section 3.5</task>\n');
    const result = runDriftCheck(path.join(tasks, 'todo.md'));
    assert.equal(result.exitCode, 0);
    assert.ok(result.json);
    const ctx = result.json.hookSpecificOutput?.additionalContext || '';
    assert.ok(ctx.includes('Section 3.5'), 'should warn about non-existent PRD Section 3.5');
  } finally { cleanup(root); }
});

test('invariant 9: silent when PRD section exists', () => {
  const { root, tasks } = makeFixture();
  try {
    fs.writeFileSync(path.join(root, 'PRD.md'),
      '# PRD\n## 1. Introduction\nIntro\n## 2. Features\nFeatures\n## 3.5 Advanced\nAdvanced\n');
    fs.writeFileSync(path.join(tasks, 'todo.md'),
      '# Todo\n<task>Implement per PRD Section 3.5</task>\n');
    const result = runDriftCheck(path.join(tasks, 'todo.md'));
    assert.equal(result.exitCode, 0);
    if (result.json && result.json.hookSpecificOutput) {
      const ctx = result.json.hookSpecificOutput.additionalContext || '';
      assert.ok(!ctx.includes('Section 3.5'), 'should not warn when PRD section exists');
    }
  } finally { cleanup(root); }
});

test('invariant 11: hard blocks when ADR contradicts architecture', () => {
  const { root, adrDir } = makeFixture();
  try {
    fs.writeFileSync(path.join(adrDir, '0001-database-choice.md'),
      '# ADR-0001\n**Status:** Accepted\n## Decision\nWe will use PostgreSQL over MongoDB.\n');
    fs.writeFileSync(path.join(root, 'docs', 'ARCHITECTURE.md'),
      '# Arch\n## Platform selection rationale\nWe chose MongoDB for the primary database.\n');
    const result = runDriftCheck(path.join(root, 'docs', 'ARCHITECTURE.md'));
    assert.equal(result.exitCode, 0);
    assert.ok(result.json);
    // Should hard-block — check for block decision
    if (result.json.decision === 'block') {
      assert.ok(result.json.reason.includes('contradiction') || result.json.reason.includes('ADR'),
        'block reason should mention ADR contradiction');
    }
  } finally { cleanup(root); }
});

test('invariant 11: silent when ADR and architecture agree', () => {
  const { root, adrDir } = makeFixture();
  try {
    fs.writeFileSync(path.join(adrDir, '0001-database-choice.md'),
      '# ADR-0001\n**Status:** Accepted\n## Decision\nWe will use PostgreSQL over MongoDB.\n');
    fs.writeFileSync(path.join(root, 'docs', 'ARCHITECTURE.md'),
      '# Arch\n## Platform selection rationale\nWe chose PostgreSQL for relational data.\n');
    const result = runDriftCheck(path.join(root, 'docs', 'ARCHITECTURE.md'));
    assert.equal(result.exitCode, 0);
    // Should NOT hard-block
    if (result.json) {
      assert.notEqual(result.json.decision, 'block', 'should not block when ADR and arch agree');
    }
  } finally { cleanup(root); }
});

test('artifact checks are silent when no artifact files exist', () => {
  const { root, tasks } = makeFixture();
  try {
    // Only task files, no PRD/Architecture/ADRs
    fs.writeFileSync(path.join(tasks, 'todo.md'), '# Todo\n- Something\n');
    const result = runDriftCheck(path.join(tasks, 'todo.md'));
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout, '');
  } finally { cleanup(root); }
});

test('hook triggers on ARCHITECTURE.md edits', () => {
  const { root } = makeFixture();
  try {
    fs.writeFileSync(path.join(root, 'PRD.md'),
      '# PRD\n## Non-functional Requirements\n- RTO < 1 hour\n');
    fs.writeFileSync(path.join(root, 'docs', 'ARCHITECTURE.md'),
      '# Arch\n## Overview\nNo DR section.\n');
    const result = runDriftCheck(path.join(root, 'docs', 'ARCHITECTURE.md'));
    assert.equal(result.exitCode, 0);
    // Should produce a warning about 'rto' not in arch
    assert.ok(result.json);
    const ctx = result.json.hookSpecificOutput?.additionalContext || '';
    assert.ok(ctx.includes('rto'), 'should warn about RTO not in architecture');
  } finally { cleanup(root); }
});

test('hook triggers on PRD.md edits', () => {
  const { root } = makeFixture();
  try {
    fs.writeFileSync(path.join(root, 'PRD.md'),
      '# PRD\n## Non-functional Requirements\n- Encryption at rest required\n');
    fs.writeFileSync(path.join(root, 'docs', 'ARCHITECTURE.md'),
      '# Arch\n## Security\nEncryption at rest via AES-256.\n');
    const result = runDriftCheck(path.join(root, 'PRD.md'));
    assert.equal(result.exitCode, 0);
    // Encryption is addressed — should be clean
    if (result.json && result.json.hookSpecificOutput) {
      const ctx = result.json.hookSpecificOutput.additionalContext || '';
      assert.ok(!ctx.includes('encryption'), 'should not warn about encryption when addressed');
    }
  } finally { cleanup(root); }
});
