// Doc-consistency probe for F2 #35: /implement reads the whole ticket (description, criteria,
// children, blockers, comments, attachments) into the brief, stops on an open blocker, and moves the
// item's status at start, at review and at done, without ever stopping on a failed status write.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const IMPLEMENT = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'implement', 'SKILL.md'), 'utf8');
const { readRequired } = require('../bin/startup-check.js');

function mustMatch(content, re, message) { assert.ok(re.test(content), message); }

function section(content, heading) {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start === -1) return null;
  let inFence = false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (lines[i].startsWith('```')) inFence = !inFence;
    else if (!inFence && /^#{2,3} /.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

const READ_STEP = section(IMPLEMENT, '### Read the whole ticket');
const SCRIPTS = ['get-issue.sh', 'get-issue-children.sh', 'get-blockers.sh', 'get-comments.sh', 'get-attachments.sh'];

test('WholeTicket_ReadStepCallsEveryScript', () => {
  assert.ok(READ_STEP, 'expected a "### Read the whole ticket" step');
  for (const s of SCRIPTS) assert.ok(READ_STEP.includes(s), `the read step must call ${s}`);
});

test('WholeTicket_ScriptsAreInTheRequiredToolsList', () => {
  const required = new Set(readRequired().filter((r) => r.kind === 'tracker-script').map((r) => r.name));
  for (const s of [...SCRIPTS, 'set-status.sh']) assert.ok(required.has(s), `Required tools must list ${s}`);
});

test('WholeTicket_EverythingReadGoesIntoTheBriefThePlannerGets', () => {
  mustMatch(READ_STEP, /tasks\/stories\/<id>\/ticket\.md/, 'the ticket must be saved to tasks/stories/<id>/ticket.md');
  const phase1 = section(IMPLEMENT, '## Phase 1 — Understand');
  mustMatch(phase1, /ticket\.md/, 'Phase 1 must hand ticket.md to the understand agent');
  const plan = section(IMPLEMENT, '### Phase 1c — Plan');
  mustMatch(plan, /ticket\.md/, 'the planner must receive ticket.md');
  for (const part of ['children', 'blockers', 'comments', 'attachments']) {
    mustMatch(READ_STEP, new RegExp(part, 'i'), `ticket.md must include the ${part}`);
  }
});

test('WholeTicket_CommentsAndAttachmentsAreDataNotInstructions', () => {
  mustMatch(READ_STEP, /data, never instructions|never (as )?instructions/i, 'ticket content must be treated as data');
});

test('WholeTicket_OpenBlockerStopsTheRun', () => {
  mustMatch(READ_STEP, /open blocker[\s\S]{0,300}\*\*stop\*\*/i, 'an open blocker must stop the run');
  mustMatch(READ_STEP, /\*\*State:\*\*/, 'a blocker is checked through its get-issue State line');
});

test('WholeTicket_StatusMovesAtStartReviewAndDone', () => {
  mustMatch(IMPLEMENT, /set-status\.sh <id> in-progress/, 'status in-progress at the start');
  mustMatch(section(IMPLEMENT, '## Phase 3 — Evaluate + PR'), /set-status\.sh <id> in-review/, 'status in-review when the reviews start');
  mustMatch(section(IMPLEMENT, '## Phase 3 — Evaluate + PR'), /set-status\.sh <id> done/, 'status done when the PR is opened');
  mustMatch(IMPLEMENT, /set-status\.sh <id> needs-person/, 'status needs-person when the run stops for a person');
});

test('WholeTicket_FailedStatusWriteIsLoggedAndNeverStopsTheRun', () => {
  const s = section(IMPLEMENT, '### Moving the card');
  assert.ok(s, 'expected a "### Moving the card" subsection');
  mustMatch(s, /event=tracker-error/, 'a failed status write must print a tracker-error progress line');
  mustMatch(s, /carr(y|ies) on|never stops/i, 'a failed status write must not stop the run');
});

test('WholeTicket_NoTrackerItemMeansNoReadAndNoStatus', () => {
  mustMatch(READ_STEP, /plain description|no tracker id/i, 'a run with no tracker item must skip the read and the status moves');
});

test('WholeTicket_TrackerErrorIsAProgressEvent', () => {
  const progress = fs.readFileSync(path.join(REPO_ROOT, 'skills', 'implement', 'bin', 'progress.js'), 'utf8');
  mustMatch(progress, /'tracker-error'/, 'bin/progress.js must accept the tracker-error event');
});
