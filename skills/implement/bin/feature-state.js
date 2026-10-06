#!/usr/bin/env node
// feature-state.js — a Feature's story graph and its state file (F4 #43, #45, #46).
//
// The state lives in <root>/tasks/features/<fid>/feature-state.md (ARCHITECTURE.md §4): plain
// "key: value" header lines, then one line per story, "story <sid>: key=value key=value ...".
// Only the orchestrator writes it. It is the source of truth for --resume.
//
// Usage (every command takes --root <home folder>, default the current directory):
//   init   --feature <fid> --title <t> --stories <stories.json> [--repo-name <n>] [--story-cap <n>]
//          stories.json: [{"id","title","state","blockers":[ids of stories in this Feature]}]
//          Orders the stories by dependency, rejects a cycle or a blocker outside the Feature, and
//          writes the state. Closed stories are "skipped". Prints the order. Refuses to overwrite.
//   set    --feature <fid> [--story <sid>] key=value ...     update a story, or the header
//   next   --feature <fid>   prints "story <sid>", "wait", "done", or "held: ..." (stuck, nothing left)
//   resume --feature <fid>   prints what --resume does with each story
//   stuck  --feature <fid> --story <sid> --reason <text>
//          marks the story stuck and every story that depends on it, directly or not, held; prints
//          "needs-person: <ids>" for the card moves
//
// Exit codes: 0 ok, 1 refused (cycle, bad value, no state), 2 usage error.

const fs = require('node:fs');
const path = require('node:path');

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const STATUSES = ['pending', 'running', 'in-review', 'merged', 'stuck', 'held', 'skipped'];
const CLOSED = /^(closed|done|removed|resolved|completed)$/i;
const SOFT_LIMIT = 8;

function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '') || 'work';
}

// One line per value, always: a value can never start a new line of the file. On a story line a value
// also cannot hold "=", so it cannot add a field of its own ("title=Orders status=merged").
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

const STORY_KEYS = ['status', 'title', 'blockers', 'worktree', 'branch', 'commit', 'merge', 'attempts',
  'started', 'finished', 'findings', 'agents', 'tokens', 'reason'];

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

  const repoName = opts['repo-name'] || path.basename(path.resolve(root));
  const parent = path.dirname(path.resolve(root));
  const header = {
    feature: fid,
    title: opts.title || '',
    'run-mode': opts['run-mode'] || 'interactive',
    'plan-approved': 'no',
    'feature-branch': `feature/${fid}-${slug(opts.title || fid)}`,
    'feature-worktree': path.join(parent, `${repoName}-f${fid}`),
    'story-cap': opts['story-cap'] || '1',
    phase: 'planning',
  };
  const rows = result.order.map((s) => ({
    id: s.id,
    status: CLOSED.test(s.state) ? 'skipped' : 'pending',
    title: s.title,
    blockers: s.blockers.join(','),
    worktree: path.join(parent, `${repoName}-f${fid}-s${s.id}`),
    branch: `story/${s.id}-${slug(s.title || s.id)}`,
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
    target[m[1]] = clean(m[2]);
  }
  writeState(root, opts.feature, state);
  return 0;
}

function cmdNext(root, opts) {
  const { header, stories } = load(root, opts.feature);
  const status = new Map(stories.map((s) => [s.id, s.status]));
  const active = stories.filter((s) => s.status === 'running' || s.status === 'in-review').length;
  const ready = stories.find((s) => s.status === 'pending' && blockersOf(s).every((b) => ['merged', 'skipped'].includes(status.get(b))));
  if (ready && active < Number(header['story-cap'] || 1)) return out(`story ${ready.id}`), 0;
  if (active > 0) return out('wait'), 0;
  if (stories.every((s) => s.status === 'merged' || s.status === 'skipped')) return out('done'), 0;
  const stuck = stories.filter((s) => s.status === 'stuck').map((s) => `#${s.id}`);
  const held = stories.filter((s) => s.status === 'held' || s.status === 'pending').map((s) => `#${s.id}`);
  out(`held: stuck ${stuck.join(' ') || 'none'}; waiting on it ${held.join(' ') || 'none'}`);
  return 0;
}

function cmdResume(root, opts) {
  const { stories } = load(root, opts.feature);
  for (const s of stories) {
    switch (s.status) {
      case 'merged':
      case 'skipped':
        out(`skip ${s.id}: ${s.status}`);
        break;
      case 'running':
      case 'in-review':
        out(fs.existsSync(s.worktree)
          ? `restart ${s.id}: ${s.status}; worktree present, restart its runner from tasks/stories/${s.id}/executor-state.md`
          : `restart ${s.id}: ${s.status}; its worktree ${s.worktree} is missing, recreate it from the Feature branch`);
        break;
      case 'stuck':
        out(`stuck ${s.id}: ${s.reason || 'no reason recorded'} (worktree kept as evidence)`);
        break;
      default:
        out(`${s.status} ${s.id}`);
    }
  }
  return cmdNext(root, opts);
}

function cmdStuck(root, opts) {
  const state = load(root, opts.feature);
  const story = state.stories.find((s) => s.id === opts.story);
  if (!story) return fail(1, `no story #${opts.story} in Feature #${opts.feature}`);
  story.status = 'stuck';
  story.reason = clean(opts.reason || 'no reason given');
  const held = new Set([story.id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of state.stories) {
      if (held.has(s.id) || s.status === 'merged' || s.status === 'skipped') continue;
      if (blockersOf(s).some((b) => held.has(b))) { held.add(s.id); s.status = 'held'; grew = true; }
    }
  }
  writeState(root, opts.feature, state);
  out(`needs-person: ${state.stories.filter((s) => held.has(s.id)).map((s) => s.id).join(' ')}`);
  return 0;
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
  const commands = { init: () => cmdInit(root, opts), set: () => cmdSet(root, opts, pairs), next: () => cmdNext(root, opts), resume: () => cmdResume(root, opts), stuck: () => cmdStuck(root, opts) };
  if (!commands[command]) fail(2, 'usage: feature-state.js init|set|next|resume|stuck --feature <fid> [...] (see the header of this file)');
  process.exit(commands[command]());
}

if (require.main === module) main();

module.exports = { readState, order, slug, STATUSES };
