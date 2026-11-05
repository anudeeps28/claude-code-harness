// Tests for skills/implement/bin/red-evidence.js (F72 #78 AC1): before a story's code is written, every
// criterion must have a test whose recorded red is a real one. The evidence lives in the story's
// executor-state.md under "## Red evidence", one line per test:
//   - <test> | AC<n>[, AC<m>] | <verbatim failure line> | shape: assertion|not-implemented|compile|not-run
// Real red (rules/test-philosophy.md): an assertion failure, or a NotImplementedException from the
// method under test (shape not-implemented). A compile break or a test that never ran is not red.
//
//   node red-evidence.js check --state <file> --criteria AC1,AC2

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'bin', 'red-evidence.js');

function state(evidenceLines, { before = '', after = '' } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'red-'));
  const file = path.join(dir, 'executor-state.md');
  fs.writeFileSync(file, [
    '# Executor state', '', 'run-mode: autonomous', before, '## Red evidence', '', ...evidenceLines, '', after, '',
  ].join('\n'));
  return file;
}

function check(file, criteria) {
  const r = spawnSync(process.execPath, [SCRIPT, 'check', '--state', file, '--criteria', criteria], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('Red_EveryCriterionHasAnAssertionFailure_Ok', () => {
  const file = state([
    '- Total_TwoLines_SumsThem | AC1 | AssertionError: expected 5 to equal 0 | shape: assertion',
    '- Total_Empty_IsZero | AC2, AC3 | AssertionError: expected undefined to equal 0 | shape: assertion',
  ]);
  const r = check(file, 'AC1,AC2,AC3');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^ok$/m);
});

test('Red_NotImplementedShape_CountsAsRealRed', () => {
  const file = state(['- Total_TwoLines_SumsThem | AC1 | NotImplementedException: Total | shape: not-implemented']);
  const r = check(file, 'AC1');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^ok$/m);
});

test('Red_CompileErrorShape_IsNotRed', () => {
  const file = state([
    '- Total_TwoLines_SumsThem | AC1 | error CS0103: The name Total does not exist | shape: compile',
    '- Total_Empty_IsZero | AC2 | AssertionError: expected 1 to equal 0 | shape: assertion',
  ]);
  const r = check(file, 'AC1,AC2');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^refused: AC1 .*compile/m);
  assert.doesNotMatch(r.out, /AC2/, 'companion: the criterion with a real red is not refused');
});

test('Red_TestThatNeverRan_IsNotRed', () => {
  const file = state(['- Total_TwoLines_SumsThem | AC1 | no tests found | shape: not-run']);
  const r = check(file, 'AC1');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^refused: AC1 .*not-run/m);
});

test('Red_CriterionWithNoTest_Fails', () => {
  const file = state(['- Total_TwoLines_SumsThem | AC1 | AssertionError: expected 5 to equal 0 | shape: assertion']);
  const r = check(file, 'AC1,AC2');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^refused: AC2 has no red test$/m);
  assert.doesNotMatch(r.out, /AC1/, 'companion: the covered criterion is not refused');
});

test('Red_OneRealRedAmongBadOnesForTheSameCriterion_Ok', () => {
  const file = state([
    '- Total_Compiles_Not | AC1 | error CS0103 | shape: compile',
    '- Total_TwoLines_SumsThem | AC1 | AssertionError: expected 5 to equal 0 | shape: assertion',
  ]);
  assert.equal(check(file, 'AC1').code, 0);
});

test('Red_FailureLineContainingAPipe_StillParses', () => {
  const file = state(['- Total_Pipe | AC1 | AssertionError: expected "a | b" to equal "a" | shape: assertion']);
  const r = check(file, 'AC1');
  assert.equal(r.code, 0, r.out);
});

test('Red_LineOutsideTheRedEvidenceSection_IsIgnored', () => {
  const file = state([], { after: '## Notes\n\n- Total_TwoLines_SumsThem | AC1 | AssertionError: x | shape: assertion' });
  const r = check(file, 'AC1');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^refused: AC1 has no red test$/m);
});

test('Red_NoStateFile_Fails', () => {
  const r = check(path.join(os.tmpdir(), 'red-missing-file', 'executor-state.md'), 'AC1');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^refused: no executor-state\.md/m);
});

test('Red_AssertionLabelOnACompileError_IsRefused', () => {
  for (const line of [
    'error TS2304: Cannot find name Total',
    'src/total.ts(3,5): error TS2304: Cannot find name Total',
    'error CS0103: The name Total does not exist',
    'SyntaxError: Unexpected token }',
    "Error: Cannot find module './total'",
    'ReferenceError: Total is not defined',
  ]) {
    const r = check(state([`- Total_Sums | AC1 | ${line} | shape: assertion`]), 'AC1');
    assert.equal(r.code, 1, `${line}: ${r.out}`);
    assert.match(r.out, /labelled assertion but reads as compile/, line);
  }
  const ni = check(state(['- Total_Sums | AC1 | error CS0103: x | shape: not-implemented']), 'AC1');
  assert.equal(ni.code, 1, ni.out);
  assert.match(ni.out, /labelled not-implemented but reads as compile/);
});

test('Red_AssertionLabelOnANoTestsRan_IsRefusedAsNotRun', () => {
  for (const line of ['no tests ran', '0 tests', 'Ran 0 tests in 0.0s']) {
    const r = check(state([`- Total_Sums | AC1 | ${line} | shape: assertion`]), 'AC1');
    assert.equal(r.code, 1, `${line}: ${r.out}`);
    assert.match(r.out, /labelled assertion but reads as not-run/, line);
  }
});

// The same words inside an assertion message are not a compile error or an empty run.
test('Red_AssertionLabelOnARealAssertion_StillOk', () => {
  for (const line of [
    'AssertionError: expected 10 tests to equal 0',
    'AssertionError: expected SyntaxError to be thrown',
    'AssertionError: expected ReferenceError: x to be reported',
    'AssertionError: expected 0 tests to be skipped',
    "AssertionError: expected resolver to say Cannot find module './x'",
  ]) {
    const r = check(state([`- Total_Sums | AC1 | ${line} | shape: assertion`]), 'AC1');
    assert.equal(r.code, 0, `${line}: ${r.out}`);
  }
});

test('Red_CriterionIdsMatchCaseInsensitively', () => {
  const file = state(['- Total_Sums | ac1 | AssertionError: expected 5 to equal 0 | shape: assertion']);
  assert.equal(check(file, 'AC1').code, 0, 'a lower-case id in the evidence still covers AC1');
  const file2 = state(['- Total_Sums | AC2 | AssertionError: expected 5 to equal 0 | shape: assertion']);
  assert.equal(check(file2, 'ac2').code, 0, 'a lower-case id in --criteria still matches');
});

// A criterion whose behaviour already exists cannot be seen red. It is recorded as shape already-met,
// and only when the failure field names the existing code as path:line.
test('Red_AlreadyMetNamingPathAndLine_Ok', () => {
  const file = state([
    '- Total_Empty_IsZero | AC1 | src/total.js:12 already returns 0 for no lines | shape: already-met',
    '- Total_TwoLines_SumsThem | AC2 | AssertionError: expected 5 to equal 0 | shape: assertion',
  ]);
  const r = check(file, 'AC1,AC2');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^ok$/m);
});

test('Red_AlreadyMetWithoutPathAndLine_IsRefused', () => {
  for (const line of ['it already works', 'see src/total.js', 'total.js line 12', 'line 12']) {
    const r = check(state([`- Total_Empty_IsZero | AC1 | ${line} | shape: already-met`]), 'AC1');
    assert.equal(r.code, 1, `${line}: ${r.out}`);
    assert.match(r.out, /^refused: AC1 .*already-met/m, line);
  }
});

test('Red_AlreadyMetOnOneCriterion_DoesNotCoverAnother', () => {
  const file = state(['- Total_Empty_IsZero | AC1 | src/total.js:12 | shape: already-met']);
  const r = check(file, 'AC1,AC2');
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^refused: AC2 has no red test$/m);
  assert.doesNotMatch(r.out, /AC1/, 'companion: the already-met criterion is not refused');
});

// With --root, an already-met row must name real product code: the path exists under the root and is
// not a test file.
function withRoot(files, fn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'red-root-'));
  for (const f of files) {
    fs.mkdirSync(path.dirname(path.join(root, f)), { recursive: true });
    fs.writeFileSync(path.join(root, f), 'module.exports = 1;\n');
  }
  try { return fn(root); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
function checkRoot(file, criteria, root) {
  const r = spawnSync(process.execPath, [SCRIPT, 'check', '--state', file, '--criteria', criteria, '--root', root], { encoding: 'utf8' });
  return { code: r.status, out: r.stdout + r.stderr };
}

test('Red_AlreadyMetExistingProductFileUnderRoot_Ok', () => {
  withRoot(['src/total.js'], (root) => {
    const file = state(['- Total_Empty_IsZero | AC1 | src/total.js:12 already returns 0 | shape: already-met']);
    const r = checkRoot(file, 'AC1', root);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^ok$/m);
  });
});

test('Red_AlreadyMetMissingPathUnderRoot_IsRefused', () => {
  withRoot(['src/other.js'], (root) => {
    const file = state(['- Total_Empty_IsZero | AC1 | src/total.js:12 already returns 0 | shape: already-met']);
    const r = checkRoot(file, 'AC1', root);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /^refused: AC1 .*already-met.*does not exist/m);
  });
});

test('Red_AlreadyMetNamingATestFile_IsRefused', () => {
  const paths = ['src/__tests__/total.js', 'test/total.js', 'tests/total.js', 'src/total.test.js', 'src/total.spec.ts'];
  withRoot(paths, (root) => {
    for (const p of paths) {
      const file = state([`- Total_Empty_IsZero | AC1 | ${p}:3 | shape: already-met`]);
      const r = checkRoot(file, 'AC1', root);
      assert.equal(r.code, 1, `${p}: ${r.out}`);
      assert.match(r.out, /^refused: AC1 .*already-met.*test file/m, p);
    }
  });
});

test('Red_AlreadyMetNamingATestFileInOtherStacks_IsRefused', () => {
  const paths = ['spec/total_spec.rb', 'src/Shop.Tests/TotalCase.cs', 'src/TotalTests.cs', 'pkg/total_test.go', 'app/test_total.py'];
  withRoot([...paths, 'src/Testing/total.go'], (root) => {
    for (const p of paths) {
      const file = state([`- Total_Empty_IsZero | AC1 | ${p}:3 | shape: already-met`]);
      const r = checkRoot(file, 'AC1', root);
      assert.equal(r.code, 1, `${p}: ${r.out}`);
      assert.match(r.out, /^refused: AC1 .*already-met.*test file/m, p);
    }
    // Planted opposite: product code whose name only contains "test" is not a test file.
    const ok = state(['- Total_Empty_IsZero | AC1 | src/Testing/total.go:3 | shape: already-met']);
    assert.equal(checkRoot(ok, 'AC1', root).code, 0, 'src/Testing/total.go is product code');
  });
});

test('Red_AlreadyMetWithoutRoot_KeepsTheOldBehaviour', () => {
  const file = state(['- Total_Empty_IsZero | AC1 | src/missing.js:12 | shape: already-met']);
  assert.equal(check(file, 'AC1').code, 0, 'no --root: only the path:line shape is checked');
});

test('Red_AlreadyMetRefusedRow_DoesNotBlockARealRedForTheSameCriterion', () => {
  withRoot(['src/total.js'], (root) => {
    const file = state([
      '- Total_A | AC1 | src/total.test.js:3 | shape: already-met',
      '- Total_B | AC1 | AssertionError: expected 5 to equal 0 | shape: assertion',
    ]);
    assert.equal(checkRoot(file, 'AC1', root).code, 0);
  });
});

test('Red_AlreadyMetPathThroughALinkLeadingOutsideTheRoot_IsRefused', () => {
  // S4: a folder link inside the root that points outside it must not let a row name code outside the root.
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'red-outside-'));
  fs.writeFileSync(path.join(outside, 'real.js'), 'module.exports = 1;\n');
  withRoot(['src/total.js'], (root) => {
    try {
      fs.symlinkSync(outside, path.join(root, 'src', 'link'), 'junction');
    } catch (e) {
      // Stated reason for the skip: this machine does not let a test create a folder link (no permission).
      process.stderr.write(`skipped: cannot create a link here: ${e.message}\n`);
      return;
    }
    const file = state(['- Total_Empty_IsZero | AC1 | src/link/real.js:3 | shape: already-met']);
    const r = checkRoot(file, 'AC1', root);
    assert.equal(r.code, 1, r.out);
    assert.match(r.out, /^refused: AC1 .*already-met.*does not exist under the root/m);
    // Companion: a real file inside the root is still accepted.
    const ok = state(['- Total_Empty_IsZero | AC1 | src/total.js:3 | shape: already-met']);
    assert.equal(checkRoot(ok, 'AC1', root).code, 0);
  });
  fs.rmSync(outside, { recursive: true, force: true });
});

test('Red_EmptyCriteriaList_IsAUsageError', () => {
  const file = state(['- Total_Sums | AC1 | AssertionError: x | shape: assertion']);
  for (const list of ['', ' , ,']) {
    const r = check(file, list);
    assert.equal(r.code, 2, `"${list}": ${r.out}`);
  }
});
