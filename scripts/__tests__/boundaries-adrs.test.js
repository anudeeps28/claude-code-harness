'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { repoRoot, EXEMPT_SKILLS, withBlock, block, FM, agent, inFixture } = require('./helpers.js');
const { readInterface, moduleIds, checkAdrModules, checkAdrCitations, checkAcceptedAdrsCited } = require('../lib/boundaries.js');

test('/implement Never breaks cites the accepted ADRs (AC2, AC11, AC15)', () => {
  const text = fs.readFileSync(path.join(repoRoot, 'skills', 'implement', 'SKILL.md'), 'utf8');
  const { parts } = readInterface(text);
  assert.ok(parts.neverBreaks && parts.neverBreaks.length > 0, 'implement has a Never breaks part');
  for (const adr of ['ADR-0001', 'ADR-0004', 'ADR-0005', 'ADR-0006']) {
    assert.ok(parts.neverBreaks.includes(adr), `${adr} missing from Never breaks`);
  }
  assert.ok(!parts.neverBreaks.includes('ADR-0002') && !parts.neverBreaks.includes('ADR-0003'), 'superseded ADRs must not be cited');
  assert.ok(!/ADR-000[1456]/.test(parts.inputs + parts.outputs), 'the ids must be in Never breaks, not elsewhere');
});

const adr = (n, { status = 'accepted', modules = 'skillx' } = {}) =>
  `# ADR-${n} - t\n\n- **Status:** ${status}\n- **Date:** 2026-01-01\n- **Decided by:** x\n` +
  (modules === null ? '' : `- **Modules:** ${modules}\n`) + '\n## Context\n\nbody\n';
const TEMPLATE_OK = '# ADR-NNNN - t\n\n- **Status:** proposed\n- **Date:** d\n- **Decided by:** x\n- **Modules:** [module, module]\n';
const adrBase = (over = {}) => ({
  'skills/skillx/SKILL.md': withBlock({ 'Never breaks': 'one commit (ADR-0001)' }),
  'agents/agenty.md': agent('skillx'),
  'docs/adr/0001-a.md': adr('0001'),
  'templates/docs/adr/0000-template.md': TEMPLATE_OK,
  ...over,
});

test('moduleIds lists skill folders, agent names and the code modules (AC1)', () => {
  inFixture({ 'skills/skillx/SKILL.md': withBlock({}), 'agents/agenty.md': agent('skillx') }, (root) => {
    const ids = moduleIds(root);
    for (const id of ['skillx', 'agenty', 'hooks', 'scripts', 'install']) assert.ok(ids.includes(id), `${id} in ${ids.join(',')}`);
    assert.ok(!ids.includes('nosuchmodule'));
  });
});

test('every ADR has a Modules: line (AC1, AC5, AC6, L72, L206)', () => {
  const files = fs.readdirSync(path.join(repoRoot, 'docs', 'adr')).filter((f) => f.endsWith('.md') && f !== 'README.md');
  const numbered = files.filter((f) => /^\d{4}-.*\.md$/.test(f));
  assert.ok(numbered.length > 0, 'the ADRs are there to be checked');
  assert.deepEqual(files, numbered, 'every ADR file is named NNNN-*.md');
  for (const f of numbered) {
    const header = fs.readFileSync(path.join(repoRoot, 'docs', 'adr', f), 'utf8').split(/\r?\n## /)[0];
    assert.ok(/^- \*\*Modules:\*\*\s*\S/m.test(header), `${f} has a Modules line in its header`);
  }
  assert.deepEqual(checkAdrModules(repoRoot), []);
});

test('an ADR with an unknown module id is named with the id (AC3, L73)', () => {
  inFixture(adrBase({ 'docs/adr/0007-b.md': adr('0007', { modules: 'skillx, nosuchmodule' }) }), (root) => {
    const problems = checkAdrModules(root);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('0007') && problems[0].includes('nosuchmodule'), problems[0]);
  });
});

test('an ADR with no Modules: line in its header, or only one in its body, is named; a future ADR is checked too (AC2, AC5, AC6, L72, L206)', () => {
  const bodyOnly = adr('0008', { modules: null }) + '\nModules: skillx\n- **Modules:** skillx\n';
  inFixture(adrBase({ 'docs/adr/0007-b.md': adr('0007', { modules: null }), 'docs/adr/0008-c.md': bodyOnly }), (root) => {
    const problems = checkAdrModules(root);
    assert.ok(problems.some((p) => p.includes('0007')), problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('0008')), 'a Modules line below the header does not count: ' + problems.join('\n'));
    assert.equal(problems.length, 2, problems.join('\n'));
  });
});

test('the ADR template must carry a Modules: line, and its placeholder is accepted only there (AC6)', () => {
  const noLine = TEMPLATE_OK.replace(/- \*\*Modules:\*\*.*\n/, '');
  inFixture(adrBase({ 'templates/docs/adr/0000-template.md': noLine }), (root) => {
    const problems = checkAdrModules(root);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('0000-template'), problems[0]);
  });
  inFixture(adrBase({ 'docs/adr/0007-b.md': adr('0007', { modules: '[module, module]' }) }), (root) => {
    const problems = checkAdrModules(root);
    assert.ok(problems.some((p) => p.includes('0007')), 'the placeholder is not a real ADR value: ' + problems.join('\n'));
  });
  inFixture(adrBase(), (root) => assert.deepEqual(checkAdrModules(root), []));
});

test('check 7 — every ADR cited in an Interface block exists and is not superseded (AC4, AC7, L205)', () => {
  assert.deepEqual(checkAdrCitations(repoRoot, { exempt: EXEMPT_SKILLS }), []);
});

test('a block citing a superseded or a missing ADR is named with the module and the ADR (AC4, AC7, L205)', () => {
  inFixture(adrBase({
    'docs/adr/0002-b.md': adr('0002', { status: 'superseded by ADR-0001' }),
    'agents/agenty.md': FM.replace('x', 'agenty') + '\n' + block({ 'Never breaks': 'one thing (ADR-0002)' }) + '\nbody\n',
    'agents/agentz.md': FM.replace('x', 'agentz') + '\n' + block({ 'Never breaks': 'another (ADR-0099)' }) + '\nbody\n',
    'scripts/README.md': '# Scripts\n\nPurpose.\n\n' + block({ Outputs: 'cites one (ADR-0098) here' }),
  }), (root) => {
    const problems = checkAdrCitations(root, { exempt: [] });
    const has = (m, a, w) => problems.some((p) => p.includes(m) && p.includes(a) && p.includes(w));
    assert.ok(has('agents/agenty', 'ADR-0002', 'superseded'), problems.join('\n'));
    assert.ok(has('agents/agentz', 'ADR-0099', 'does not exist'), problems.join('\n'));
    assert.ok(has('scripts', 'ADR-0098', 'does not exist'), 'READMEs are scanned too: ' + problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('ADR-0001')), 'an accepted, existing ADR is fine: ' + problems.join('\n'));
    assert.equal(problems.length, 3, problems.join('\n'));
  });
});

test('every accepted ADR is cited by a Never breaks promise (AC1, L71)', () => {
  assert.deepEqual(checkAcceptedAdrsCited(repoRoot), []);
});

test('an accepted ADR cited nowhere, or only outside Never breaks, is named; a superseded one need not be cited (L71)', () => {
  inFixture(adrBase({
    'docs/adr/0002-b.md': adr('0002'),
    'docs/adr/0003-c.md': adr('0003'),
    'docs/adr/0004-d.md': adr('0004', { status: 'superseded by ADR-0001' }),
    'skills/skillx/SKILL.md': withBlock({ 'Never breaks': 'one commit (ADR-0001)', Inputs: 'a file (ADR-0003)' }),
  }), (root) => {
    const problems = checkAcceptedAdrsCited(root);
    assert.ok(problems.some((p) => p.includes('ADR-0002')), problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('ADR-0003')), 'a citation in Inputs does not count: ' + problems.join('\n'));
    assert.equal(problems.length, 2, problems.join('\n'));
  });
});

test('the ADR checks take the repo root and an exempt-only options object (AC4)', () => {
  for (const fn of [checkAdrModules, checkAdrCitations, checkAcceptedAdrsCited]) {
    assert.equal(fn.length, 1, `${fn.name} takes more than the repo root`);
  }
  inFixture(adrBase(), (root) => {
    for (const fn of [checkAdrModules, checkAdrCitations, checkAcceptedAdrsCited]) {
      assert.throws(() => fn(root, { skip: ['s'] }), /skip/, `${fn.name} accepted the option "skip"`);
    }
  });
});

// ---- Story #6j2mgmXcV4mmxHw2: ADR check hardening (review findings A-G) ----

const withNever = (text) => ({ 'skills/skillx/SKILL.md': withBlock({ 'Never breaks': text }) });
const agentWith = (name, over) => ({ [`agents/${name}.md`]: FM.replace('x', name) + '\n' + block(over) + '\nbody\n' });
const NO_EXEMPT = { exempt: [] };

test('a malformed ADR token in an Interface block is named with the module and the token (finding A)', () => {
  inFixture(adrBase({
    ...agentWith('agenta', { 'Never breaks': 'one (ADR 0001)' }),
    ...agentWith('agentb', { 'Never breaks': 'two (adr-0001)' }),
    ...agentWith('agentc', { 'Never breaks': 'three (ADR-1)' }),
    ...agentWith('agentd', { Outputs: 'four (ADR-00011)' }),
  }), (root) => {
    const problems = checkAdrCitations(root, NO_EXEMPT);
    const has = (m, t) => problems.some((p) => p.includes(m) && p.includes(`"${t}"`));
    assert.ok(has('agents/agenta', 'ADR 0001'), problems.join('\n'));
    assert.ok(has('agents/agentb', 'adr-0001'), problems.join('\n'));
    assert.ok(has('agents/agentc', 'ADR-1'), problems.join('\n'));
    assert.ok(has('agents/agentd', 'ADR-00011'), 'ADR-00011 is not read as 0001: ' + problems.join('\n'));
    assert.equal(problems.length, 4, problems.join('\n'));
  });
});

test('a malformed token does not satisfy an accepted ADR (finding A)', () => {
  inFixture(adrBase({ ...withNever('one commit (ADR 0001) and (ADR-00011)') }), (root) => {
    const problems = checkAcceptedAdrsCited(root);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('ADR-0001'), problems[0]);
  });
});

test('only an ADR id in a parenthetical of ADR ids is a citation; other mentions are not (finding B)', () => {
  inFixture(adrBase({
    'docs/adr/0002-b.md': adr('0002', { status: 'superseded by ADR-0001' }),
    'docs/adr/0003-c.md': adr('0003'),
    ...agentWith('agenta', { 'Never breaks': 'a promise (not ADR-0003)' }),
    ...agentWith('agentb', { 'Never breaks': 'a promise (replaces ADR-0002)' }),
    ...agentWith('agentc', { 'Never breaks': 'a promise, see ADR-0002' }),
  }), (root) => {
    assert.deepEqual(checkAdrCitations(root, NO_EXEMPT), []);
    const unmet = checkAcceptedAdrsCited(root);
    assert.ok(unmet.some((p) => p.includes('ADR-0003')), 'a mention does not satisfy the check: ' + unmet.join('\n'));
  });
});

test('a parenthetical of several ADR ids cites each of them (finding B)', () => {
  inFixture(adrBase({
    'docs/adr/0002-b.md': adr('0002', { status: 'superseded by ADR-0001' }),
    'docs/adr/0003-c.md': adr('0003'),
    ...withNever('one (ADR-0001, ADR-0003)'),
    ...agentWith('agenta', { 'Never breaks': 'old (ADR-0002)' }),
  }), (root) => {
    assert.deepEqual(checkAcceptedAdrsCited(root), []);
    const problems = checkAdrCitations(root, NO_EXEMPT);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('agents/agenta') && problems[0].includes('ADR-0002') && problems[0].includes('superseded'), problems[0]);
  });
});

test('ADR text inside a code fence is skipped (finding B)', () => {
  const fenced = 'one commit (ADR-0001)\n```\n(ADR-0099) and ADR 12\n```';
  inFixture(adrBase({ ...withNever(fenced) }), (root) => {
    assert.deepEqual(checkAdrCitations(root, NO_EXEMPT), []);
    assert.deepEqual(checkAcceptedAdrsCited(root), []);
  });
});

test('a missing Status, a duplicate number and a stray file in docs/adr are named (finding C)', () => {
  inFixture(adrBase({
    'docs/adr/0002-b.md': adr('0002').replace(/- \*\*Status:\*\*.*\n/, ''),
    'docs/adr/0003-c.md': adr('0003'),
    'docs/adr/0003-d.md': adr('0003'),
    'docs/adr/007-x.md': adr('0007'),
    'docs/adr/00008-y.md': adr('0008'),
    'docs/adr/notes.md': '# notes\n',
    'docs/adr/README.md': '# index\n',
  }), (root) => {
    const problems = checkAdrModules(root);
    const has = (...parts) => problems.some((p) => parts.every((x) => p.includes(x)));
    assert.ok(has('0002-b.md', 'Status'), problems.join('\n'));
    assert.ok(has('0003-d.md', '0003-c.md'), 'both files of a duplicate number are named: ' + problems.join('\n'));
    assert.ok(has('007-x.md'), problems.join('\n'));
    assert.ok(has('00008-y.md'), problems.join('\n'));
    assert.ok(has('notes.md'), problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('docs/adr/README.md')), 'README.md is allowed: ' + problems.join('\n'));
    assert.equal(problems.length, 5, problems.join('\n'));
  });
});

test('the Status is its first word: proposed, accepted or superseded in any case, else a problem (finding D)', () => {
  const ok = ['proposed', 'accepted (2026-10-06): built', 'Accepted (supersedes ADR-0002)', '**Superseded** by ADR-0005', 'SUPERSEDED by ADR-0005', 'proposed | accepted | superseded by ADR-XXXX'];
  for (const status of ok) {
    inFixture(adrBase({ 'docs/adr/0002-b.md': adr('0002', { status }) }), (root) => {
      assert.deepEqual(checkAdrModules(root), [], `status "${status}"`);
    });
  }
  for (const status of ['draft', 'acceptedish', 'rejected: no', '(accepted)']) {
    inFixture(adrBase({ 'docs/adr/0002-b.md': adr('0002', { status }) }), (root) => {
      const problems = checkAdrModules(root);
      assert.equal(problems.length, 1, `status "${status}": ${problems.join('\n')}`);
      assert.ok(problems[0].includes('0002-b.md') && problems[0].includes('Status'), problems[0]);
    });
  }
});

test('a decorated or lower-case superseded status still makes a citation a problem; "Accepted (supersedes ...)" does not (finding D)', () => {
  inFixture(adrBase({
    'docs/adr/0002-b.md': adr('0002', { status: '**Superseded** by ADR-0001' }),
    'docs/adr/0003-c.md': adr('0003', { status: 'Accepted (supersedes ADR-0002)', modules: 'skillx, agentb' }),
    ...agentWith('agenta', { 'Never breaks': 'old (ADR-0002)' }),
    ...agentWith('agentb', { 'Never breaks': 'new (ADR-0003)' }),
  }), (root) => {
    const problems = checkAdrCitations(root, NO_EXEMPT);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('agents/agenta') && problems[0].includes('superseded'), problems[0]);
    assert.deepEqual(checkAcceptedAdrsCited(root).filter((p) => p.includes('ADR-0003')), [], 'an accepted ADR is not read as superseded');
  });
});

test('the template Modules value must be the placeholder, read by the same parser as the ADRs (finding E)', () => {
  const swap = (v) => TEMPLATE_OK.replace('[module, module]', v);
  for (const v of ['skillx', 'implement, scripts']) {
    inFixture(adrBase({ 'templates/docs/adr/0000-template.md': swap(v) }), (root) => {
      const problems = checkAdrModules(root);
      assert.equal(problems.length, 1, `value "${v}": ${problems.join('\n')}`);
      assert.ok(problems[0].includes('0000-template') && problems[0].includes('placeholder'), problems[0]);
    });
  }
  const fencedOnly = '# ADR-NNNN - t\n\n- **Status:** proposed\n```\n- **Modules:** [module, module]\n```\n';
  inFixture(adrBase({ 'templates/docs/adr/0000-template.md': fencedOnly }), (root) => {
    const problems = checkAdrModules(root);
    assert.equal(problems.length, 1, problems.join('\n'));
    assert.ok(problems[0].includes('0000-template'), problems[0]);
  });
  const { 'templates/docs/adr/0000-template.md': _t, ...noTemplate } = adrBase();
  inFixture(noTemplate, (root) => {
    assert.ok(checkAdrModules(root).some((p) => p.includes('0000-template')));
  });
});

test('a Modules line naming no id is a problem; a Modules line inside a header code fence does not count (findings F, G)', () => {
  const fenced = adr('0003', { modules: null }).replace('- **Decided by:** x\n', '- **Decided by:** x\n```\n- **Modules:** skillx\n```\n');
  inFixture(adrBase({
    'docs/adr/0002-b.md': adr('0002', { modules: ',' }),
    'docs/adr/0003-c.md': fenced,
  }), (root) => {
    const problems = checkAdrModules(root);
    assert.ok(problems.some((p) => p.includes('0002-b.md') && /no module/i.test(p)), problems.join('\n'));
    assert.ok(problems.some((p) => p.includes('0003-c.md') && p.includes('no - **Modules:** line')), problems.join('\n'));
    assert.equal(problems.length, 2, problems.join('\n'));
  });
});

test('a module citing an ADR whose Modules line does not name it is reported with the module and the ADR (story-pr-agent / ADR-0005)', () => {
  inFixture(adrBase({
    'docs/adr/0002-b.md': adr('0002', { modules: 'skillx' }),
    ...agentWith('agentq', { 'Never breaks': 'one thing (ADR-0002)' }),
    ...agentWith('agentr', { 'Never breaks': 'a mention only, see ADR-0002 here' }),
  }), (root) => {
    const problems = checkAdrCitations(root, NO_EXEMPT);
    assert.ok(problems.some((p) => p.includes('agentq') && p.includes('ADR-0002') && p.includes('Modules')), problems.join('\n'));
    assert.ok(!problems.some((p) => p.includes('agentr')), 'a mention is not a citation: ' + problems.join('\n'));
    assert.equal(problems.length, 1, problems.join('\n'));
  });
  inFixture(adrBase({
    'docs/adr/0002-b.md': adr('0002', { modules: 'skillx, agentq' }),
    ...agentWith('agentq', { 'Never breaks': 'one thing (ADR-0002)' }),
  }), (root) => assert.deepEqual(checkAdrCitations(root, NO_EXEMPT), []));
});
