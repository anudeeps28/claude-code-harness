#!/usr/bin/env node
// feature-state.js — a Feature's story graph and its state file (F4 #43, #45, #46).
//
// The state lives in <root>/tasks/features/<fid>/feature-state.md (ARCHITECTURE.md §4): plain
// "key: value" header lines, then one line per story, "story <sid>: key=value key=value ...".
// Only the orchestrator writes it. It is the source of truth for --resume.
//
// Usage (every command takes --root <home folder>, default the current directory):
//   init   --feature <fid> --title <t> --stories <stories.json> [--repo-name <n>] [--base <branch>]
//          stories.json: [{"id","title","state","blockers":[ids of stories in this Feature]}]
//          Orders the stories by dependency, rejects a cycle or a blocker outside the Feature, and
//          writes the state. Closed stories are "skipped". Prints the order. Refuses to overwrite.
//   set    --feature <fid> [--story <sid>] key=value ...     update a story, or the header
//   next   --feature <fid>   the stories are built one after another (F72 #78): prints
//          "running <sid>" while one runs; otherwise "story <sid>" for the first pending story whose
//          blockers are all committed or skipped; or "done" (every story committed or skipped), or
//          "held: ..." (stuck, nothing left to start).
//          A story's keys: status (pending running committed stuck held skipped), step, base (the
//          commit it started from), commit, models (sonnet:<n>,opus:<n>,...), agents, tokens.
//   sequence --feature <fid>   reads the Feature's progress.log: prints "ok", or "overlap:
//          story-started #<b> while #<a> in flight" (exit 1) when a story started before the one
//          in flight was committed or stuck
//   hung   --feature <fid> [--now <iso>]   the one running story, when its phase.md is 30+ minutes old:
//          "relaunch <sid>: ..." the first time, then "ask <sid>: ..." (never stuck by itself: on
//          --resume nothing is running, so an old phase.md only says the session stopped).
//          Run on --resume only; setting a story's step to a new value clears its hang count.
//   resume --feature <fid> [--feature-worktree <p>]   prints what --resume does with each story. A
//          commit on the Feature branch with the line "Story: #<sid>" means "skip <sid>: committed <sha>"
//          (and the state is brought up to date); a running one with no commit is "restart <sid>: from
//          step <step>"; a committed one whose commit is gone is "redo <sid>: ..."; then next or
//          done. A first line "approve: ..."
//          when plan-approved is still no in phase planning and gate-shown is yes (the resume is the
//          plan approval); "show-gate: ..." instead when gate-shown is absent or no
//   stuck  --feature <fid> --story <sid> --reason <text>
//          marks the story stuck and every story that depends on it, directly or not, held; prints
//          "needs-person: <sid>" (the card to move) and, on its own line, "held: <ids>" when any
//
// Exit codes: 0 ok, 1 refused (cycle, bad value, no state), 2 usage error.

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const HANG_MINUTES = 30;      // rules/phase-markers.md freshness

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const STATUSES = ['pending', 'running', 'committed', 'stuck', 'held', 'skipped'];
// The base reaches git as an argument (`<base>..HEAD`), so it must look like a branch or a sha, never an option.
const BASE_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const CLOSED = /^(closed|done|removed|resolved|completed)$/i;
const SOFT_LIMIT = 8;

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'work';
}

// One line per value, always: a value can never start a new line of the file. On a story line a value
// also cannot hold "=", so it cannot add a field of its own ("title=Orders status=committed").
function clean(value, onStoryLine = false) {
  // eslint-disable-next-line no-control-regex
  const v = String(value).replace(/[\r\n]+/g, ' ').replace(/[\x00-\x1f\x7f]/g, '').trim();
  return onStoryLine ? v.replace(/=/g, '-') : v;
}

function stateFile(root, fid) { return path.join(root, 'tasks', 'features', fid, 'feature-state.md'); }

/** @returns {{header: Record<string,string>, stories: Record<string,string>[]} | null} */
function readState(root, fid) {
  const file = stateFile(root, fid);
  if (!fs.existsSync(file)) return null;
  const header = {};
  const stories = [];
  for (const line of fs.readFileSync(file, 'utf8').replace(/\r/g, '').split('\n')) {
    const s = line.match(/^story ([^:\s]+): (.*)$/);
    if (s) {
      if (!ID_RE.test(s[1]) || s[1].includes('..')) {   // a story id reaches paths and git: drop a bad row, and say so
        process.stderr.write(`warn: dropped story row "${clean(s[1])}": bad id\n`);
        continue;
      }
      const story = { id: s[1] };
      // Values may contain spaces (a title, a reason): a value runs until the next " key=".
      for (const m of s[2].matchAll(/([a-z-]+)=(.*?)(?= [a-z-]+=|$)/g)) if (!(m[1] in story)) story[m[1]] = m[2];
      stories.push(story);
      continue;
    }
    const h = line.match(/^([a-z-]+): (.*)$/);
    if (h && !(h[1] in header)) header[h[1]] = h[2];
  }
  return { header, stories };
}

const STORY_KEYS = ['status', 'step', 'title', 'blockers', 'base', 'commit', 'attempts',
  'started', 'finished', 'findings', 'agents', 'tokens', 'models', 'reason'];

function writeState(root, fid, state) {
  const file = stateFile(root, fid);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const header = { ...state.header, updated: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') };
  const lines = [`# Feature state — ${fid}`, ''];
  for (const [k, v] of Object.entries(header)) lines.push(`${k}: ${clean(v)}`);
  lines.push('', '## Stories', '');
  for (const s of state.stories) {
    const keys = [...STORY_KEYS.filter((k) => k in s), ...Object.keys(s).filter((k) => k !== 'id' && !STORY_KEYS.includes(k))];
    lines.push(`story ${s.id}: ${keys.map((k) => `${k}=${clean(s[k], true)}`).join(' ')}`);
  }
  fs.writeFileSync(file, lines.join('\n') + '\n');
}

const blockersOf = (s) => (s.blockers ? s.blockers.split(',').filter(Boolean) : []);

/** Dependency order; ties keep the given (creation) order. Returns {order} or {cycle}. */
function order(stories) {
  const byId = new Map(stories.map((s) => [s.id, s]));
  const done = new Set();
  const visiting = [];
  const out = [];
  function visit(s) {
    if (done.has(s.id)) return null;
    const at = visiting.indexOf(s.id);
    if (at !== -1) return [...visiting.slice(at), s.id];
    visiting.push(s.id);
    for (const b of s.blockers) {
      const cycle = visit(byId.get(b));
      if (cycle) return cycle;
    }
    visiting.pop();
    done.add(s.id);
    out.push(s);
    return null;
  }
  for (const s of stories) {
    const cycle = visit(s);
    if (cycle) return { cycle };
  }
  return { order: out };
}

function cmdInit(root, opts) {
  const fid = opts.feature;
  if (fs.existsSync(stateFile(root, fid))) {
    return fail(1, `feature-state.md for #${fid} already exists; carry on with /implement --resume ${fid}`);
  }
  let input;
  try { input = JSON.parse(fs.readFileSync(opts.stories, 'utf8')); } catch (e) { return fail(2, `cannot read ${opts.stories}: ${e.message}`); }
  const stories = input.map((s) => ({ id: String(s.id), title: clean(s.title || ''), state: String(s.state || ''), blockers: (s.blockers || []).map(String) }));
  for (const s of stories) if (!ID_RE.test(s.id)) return fail(1, `bad story id: ${JSON.stringify(s.id)}`);
  const ids = new Set(stories.map((s) => s.id));
  for (const s of stories) {
    for (const b of s.blockers) {
      if (!ids.has(b)) return fail(1, `#${s.id} is blocked by #${b}, which is not a story of this Feature: check that blocker is closed, then leave it out of the story graph`);
    }
  }
  const result = order(stories);
  if (result.cycle) return fail(1, `dependency cycle: ${result.cycle.map((id) => `#${id}`).join(' → ')}. Nothing was written. Break the cycle in the tracker and run again.`);

  if (opts.base && !BASE_RE.test(opts.base)) return fail(2, `bad branch name for --base: ${opts.base}`);

  const repoName = opts['repo-name'] || path.basename(path.resolve(root));
  const parent = path.dirname(path.resolve(root));
  const header = {
    feature: fid,
    title: opts.title || '',
    'run-mode': opts['run-mode'] || 'interactive',
    'plan-approved': 'no',
    base: opts.base || 'main',
    'feature-branch': `feature/${fid}-${slug(opts.title || fid)}`,
    'feature-worktree': path.join(parent, `${repoName}-f${fid}`),
    phase: 'planning',
  };
  const rows = result.order.map((s) => ({
    id: s.id,
    status: CLOSED.test(s.state) ? 'skipped' : 'pending',
    title: s.title,
    blockers: s.blockers.join(','),
    attempts: '0',
  }));
  writeState(root, fid, { header, stories: rows });

  rows.forEach((s, i) => {
    const after = blockersOf(s).length ? ` (after ${blockersOf(s).map((b) => `#${b}`).join(', ')})` : '';
    const skipped = s.status === 'skipped' ? ' (already closed, skipped)' : '';
    out(`${i + 1}. #${s.id} ${s.title}${after}${skipped}`);
  });
  if (rows.length > SOFT_LIMIT) out(`warning: ${rows.length} stories; above ${SOFT_LIMIT}, consider splitting into two Features, each with its own Demo`);
  return 0;
}

function load(root, fid) {
  const state = readState(root, fid);
  if (!state) fail(1, `no saved state for Feature #${fid} (tasks/features/${fid}/feature-state.md); nothing to resume, and a fresh run is never started from here`);
  // A hand-edited or forged state file must never put an option in front of git.
  if (state.header.base !== undefined && !BASE_RE.test(state.header.base)) fail(1, `bad branch name for base: ${state.header.base} (in feature-state.md); fix the file`);
  return state;
}

function cmdSet(root, opts, pairs) {
  const state = load(root, opts.feature);
  let target = state.header;
  if (opts.story) {
    target = state.stories.find((s) => s.id === opts.story);
    if (!target) return fail(1, `no story #${opts.story} in Feature #${opts.feature}`);
  }
  for (const pair of pairs) {
    const m = pair.match(/^([a-z-]+)=([\s\S]*)$/);
    if (!m) return fail(2, `expected key=value, got ${JSON.stringify(pair)}`);
    if (opts.story && m[1] === 'status' && !STATUSES.includes(m[2])) return fail(1, `unknown status "${m[2]}" (one of ${STATUSES.join(', ')})`);
    if (m[1] === 'base' && !BASE_RE.test(clean(m[2]))) return fail(1, `bad branch name for base: ${m[2]}`);
    // The hang counter counts relaunches of the same step only: a new step starts it again.
    if (opts.story && m[1] === 'step' && target.step !== clean(m[2])) delete target.hangs;
    target[m[1]] = clean(m[2]);
  }
  writeState(root, opts.feature, state);
  return 0;
}

// One story at a time (F72 #78): the main session builds each story on the Feature branch, so next
// hands out exactly one, the first pending story in plan order whose blockers are all finished.
function cmdNext(root, opts) {
  const { stories } = load(root, opts.feature);
  const status = new Map(stories.map((s) => [s.id, s.status]));
  const running = stories.find((s) => s.status === 'running');
  if (running) return out(`running ${running.id}`), 0;
  const ready = stories.find((s) => s.status === 'pending' && blockersOf(s).every((b) => ['committed', 'skipped'].includes(status.get(b))));
  if (ready) return out(`story ${ready.id}`), 0;
  if (stories.every((s) => s.status === 'committed' || s.status === 'skipped')) return out('done'), 0;
  const stuck = stories.filter((s) => s.status === 'stuck').map((s) => `#${s.id}`);
  const held = stories.filter((s) => s.status === 'held' || s.status === 'pending').map((s) => `#${s.id}`);
  out(`held: stuck ${stuck.join(' ') || 'none'}; waiting on it ${held.join(' ') || 'none'}`);
  return 0;
}

// The sha of the commit on the Feature branch whose message has the line "Story: #<sid>" (the line
// only, never a longer id or prose), or '' when there is none or the worktree is not usable.
function storyCommit(wt, sid, base) {
  if (!wt || !fs.existsSync(wt)) return '';
  if (!BASE_RE.test(base || 'main') || !ID_RE.test(sid)) return '';
  // The id is matched as text: a "." in story 1.2 must not match "Story: #1x2".
  const text = String(sid).replace(/[.[\]\\*^$]/g, '\\$&');
  const r = spawnSync('git', ['-C', wt, 'log', '--format=%H', '--grep', `^Story: #${text}$`, '--end-of-options', `${base || 'main'}..HEAD`], { encoding: 'utf8' });
  if (r.status !== 0) return '';
  return (r.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean)[0] || '';
}

// Where a running story stopped: the saved step, else the "next:" line of its executor-state.md.
function savedStep(root, s) {
  if (s.step) return s.step;
  const file = path.join(root, 'tasks', 'stories', s.id, 'executor-state.md');
  if (fs.existsSync(file)) {
    const m = fs.readFileSync(file, 'utf8').match(/^next:\s*(.+)$/m);
    if (m) return m[1].trim();
  }
  return 'tests';
}

function cmdResume(root, opts) {
  const state = load(root, opts.feature);
  const { header, stories } = state;
  const wt = opts['feature-worktree'] || header['feature-worktree'];
  const git = !!wt && fs.existsSync(wt);
  let changed = false;
  // Without the Feature worktree the branch cannot be read, so a committed story is taken on trust.
  if (!git && stories.some((s) => s.status === 'committed')) {
    out(`warn: no Feature worktree at ${wt || '(none recorded)'}; committed stories are taken from the state file`);
  }
  // A plan gate that stops the run tells the person to approve by running --resume (a skill's
  // `model:` lasts one turn), so a resume of a Feature whose gate was SHOWN and not yet approved IS
  // the approval. A crash between init and printing the gate leaves nothing the person saw: show it.
  if (header['plan-approved'] === 'no' && header.phase === 'planning') {
    if (header['gate-shown'] === 'yes') {
      out('approve: the plan was not approved yet; this resume is the approval. Run the approval step (plan-approved=yes phase=coding, the Feature card to in-progress, event=run-started) first');
    } else {
      out('show-gate: the plan gate was never shown, so there is nothing to approve. Show the plan gate again (gate-shown=yes once it is printed)');
    }
  }
  for (const s of stories) {
    // The Feature branch's own commits are the truth about a finished story; the state may lag.
    const sha = ['pending', 'running', 'committed'].includes(s.status) ? storyCommit(wt, s.id, header.base) : '';
    if (sha) {
      if (s.status !== 'committed') { s.status = 'committed'; s.commit = sha; changed = true; }
      out(`skip ${s.id}: committed ${sha.slice(0, 7)}`);
      continue;
    }
    switch (s.status) {
      case 'committed':
        if (git) {
          out(`redo ${s.id}: commit ${s.commit ? s.commit.slice(0, 7) : '(none recorded)'} not on ${header['feature-branch'] || 'the Feature branch'}`);
          s.status = 'pending';
          changed = true;
        } else out(`skip ${s.id}: committed`);
        break;
      case 'skipped':
        out(`skip ${s.id}: skipped`);
        break;
      case 'running':
        out(`restart ${s.id}: from step ${savedStep(root, s)}`);
        break;
      case 'stuck':
        out(`stuck ${s.id}: ${s.reason || 'no reason recorded'} (its diff is in tasks/stories/${s.id}/stuck.diff)`);
        break;
      default:
        out(`${s.status} ${s.id}`);
    }
  }
  if (changed) writeState(root, opts.feature, state);
  return cmdNext(root, opts);
}

function cmdHung(root, opts) {
  const state = load(root, opts.feature);
  const now = opts.now ? Date.parse(opts.now) : Date.now();
  if (!Number.isFinite(now)) return fail(2, `bad --now: ${opts.now}`);
  for (const s of state.stories.filter((x) => x.status === 'running')) {
    const phaseFile = path.join(root, 'tasks', 'stories', s.id, 'phase.md');
    let updated = s.started;
    if (fs.existsSync(phaseFile)) {
      const m = fs.readFileSync(phaseFile, 'utf8').match(/^updated: (\S+)/m);
      if (m) updated = m[1];
    }
    const minutes = Math.floor((now - Date.parse(updated)) / 60000);
    if (!Number.isFinite(minutes) || minutes < HANG_MINUTES) continue;
    if ((Number(s.hangs) || 0) === 0) {
      s.hangs = '1';
      writeState(root, opts.feature, state);
      out(`relaunch ${s.id}: no progress ${minutes}m (phase.md updated ${updated}); start its builder again once, from its saved step`);
    } else {
      // Run on --resume, with nothing running: a stale phase.md means the session stopped, not
      // that a job hung, so a second stop is a question for the person, never "stuck" by itself.
      out(`ask ${s.id}: step stopped twice with no progress (${minutes}m); ask the person: retry the step, or mark the story stuck`);
    }
  }
  return 0;
}

// Reads the Feature's progress.log: no story may start while another is in flight (started, and
// neither committed nor stuck yet). A restart of the same story after a crash is not an overlap.
function cmdSequence(root, opts) {
  const file = path.join(root, 'tasks', 'features', opts.feature, 'progress.log');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r/g, '') : '';
  let inFlight = null;
  for (const line of text.split('\n')) {
    const event = line.match(/ event=(\S+)/);
    const story = line.match(/ story=(\S+)/);
    if (!event || !story) continue;
    if (event[1] === 'story-started') {
      if (inFlight !== null && inFlight !== story[1]) {
        out(`overlap: story-started #${story[1]} while #${inFlight} in flight`);
        return 1;
      }
      inFlight = story[1];
    } else if ((event[1] === 'story-committed' || event[1] === 'story-stuck') && inFlight === story[1]) {
      inFlight = null;
    }
  }
  out('ok');
  return 0;
}

function cmdStuck(root, opts) {
  const state = load(root, opts.feature);
  if (!state.stories.some((s) => s.id === opts.story)) return fail(1, `no story #${opts.story} in Feature #${opts.feature}`);
  markStuck(root, opts.feature, state, opts.story, opts.reason || 'no reason given');
  return 0;
}

function markStuck(root, fid, state, sid, reason) {
  const story = state.stories.find((s) => s.id === sid);
  story.status = 'stuck';
  story.reason = clean(reason);
  const held = new Set([story.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of state.stories) {
      if (held.has(s.id) || s.status === 'committed' || s.status === 'skipped') continue;
      if (blockersOf(s).some((b) => held.has(b))) { held.add(s.id); s.status = 'held'; grew = true; }
    }
  }
  writeState(root, fid, state);
  out(`needs-person: ${story.id}`);
  const dependents = state.stories.filter((s) => held.has(s.id) && s.id !== story.id).map((s) => s.id);
  if (dependents.length) out(`held: ${dependents.join(' ')}`);
}

function out(line) { process.stdout.write(line + '\n'); }
function fail(code, message) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

function parse(argv) {
  const [command, ...rest] = argv;
  const opts = {};
  const pairs = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i].startsWith('--')) {
      if (rest[i + 1] === undefined) fail(2, `${rest[i]} needs a value`);
      opts[rest[i].slice(2)] = rest[++i];
    } else pairs.push(rest[i]);
  }
  return { command, opts, pairs };
}

function main() {
  const { command, opts, pairs } = parse(process.argv.slice(2));
  const root = opts.root || process.cwd();
  if (!opts.feature || !ID_RE.test(opts.feature) || opts.feature.includes('..')) fail(2, `--feature <fid> is required, letters, digits, . _ - only`);
  if (opts.story !== undefined && (!ID_RE.test(opts.story) || opts.story.includes('..'))) fail(2, `bad --story id`);
  const commands = {
    init: () => cmdInit(root, opts), set: () => cmdSet(root, opts, pairs), next: () => cmdNext(root, opts),
    resume: () => cmdResume(root, opts), stuck: () => cmdStuck(root, opts), hung: () => cmdHung(root, opts),
    sequence: () => cmdSequence(root, opts),
  };
  if (!commands[command]) fail(2, 'usage: feature-state.js init|set|next|resume|stuck|hung|sequence --feature <fid> [...] (see the header of this file)');
  process.exit(commands[command]());
}

if (require.main === module) main();

module.exports = { readState };
