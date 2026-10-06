// Doc-consistency probe for F5 #48 "Independent stories run in parallel": the parallel start (#49),
// the disk check (#50), hung-story detection (#51) and the allowlist check (#52). The scripts have
// their own behaviour tests (feature-state, disk-check, allowlist-check).

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (...p) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8');
const IMPLEMENT = read('skills', 'implement', 'SKILL.md');
const { readSettings } = require('../bin/settings.js');

function section(content, heading) {
  const lines = content.replace(/\r/g, '').split('\n');
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start === -1) return null;
  const level = heading.match(/^#+/)[0].length;
  let inFence = false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('```')) inFence = !inFence;
    else if (!inFence) {
      const h = lines[i].match(/^(#+) /);
      if (h && h[1].length <= level) { end = i; break; }
    }
  }
  return lines.slice(start, end).join('\n');
}
function mustMatch(content, re, message) { assert.ok(content && re.test(content), message); }

const FEATURE = section(IMPLEMENT, '## Feature mode');
const RUN = section(FEATURE, '### Run the stories');

test('Parallel_ReadyStoriesStartTogetherWithinTheCapAndAgentLimit', () => {
  assert.ok(!/Stories run one at a time/i.test(FEATURE || ''),'Feature mode no longer says stories run one at a time');
  mustMatch(RUN, /every `story <sid>` line/i, 'every story next prints is started');
  mustMatch(RUN, /same message/i, 'the runners start in one message, so they run at once');
  mustMatch(RUN, /max-parallel-stories/, 'the cap is the max-parallel-stories setting');
  mustMatch(RUN, /20/, 'the 20-agent limit is named');
  mustMatch(RUN, /width=/, 'each story\'s widest remaining wave is recorded');
  mustMatch(RUN, /one at a time[\s\S]{0,200}merge|merges?[\s\S]{0,200}one at a time/i, 'merges stay one at a time');
  mustMatch(RUN, /never re-split/i, 'approved plans are never re-split');
});

test('Startup_DiskAndAllowlistAreCheckedBeforeTheFirstWorktree', () => {
  const s = section(FEATURE, '### Before the first story');
  assert.ok(s, 'expected "### Before the first story"');
  assert.ok(FEATURE.indexOf('### Before the first story') < FEATURE.indexOf('### Run the stories'), 'it runs before the stories');
  mustMatch(s, /disk-check\.js"? --stories/, 'the disk check runs');
  mustMatch(s, /allowlist-check\.js/, 'the allowlist check runs');
  mustMatch(s, /never (write|change|edit)s? (a )?settings|never writes/i, 'the check never writes settings');
  mustMatch(s, /plain "?Bash"?|allow all/i, 'it never recommends a blanket Bash rule');
  mustMatch(s, /--autonomous[\s\S]{0,300}(stop|pause)/i, 'under --autonomous a missing permission still stops');
});

test('Hung_CheckedOnEveryWakeRestartOnceThenStuck', () => {
  mustMatch(RUN, /feature-state\.js"? hung/, 'the hang check runs');
  mustMatch(RUN, /every time|each time/i, 'it runs every time the orchestrator wakes');
  mustMatch(RUN, /restart[\s\S]{0,200}once/i, 'a hung story is restarted once');
  mustMatch(RUN, /story-stuck[\s\S]{0,80}no progress 30m/, 'the story-stuck line names the reason');
});

for (const template of [['templates', 'tasks', 'lessons.md'], ['templates', 'tasks-solo', 'notes.md']]) {
  test(`Settings_TemplateHasFeatureRuns_${template[1]}`, () => {
    const text = read(...template);
    const s = section(text, '## Feature runs');
    assert.ok(s, `${template.join('/')} must have a "## Feature runs" section`);
    for (const key of ['max-parallel-stories', 'worktree-size-gb', 'verify-lock']) {
      mustMatch(s, new RegExp(`^- ${key}:`, 'm'), `it must declare ${key}`);
    }
  });
}

test('Settings_TemplatePlaceholdersReadAsUnset', () => {
  // An untouched template must not set anything: the defaults apply until the project chooses.
  const fsMod = require('node:fs');
  const os = require('node:os');
  const dir = fsMod.mkdtempSync(path.join(os.tmpdir(), 'settings-'));
  fsMod.mkdirSync(path.join(dir, 'tasks'));
  fsMod.copyFileSync(path.join(REPO_ROOT, 'templates', 'tasks', 'lessons.md'), path.join(dir, 'tasks', 'lessons.md'));
  assert.deepEqual(readSettings(dir), {});
});
