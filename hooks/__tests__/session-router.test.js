const test = require('node:test');
const assert = require('node:assert');

const { renderGuidance, detectFirstOpenIssue } = require('../lib/project-state.js');

// 1. Greenfield state suggests /grill-me and does NOT suggest /implement
test('renderGuidance_GreenfieldState_SuggestsGrillMe', () => {
  const msg = renderGuidance('greenfield', { artifacts: [], openIssues: 0, ghAvailable: true }, null);
  assert.ok(msg.includes('/grill-me'), 'expected /grill-me in message');
  assert.ok(!msg.includes('/implement'), 'expected /implement NOT in message');
});

// 2. Active state with first issue shows issue number, title, and /implement
test('renderGuidance_ActiveWithFirstIssue_ShowsIssueNumberTitleAndImplement', () => {
  const msg = renderGuidance('active', { artifacts: [], openIssues: 1, ghAvailable: true }, { number: 18, title: 'Show contextual guidance' });
  assert.ok(msg.includes('#18'), 'expected #18 in message');
  assert.ok(msg.includes('Show contextual guidance'), 'expected title in message');
  assert.ok(msg.includes('/implement'), 'expected /implement in message');
});

// 3. Active state with artifact and no issue suggests /plan and lists artifact
test('renderGuidance_ActiveArtifactNoIssue_SuggestsPlanAndListsArtifact', () => {
  const msg = renderGuidance('active', { artifacts: ['grill-summary.md'], openIssues: null, ghAvailable: false }, null);
  assert.ok(msg.includes('/plan'), 'expected /plan in message');
  assert.ok(msg.includes('grill-summary.md'), 'expected artifact name in message');
});

// 3b. Active state renders without throwing when signals.artifacts is missing (defensive guard)
test('renderGuidance_ActiveSignalsMissingArtifacts_DoesNotThrow', () => {
  let msg;
  assert.doesNotThrow(() => {
    msg = renderGuidance('active', { openIssues: null, ghAvailable: false }, null);
  }, 'renderGuidance must not throw when signals.artifacts is undefined');
  assert.ok(msg.includes('/plan'), 'expected /plan in fallback message');
});

// 4. Greenfield message is under five lines
test('renderGuidance_GreenfieldMessage_IsUnderFiveLines', () => {
  const msg = renderGuidance('greenfield', { artifacts: [], openIssues: 0, ghAvailable: true }, null);
  const lineCount = msg.split('\n').length;
  assert.ok(lineCount < 5, `expected < 5 lines, got ${lineCount}`);
});

// 5. Active message variants are each under five lines
test('renderGuidance_ActiveMessage_IsUnderFiveLines', () => {
  const withIssue = renderGuidance('active', { artifacts: [], openIssues: 1, ghAvailable: true }, { number: 18, title: 'Show contextual guidance' });
  const withIssueLines = withIssue.split('\n').length;
  assert.ok(withIssueLines < 5, `active-with-issue: expected < 5 lines, got ${withIssueLines}`);

  const artifactOnly = renderGuidance('active', { artifacts: ['grill-summary.md'], openIssues: null, ghAvailable: false }, null);
  const artifactOnlyLines = artifactOnly.split('\n').length;
  assert.ok(artifactOnlyLines < 5, `active-artifact-only: expected < 5 lines, got ${artifactOnlyLines}`);
});

// 6. detectFirstOpenIssue returns number and title when runner returns a valid issue array
test('detectFirstOpenIssue_RunnerReturnsIssue_ReturnsNumberAndTitle', () => {
  const result = detectFirstOpenIssue({ firstIssueRunner: () => JSON.stringify([{ number: 7, title: 'Foo' }]) });
  assert.deepEqual(result, { number: 7, title: 'Foo' });
});

// 7. detectFirstOpenIssue fails open and returns null when runner throws
test('detectFirstOpenIssue_RunnerThrows_FailsOpenReturnsNull', () => {
  let result;
  assert.doesNotThrow(() => {
    result = detectFirstOpenIssue({ firstIssueRunner: () => { throw new Error('gh not found'); } });
  });
  assert.equal(result, null);
});

// 8. detectFirstOpenIssue returns null when runner returns empty array
test('detectFirstOpenIssue_RunnerReturnsEmptyArray_ReturnsNull', () => {
  const result = detectFirstOpenIssue({ firstIssueRunner: () => '[]' });
  assert.equal(result, null);
});

// 9. detectFirstOpenIssue returns null when runner returns non-JSON
test('detectFirstOpenIssue_RunnerReturnsNonJson_FailsOpenReturnsNull', () => {
  let result;
  assert.doesNotThrow(() => {
    result = detectFirstOpenIssue({ firstIssueRunner: () => 'garbage{{{' });
  });
  assert.equal(result, null);
});
