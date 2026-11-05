// Doc-consistency probe for the Feature #73 panel fixes (A1, A3, A5, A7, and the written-reason lines).
// Each check is a whole-claim function, run first on planted text that says the opposite (it must be
// rejected), then on the real file. A text probe cannot prove the prose is followed; it pins what the
// documents say so that the next edit cannot quietly undo it.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (...p) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8').replace(/\r\n/g, '\n');
const flat = (t) => t.replace(/\*\*/g, '').replace(/\s+/g, ' ');

function slice(content, prefix) {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.startsWith(prefix));
  if (start === -1) return null;
  const level = prefix.match(/^#+/)[0].length;
  let inFence = false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('```')) inFence = !inFence;
    else if (!inFence) {
      const m = lines[i].match(/^(#+) /);
      if (m && m[1].length <= level) { end = i; break; }
    }
  }
  return lines.slice(start, end).join('\n');
}

const SKILL = read('skills', 'implement', 'SKILL.md');
const LOCAL_TEST = read('skills', 'local-test', 'SKILL.md');
const PLANNER = read('agents', 'implement-planner-agent.md');
const ADR = (prefix) => read('docs', 'adr', fs.readdirSync(path.join(REPO_ROOT, 'docs', 'adr')).find((f) => f.startsWith(prefix)));

// Every markdown file that is a live instruction: agents, skills, rules.
function liveInstructions() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p); } else if (e.name.endsWith('.md')) out.push(p);
    }
  };
  for (const d of ['agents', 'skills', 'rules']) walk(path.join(REPO_ROOT, d));
  return out;
}

// ── A1: one home for a story's Goal ──────────────────────────────────

test('Goal_HasOneHome_BriefForAStory_TestStrategyForAFeature', () => {
  const readsGoal = (t) => {
    const f = flat(t);
    return /For a story id[^.]*`tasks\/stories\/<id>\/brief\.md`[^.]*Goal/i.test(f)
      && /Feature id[^.]*`tasks\/features\/<fid>\/test-strategy\.md`/i.test(f);
  };
  assert.ok(!readsGoal('For a story id read `tasks/stories/<id>/test-strategy.md` and its Goal.'), 'planted opposite is rejected');
  const e2e = slice(LOCAL_TEST, '### e2e');
  assert.ok(e2e, 'local-test has an e2e section');
  assert.ok(readsGoal(e2e), '/local-test e2e reads a story\'s Goal from brief.md and a Feature\'s from its test-strategy.md');

  // The planner does not write a Goal block into the plan, and says where the Goal lives.
  // Any line that opens with **Goal:** is a Goal block in the plan, filled or empty.
  const hasGoalBlock = (t) => /^\s*\*\*Goal:\*\*/m.test(t);
  assert.ok(hasGoalBlock('**Goal:** e2e through the API, gate: curl returns 200'), 'planted filled Goal line is caught');
  assert.ok(hasGoalBlock('**Goal:**\n'), 'planted empty Goal line is caught');
  assert.ok(!hasGoalBlock('Do not write a `**Goal:**` block.'), 'companion: a mention is not a block');
  assert.ok(!hasGoalBlock(PLANNER), 'the planner writes no **Goal:** block');
  assert.match(flat(PLANNER), /`tasks\/stories\/<id>\/brief\.md`[^.]*under "Goal"[^.]*`tasks\/features\/<fid>\/test-strategy\.md`/);
  // The reviewers read it from there.
  for (const a of ['acceptance-test-agent', 'evaluator-agent']) {
    const t = flat(read('agents', `${a}.md`));
    assert.match(t, /`tasks\/stories\/<id>\/brief\.md`[^.]*Goal|brief\.md[^.]*"Goal"/, `${a} reads the Goal from brief.md`);
    assert.match(t, /`<state folder>\/features\/<fid>\/test-strategy\.md`/, `${a} reads a Feature's Goal from its test-strategy.md`);
  }
  // SKILL's standalone acceptance brief passes the brief.md path.
  const agent2 = SKILL.slice(SKILL.indexOf('**Agent 2 — Acceptance Tester:**'), SKILL.indexOf('**Agent 3 — Architect Reviewer:**'));
  assert.ok(agent2.length > 100, 'companion: the acceptance brief was found');
  assert.match(agent2, /Goal: YOUR_PROJECT_ROOT\/tasks\/stories\/<id>\/brief\.md/, 'the acceptance brief passes the brief.md path');
  // No live instruction names a per-story test-strategy.md as a place to read or write.
  const live = liveInstructions();
  assert.ok(live.length > 30, 'companion: the scan found the live instructions');
  const naming = live.filter((f) => /tasks\/stories\/<(?:id|sid)>\/test-strategy\.md/.test(fs.readFileSync(f, 'utf8')));
  assert.deepEqual(naming.map((f) => path.relative(REPO_ROOT, f)), [], 'no live instruction names tasks/stories/<id>/test-strategy.md');
});

// ── Round 2, item 2: a Feature's Goal has a writer (the planner) ─────

test('Goal_FeatureGoalIsWrittenByThePlanner_IntoTestStrategy_AndTheBriefTemplateHasTheHeading', () => {
  const writesGoal = (t) => /\bwrites? a `## Goal` section in `tasks\/features\/<fid>\/test-strategy\.md`/.test(flat(t));
  const planted = 'The planner reads the Goal from `tasks/features/<fid>/test-strategy.md` and writes no `## Goal` section.';
  assert.ok(!writesGoal(planted), 'planted text that gives the Goal no writer is rejected');
  assert.ok(writesGoal('The planner writes a `## Goal` section in `tasks/features/<fid>/test-strategy.md`.'), 'companion: the check can pass');

  const step4 = SKILL.slice(SKILL.indexOf('4. **Plan the whole Feature, once.**'), SKILL.indexOf('5. **Check the plan, before the gate.**'));
  assert.ok(step4.length > 200, 'companion: SKILL Feature step 4 was found');
  assert.ok(writesGoal(step4), 'SKILL step 4 says the planner writes the Goal section');
  assert.match(flat(step4), /modality[^.]*concrete gate[^.]*seen/i, 'step 4 names what the Goal holds');

  const goalSection = slice(PLANNER, '### Goal and proofs');
  assert.ok(goalSection, 'the planner has a Goal and proofs section');
  assert.ok(writesGoal(goalSection), 'the planner\'s Goal and proofs section says it writes the Goal for a Feature');
  assert.doesNotMatch(flat(goalSection), /Read it from there/, 'the planner no longer reads a Feature Goal that nobody wrote');
  const bullet = flat(PLANNER).match(/- `tasks\/features\/<fid>\/test-strategy\.md` [^]*?numbered `F\.<n>`/);
  assert.ok(bullet, 'companion: the planner bullet on test-strategy.md was found');
  assert.match(bullet[0], /opens with the Feature's `## Goal` section/, 'the planner bullet names the Goal section');

  // F15: the brief template has the Goal heading /implement writes, and the README describes brief.md truthfully.
  const tpl = read('templates', 'tasks', 'stories', 'brief.template.md');
  const goalHeading = tpl.match(/^## Goal\n([\s\S]*?)(?=^## |$(?![\s\S]))/m);
  assert.ok(goalHeading, 'the brief template has a ## Goal heading');
  assert.match(flat(goalHeading[1]), /modality[\s\S]*concrete gate[\s\S]*seen/i);
  const readme = read('templates', 'tasks', 'stories', 'README.md');
  const line = readme.split('\n').find((l) => /^├── brief\.md/.test(l));
  assert.ok(line, 'companion: the README line for brief.md was found');
  assert.doesNotMatch(line, /8-point/, 'the README no longer calls brief.md an 8-point brief');
  assert.match(line, /Goal/, 'the README line names the Goal that brief.md carries');
});

// ── A3: the session-start cleanup leaves a live Feature worktree alone ──

test('Worktrees_CleanupSkipsAFeatureInProgressInAnotherSession', () => {
  // Round 2: a Feature is skipped only when `feature-state.js live` says live. One that is not live is
  // offered like any other worktree, and an unfinished one (no pr-opened event) says so in the question.
  const skips = (section) => {
    const f = flat(section);
    const iSkip = f.search(/in progress in another session, left alone/);
    const iAsk = f.search(/Remove it\?/);
    return iSkip !== -1 && iAsk !== -1 && iSkip < iAsk
      && /`tasks\/features\/<fid>\/`/.test(f)
      && /feature-state\.js" live --feature <fid>/.test(f) && /prints `live`/.test(f)
      && !/claim\.md/.test(f) && !/phase is not `?done`?/.test(f)
      && /not live[^.]*offered like any other/i.test(f)
      && /event=pr-opened/.test(f) && /unfinished Feature, idle <n>m/.test(f)
      && /<repo>-f<fid>/.test(f) && /feature\/<fid>-/.test(f) && /-prove/.test(f);
  };
  const planted = '3. For each worktree whose remote branch is gone, prompt the user: "Remove it? [y/n]" (no exception).';
  assert.ok(!skips(planted), 'planted text that offers every worktree for removal is rejected');
  const plantedOld = '3. Skip a Feature worktree: when there is a fresh `claim.md`, or a `feature-state.md` whose phase is not `done`, say "Feature <fid> is in progress in another session, left alone". Remove it?';
  assert.ok(!skips(plantedOld), 'planted text that keeps the old claim.md / phase-not-done rule is rejected');
  const section = slice(read('rules', 'git-worktrees.md'), '## Lifecycle');
  assert.ok(section, 'git-worktrees.md has the Lifecycle section');
  assert.ok(skips(section), 'a Feature worktree is skipped only when live says live; a not-live one is offered, saying so when unfinished');
  assert.match(flat(section), /never offered/i);
});

test('Worktrees_Terminal_FeatureIsDrivenFromAHomeFolderSession_StandaloneGetsItsOwn', () => {
  const t = read('rules', 'git-worktrees.md');
  const f = flat(t);
  const rightTerminal = (x) => /Feature worktree[^.]*driven from a session in the home folder[^.]*no terminal of its own/i.test(x)
    && /standalone[^.]*its own terminal/i.test(x);
  assert.ok(!rightTerminal('Each worktree gets its own AI terminal. The user opens a NEW AI terminal in the new folder.'), 'planted opposite is rejected');
  assert.ok(rightTerminal(f), 'the Feature worktree has no terminal of its own, a standalone branch\'s worktree has');
  // The two lines that said "each worktree gets its own terminal" now say which kind.
  assert.doesNotMatch(f, /Each worktree gets its own AI terminal(?! \(a standalone)/);
  assert.doesNotMatch(f, /The user opens a NEW AI terminal in the new folder — that terminal becomes the dedicated context for this branch\./);
});

// ── A5: a standalone run asks when a Feature session is open here ────

test('Skill_StandaloneRunAsksWhenAFeatureSessionIsOpenInThisHomeFolder', () => {
  const asks = (t) => {
    const f = flat(t);
    return /feature-state\.js" live --feature <fid>`\. It prints `live <fid>: idle <N>m`/.test(f) && /30 minutes/.test(f)
      && !/claim\.md/.test(f)
      && /before checking out a branch here/.test(f) && /\(A\) Stop/.test(f) && /\(B\) Continue/.test(f)
      && /not self-answerable under `--autonomous`/.test(f);
  };
  assert.ok(!asks('A fresh claim is ignored and the branch is checked out; self-answerable.'), 'planted opposite is rejected');
  const before = slice(SKILL, '## Before you start');
  assert.ok(before, 'SKILL has "Before you start"');
  assert.ok(asks(before), 'a Feature that `feature-state.js live` calls live (30 minutes) makes a standalone run ask, (A) stop or (B) continue, never self-answered');
  // ADR-0006 and ARCHITECTURE say the same, not "built in its own worktree" flatly.
  const adr = flat(ADR('0006-'));
  const arch = flat(read('ARCHITECTURE.md'));
  for (const [name, t] of [['ADR-0006', adr], ['ARCHITECTURE', arch]]) {
    assert.match(t, /standalone (?:item|run)[^]{0,200}?`feature-state\.js live[^]{0,200}?asks? first/i, `${name}: a standalone run asks first when feature-state.js live says live`);
    assert.doesNotMatch(t, /fresh `claim\.md`/, `${name}: no longer reads a "fresh claim.md"`);
    assert.doesNotMatch(t, /While Features are running, (?:build )?a standalone item (?:is built )?(?:in its own worktree|in its own worktree \(Risk 4\))\./, `${name}: not the flat "built in its own worktree" rule`);
  }
});

// ── A7: ADR-0004, ADR-0005 and ARCHITECTURE say what is true now ────

test('Docs_Adr0004AndAdr0005_AmendedForF73', () => {
  const a4 = ADR('0004-');
  const amend = a4.split('\n').find((l) => /^- \*\*Amended by F73 #83 \(2026-11-04\):/.test(l));
  assert.ok(amend, 'ADR-0004 carries an amend note for F73');
  assert.match(flat(amend), /per-story lock[^.]*(?:is )?gone/i);
  assert.match(flat(amend), /`<state>\/\.verify\.lock`[^.]*`verify-lock: global`[^.]*`test-lock\.js`|`verify-lock: global`[^.]*`<state>\/\.verify\.lock`[^.]*`test-lock\.js`/);
  assert.ok(!/is gone/.test('The per-story lock is the default.'), 'planted opposite has no "gone" claim');
  const a5 = ADR('0005-').split('\n').find((l) => /^- \*\*Amended by F73 #83 \(2026-11-04\):/.test(l));
  assert.ok(a5, 'ADR-0005 carries an amend note for F73');
  assert.match(flat(a5), /no waves and no executor[^.]*standalone/i);
});

test('Docs_Architecture_Row6_Section4_StoriesRow_DecisionsRow', () => {
  const arch = read('ARCHITECTURE.md');
  const row6 = arch.split('\n').find((l) => /^\| 6 \| Verify lock/.test(l));
  assert.ok(row6, 'row 6 exists');
  const f6 = flat(row6);
  assert.match(f6, /default[^|]*no lock/i, 'row 6: the default takes no lock');
  assert.match(f6, /`<state>\/\.verify\.lock`[^|]*`test-lock\.js`/, 'row 6: global is <state>/.verify.lock through test-lock.js');
  assert.doesNotMatch(f6, /tasks\/stories\/<sid>\/\.verify\.lock/, 'row 6 no longer names the per-story lock as live');
  const s4 = flat(arch);
  assert.match(s4, /One writer per file is true per Feature[\s\S]*Across sessions some things are shared/i, '§4: one writer per file is per Feature, and says what is shared');
  assert.match(s4, /`lessons\.md`\/`notes\.md`[\s\S]{0,120}read just before[\s\S]{0,80}re-read/i, '§4: shared files are re-read before an edit');
  const stories = arch.split('\n').find((l) => /^\| `tasks\/stories\/<sid>\/` \|/.test(l));
  assert.ok(stories, 'the stories row exists');
  assert.match(flat(stories), /standalone run writes `plan\.md` and `brief\.md` there/);
  const dec = arch.split('\n').find((l) => /^\| \d+ \| One story loop \|/.test(l));
  assert.ok(dec, 'a decisions row for #83 exists');
  assert.match(flat(dec), /One story loop[\s\S]*the executor, the waves, the plan-lint hook and `\/troubleshoot` are retired \(F73 #83\)/);
});

// ── L: written reasons ───────────────────────────────────────────────

test('Skill_WrittenReasons_LockTimeoutsOwnerAndRoot', () => {
  const owner = (t) => /person who owns the project's test setup[^.]*`?TEST_LOCK_TIMEOUT_MS`?/i.test(flat(t)) && /longer than the wait/i.test(flat(t));
  assert.ok(!owner('The timeouts are fixed.'), 'planted opposite is rejected');
  assert.ok(owner(slice(SKILL, '## The story loop')), 'the standalone "Shared test resources" says who tunes the waits');
  assert.ok(owner(slice(SKILL, '### Run the stories')), 'so does the Feature one');
  assert.match(flat(SKILL), /`--root` is always passed by the main session/);
  assert.match(read('skills', 'implement', 'bin', 'test-lock.js'), /Who tunes them:[\s\S]*TEST_LOCK_TIMEOUT_MS/);
});
