const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { lintRedWindow, MAX_PLAN_CHARS, __internals } = require('../lib/plan-lint');

test('clean three-step plan returns no violations', () => {
  const plan = `<tasks story="X">
  <task id="1" parallel_group="1" type="auto">
    <files>src/thing.js</files>
    <action>Create the shell.</action>
    <verify>node -e "require('./src/thing.js')"</verify>
    <done>Shell exists.</done>
  </task>
  <task id="2" parallel_group="2" type="test" must_fail="true">
    <name>Write the failing test</name>
    <files>tests/thing.test.js</files>
    <action>Write a failing test.</action>
    <verify>node --test tests/thing.test.js</verify>
    <done>Test fails for the right reason.</done>
  </task>
  <task id="3" parallel_group="3" type="auto">
    <read_first>tests/thing.test.js</read_first>
    <files>src/thing.js</files>
    <action>Implement the real behavior.</action>
    <verify>node --test tests/thing.test.js</verify>
    <done>Test passes.</done>
  </task>
</tasks>`;
  assert.deepEqual(lintRedWindow(plan), []);
});

test('must_fail task sharing its wave returns must_fail_not_alone naming the task id', () => {
  const plan = `<tasks story="X">
  <task id="1" parallel_group="1" type="auto">
    <files>src/thing.js</files>
    <action>Create the shell.</action>
    <verify>node -e "require('./src/thing.js')"</verify>
    <done>Shell exists.</done>
  </task>
  <task id="2" parallel_group="2" type="test" must_fail="true">
    <name>Write the failing test</name>
    <files>tests/thing.test.js</files>
    <action>Write a failing test.</action>
    <verify>node --test tests/thing.test.js</verify>
    <done>Test fails for the right reason.</done>
  </task>
  <task id="3" parallel_group="3" type="auto">
    <read_first>tests/thing.test.js</read_first>
    <files>src/thing.js</files>
    <action>Implement the real behavior.</action>
    <verify>node --test tests/thing.test.js</verify>
    <done>Test passes.</done>
  </task>
  <task id="4" parallel_group="2" type="auto">
    <files>src/other.js</files>
    <action>Do something unrelated.</action>
    <verify>node -e "require('./src/other.js')"</verify>
    <done>Other exists.</done>
  </task>
</tasks>`;
  const result = lintRedWindow(plan);
  assert.equal(result.length, 1);
  assert.equal(result[0].rule, 'must_fail_not_alone');
  assert.equal(result[0].taskId, '2');
  assert.equal(typeof result[0].message, 'string');
  assert.ok(result[0].message.length > 0);
});

test('must_fail task in the last wave returns no_implementation_next_wave', () => {
  const plan = `<tasks story="X">
  <task id="1" parallel_group="1" type="auto">
    <files>src/thing.js</files>
    <action>Create the shell.</action>
    <verify>node -e "require('./src/thing.js')"</verify>
    <done>Shell exists.</done>
  </task>
  <task id="2" parallel_group="2" type="test" must_fail="true">
    <name>Write the failing test</name>
    <files>tests/thing.test.js</files>
    <action>Write a failing test.</action>
    <verify>node --test tests/thing.test.js</verify>
    <done>Test fails for the right reason.</done>
  </task>
</tasks>`;
  const result = lintRedWindow(plan);
  assert.equal(result.length, 1);
  assert.equal(result[0].rule, 'no_implementation_next_wave');
  assert.equal(result[0].taskId, '2');
});

test('two must_fail tasks in consecutive waves return overlapping_red_windows', () => {
  const plan = `<tasks story="X">
  <task id="1" parallel_group="1" type="auto">
    <files>src/thing.js</files>
    <action>Create the shell.</action>
    <verify>node -e "require('./src/thing.js')"</verify>
    <done>Shell exists.</done>
  </task>
  <task id="2" parallel_group="2" type="test" must_fail="true">
    <name>Write the failing test A</name>
    <files>tests/a.test.js</files>
    <action>Write a failing test A.</action>
    <verify>node --test tests/a.test.js</verify>
    <done>Test A fails for the right reason.</done>
  </task>
  <task id="3" parallel_group="3" type="test" must_fail="true">
    <files>tests/b.test.js</files>
    <action>Write a failing test B.</action>
    <verify>node --test tests/b.test.js</verify>
    <done>Test B fails for the right reason.</done>
  </task>
  <task id="4" parallel_group="4" type="auto">
    <read_first>tests/b.test.js</read_first>
    <files>src/other.js</files>
    <action>Implement the real behavior for B.</action>
    <verify>node --test tests/b.test.js</verify>
    <done>Test B passes.</done>
  </task>
</tasks>`;
  const result = lintRedWindow(plan);
  assert.ok(
    result.some((v) => v.rule === 'overlapping_red_windows' && v.taskId === '3'),
    JSON.stringify(result)
  );
});

test('plan with no must_fail task returns no violations', () => {
  const plan = `<tasks story="X">
  <task id="1" parallel_group="1" type="auto">
    <name>Step one</name>
    <files>src/one.js</files>
    <action>Create step one.</action>
    <verify>node -e "require('./src/one.js')"</verify>
    <done>Step one exists.</done>
  </task>
  <task id="2" parallel_group="2" type="auto">
    <files>src/two.js</files>
    <action>Create step two.</action>
    <verify>node -e "require('./src/two.js')"</verify>
    <done>Step two exists.</done>
  </task>
  <task id="3" parallel_group="3" type="auto">
    <name>Step three</name>
    <read_first>src/two.js</read_first>
    <files>src/three.js</files>
    <action>Create step three.</action>
    <verify>node -e "require('./src/three.js')"</verify>
    <done>Step three exists.</done>
  </task>
</tasks>`;
  assert.deepEqual(lintRedWindow(plan), []);
});

test('absent, non-string and truncated input honestly parse to zero tasks', () => {
  assert.deepEqual(lintRedWindow(''), []);
  assert.deepEqual(lintRedWindow(null), []);
  assert.deepEqual(lintRedWindow(undefined), []);
  assert.deepEqual(lintRedWindow(42), []);
  assert.deepEqual(lintRedWindow('<tasks story="X"><task id="1" parallel_group="1" type="au'), []);
});

test('extra task crowding the wave that closes the red window returns no_implementation_next_wave', () => {
  const plan = `<tasks story="X">
  <task id="1" parallel_group="1" type="auto">
    <files>src/thing.js</files>
    <action>Create the shell.</action>
    <verify>node -e "require('./src/thing.js')"</verify>
    <done>Shell exists.</done>
  </task>
  <task id="2" parallel_group="2" type="test" must_fail="true">
    <files>tests/thing.test.js</files>
    <action>Write a failing test.</action>
    <verify>node --test tests/thing.test.js</verify>
    <done>Test fails for the right reason.</done>
  </task>
  <task id="3" parallel_group="3" type="auto">
    <read_first>tests/thing.test.js</read_first>
    <files>src/thing.js</files>
    <action>Implement the real behavior.</action>
    <verify>node --test tests/thing.test.js</verify>
    <done>Test passes.</done>
  </task>
  <task id="4" parallel_group="3" type="auto">
    <files>src/unrelated.js</files>
    <action>Unrelated work scheduled inside the red window.</action>
    <verify>npm test</verify>
    <done>Unrelated work done.</done>
  </task>
</tasks>`;
  const result = lintRedWindow(plan);
  assert.equal(result.length, 1, JSON.stringify(result));
  assert.equal(result[0].rule, 'no_implementation_next_wave');
  assert.equal(result[0].taskId, '2');
});

test('read_first must list the test file as an entry, not merely contain it as a substring', () => {
  const plan = `<tasks story="X">
  <task id="1" parallel_group="1" type="auto">
    <files>src/thing.js</files>
    <action>Create the shell.</action>
    <verify>node -e "require('./src/thing.js')"</verify>
    <done>Shell exists.</done>
  </task>
  <task id="2" parallel_group="2" type="test" must_fail="true">
    <files>a.js</files>
    <action>Write a failing test.</action>
    <verify>node --test a.js</verify>
    <done>Test fails for the right reason.</done>
  </task>
  <task id="3" parallel_group="3" type="auto">
    <read_first>docs/nota.js</read_first>
    <files>src/thing.js</files>
    <action>Implement the real behavior.</action>
    <verify>node --test a.js</verify>
    <done>Test passes.</done>
  </task>
</tasks>`;
  const result = lintRedWindow(plan);
  assert.equal(result.length, 1, JSON.stringify(result));
  assert.equal(result[0].rule, 'no_implementation_next_wave');
  assert.equal(result[0].taskId, '2');
});

test('lintRedWindow fails closed on oversized and on throwing input', () => {
  const huge = '<tasks>' + 'a'.repeat(MAX_PLAN_CHARS + 1);
  const t0 = Date.now();
  const result = lintRedWindow(huge);
  const elapsed = Date.now() - t0;
  assert.equal(result.length, 1, JSON.stringify(result));
  assert.equal(result[0].rule, 'input_too_large');
  assert.equal(result[0].taskId, null);
  assert.equal(typeof result[0].message, 'string');
  assert.ok(result[0].message.length > 0);
  assert.ok(elapsed < 250, `expected elapsed < 250ms, got ${elapsed}ms`);

  const hugeMb = 'a'.repeat(1024 * 1024);
  const t1 = Date.now();
  const resultMb = lintRedWindow(hugeMb);
  const elapsedMb = Date.now() - t1;
  assert.equal(resultMb.length, 1, JSON.stringify(resultMb));
  assert.equal(resultMb[0].rule, 'input_too_large');
  assert.equal(resultMb[0].taskId, null);
  assert.equal(typeof resultMb[0].message, 'string');
  assert.ok(resultMb[0].message.length > 0);
  assert.ok(elapsedMb < 250, `expected elapsed < 250ms, got ${elapsedMb}ms`);

  const original = __internals.parseTasks;
  try {
    __internals.parseTasks = () => {
      throw new Error('boom');
    };
    const throwResult = lintRedWindow('<tasks story="X"></tasks>');
    assert.equal(throwResult.length, 1, JSON.stringify(throwResult));
    assert.equal(throwResult[0].rule, 'lint_error');
    assert.equal(throwResult[0].taskId, null);
    assert.equal(typeof throwResult[0].message, 'string');
    assert.ok(throwResult[0].message.length > 0);
    assert.ok(throwResult[0].message.includes('boom'));
  } finally {
    __internals.parseTasks = original;
  }

  assert.deepEqual(lintRedWindow(''), []);
  assert.deepEqual(lintRedWindow(null), []);
  assert.deepEqual(lintRedWindow(undefined), []);
  assert.deepEqual(lintRedWindow(42), []);
});

test('plan-lint parses in bounded time and builds no RegExp at runtime', () => {
  const nasty = '<task ' + 'a'.repeat(200000);
  const t0 = Date.now();
  const result = lintRedWindow(nasty);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 250, `expected elapsed < 250ms, got ${elapsed}ms`);
  assert.deepEqual(result, []);

  const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'plan-lint.js'), 'utf8');
  assert.ok(!source.includes('new RegExp('), 'source must not build RegExp at runtime');
  assert.ok(source.includes('FILES_RE'), 'source must include a static FILES_RE regex');
  assert.ok(source.includes('READ_FIRST_RE'), 'source must include a static READ_FIRST_RE regex');
});

test('must_fail matching is not evaded by whitespace or quote style', () => {
  function buildPlan(task2Attr) {
    return `<tasks story="X">
  <task id="1" parallel_group="1" type="auto">
    <files>src/thing.js</files>
    <action>Create the shell.</action>
    <verify>node -e "require('./src/thing.js')"</verify>
    <done>Shell exists.</done>
  </task>
  <task id="2" parallel_group="2" type="test" ${task2Attr}>
    <name>Write the failing test</name>
    <files>tests/thing.test.js</files>
    <action>Write a failing test.</action>
    <verify>node --test tests/thing.test.js</verify>
    <done>Test fails for the right reason.</done>
  </task>
  <task id="3" parallel_group="3" type="auto">
    <read_first>tests/thing.test.js</read_first>
    <files>src/thing.js</files>
    <action>Implement the real behavior.</action>
    <verify>node --test tests/thing.test.js</verify>
    <done>Test passes.</done>
  </task>
  <task id="4" parallel_group="2" type="auto">
    <files>src/other.js</files>
    <action>Do something unrelated.</action>
    <verify>node -e "require('./src/other.js')"</verify>
    <done>Other exists.</done>
  </task>
</tasks>`;
  }

  const baselinePlan = buildPlan('must_fail="true"');
  const baselineResult = lintRedWindow(baselinePlan);
  assert.equal(baselineResult.length, 1, JSON.stringify(baselineResult));
  assert.equal(baselineResult[0].rule, 'must_fail_not_alone');
  assert.equal(baselineResult[0].taskId, '2');

  const variants = [
    { name: `must_fail='true'`, attr: `must_fail='true'` },
    { name: `must_fail ="true"`, attr: `must_fail ="true"` },
    { name: `must_fail= "true"`, attr: `must_fail= "true"` },
    { name: `must_fail="true "`, attr: `must_fail="true "` },
  ];

  for (const variant of variants) {
    const plan = buildPlan(variant.attr);
    const result = lintRedWindow(plan);
    const violation = result.find(
      (v) => v.rule === 'must_fail_not_alone' && v.taskId === '2'
    );
    assert.ok(
      violation,
      `variant ${variant.name} did not produce a must_fail_not_alone violation for task 2: ${JSON.stringify(result)}`
    );
  }

  const negativePlans = [
    buildPlan('must_fail="false"'),
    buildPlan('must_fail = "false"'),
  ];
  for (const plan of negativePlans) {
    const result = lintRedWindow(plan);
    const violation = result.find((v) => v.rule === 'must_fail_not_alone' && v.taskId === '2');
    assert.ok(
      !violation,
      `must_fail="false" variant incorrectly produced a must_fail_not_alone violation: ${JSON.stringify(result)}`
    );
  }
});
