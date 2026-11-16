'use strict';
// Private to the scripts module: the Interface-block checks behind scripts/__tests__/boundaries-*.test.js
// (rules/modules.md, "Where an interface is written"). Each check takes a repo root and returns a list
// of problem strings naming the module. Also holds the module-listing helpers (agentOwners, listModules, readModule) and the part table the other families share.

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('../../hooks/lib/frontmatter.js');
const { PATH_BOUNDARY, mdFiles, skillFolders, fenceMask, checkOptions, exemptSet } = require('./common.js');

function agentFiles(root) {
  return mdFiles(path.join(root, 'agents'));
}

function agentOwners(root) {
  return agentFiles(root).map((file) => {
    const fm = parse(fs.readFileSync(path.join(root, 'agents', file), 'utf8'));
    return { name: file.replace(/\.md$/, ''), owner: fm.owner };
  });
}

// The four parts of an Interface block, by label, and the key each is read into. The one table: the
// README checks use it too.
const PART_LABELS = {
  Inputs: 'inputs',
  Outputs: 'outputs',
  'Callable parts': 'callable',
  'Never breaks': 'neverBreaks',
};

function stripFrontmatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return lines;
  const end = lines.indexOf('---', 1);
  return end === -1 ? lines : lines.slice(end + 1);
}

// Reads the Interface block of a SKILL.md or agent file.
// found: an `## Interface` heading exists in the body. firstAfterFrontmatter: it is the first
// non-blank line after the frontmatter. parts: the text of each of the four labelled parts.
// labels: every `**Label:**` found in the block, in order. headings: how many `## Interface` lines.
function readInterface(text) {
  const body = stripFrontmatter(text);
  const isHeading = (l) => /^## Interface\s*$/.test(l);
  // A line inside a ``` code fence is never a heading.
  const inFence = fenceMask(body);
  const headingAt = (i) => !inFence[i] && isHeading(body[i]);
  const headings = body.filter((_, i) => headingAt(i)).length;
  const first = body.findIndex((l) => l.trim() !== '');
  const start = body.findIndex((_, i) => headingAt(i));
  const result = {
    found: start !== -1,
    firstAfterFrontmatter: first !== -1 && headingAt(first),
    headings,
    labels: [],
    parts: { inputs: '', outputs: '', callable: '', neverBreaks: '' },
  };
  if (start === -1) return result;
  const chunks = [];
  let current = null;
  // The block ends at the next heading or a `---` line.
  for (const line of body.slice(start + 1)) {
    if (/^(## |# |---)/.test(line)) break;
    const label = /^\*\*([^*:]+):\*\*\s?(.*)$/.exec(line);
    if (label) {
      current = { name: label[1].trim(), lines: [label[2]] };
      chunks.push(current);
      result.labels.push(current.name);
    } else if (current) {
      current.lines.push(line);
    }
  }
  for (const { name, lines } of chunks) {
    const key = PART_LABELS[name];
    if (key && !result.parts[key]) result.parts[key] = lines.join('\n').trim();
  }
  return result;
}

function listModules(root) {
  const modules = [];
  for (const name of skillFolders(root)) {
    modules.push({ id: `skills/${name}`, name, kind: 'skill', file: `skills/${name}/SKILL.md` });
  }
  for (const f of agentFiles(root)) {
    const name = f.replace(/\.md$/, '');
    modules.push({ id: `agents/${name}`, name, kind: 'agent', file: `agents/${f}` });
  }
  return modules.sort((a, b) => a.id.localeCompare(b.id));
}

function readModule(root, mod) {
  const abs = path.join(root, mod.file);
  return fs.existsSync(abs) ? readInterface(fs.readFileSync(abs, 'utf8')) : null;
}

function checkInterfaces(root, options = {}) {
  checkOptions(options);
  const exe = exemptSet(options);
  const problems = [];
  for (const mod of listModules(root)) {
    if (mod.kind === 'skill' && exe.has(mod.name)) continue;
    const iface = readModule(root, mod);
    if (!iface) {
      problems.push(`${mod.file}: file is missing`);
    } else if (!iface.found || !iface.firstAfterFrontmatter) {
      problems.push(`${mod.file}: no ## Interface block right after the frontmatter`);
    } else {
      if (iface.headings > 1) problems.push(`${mod.file}: more than one ## Interface heading`);
      for (const label of Object.keys(PART_LABELS)) {
        if (!iface.labels.includes(label)) problems.push(`${mod.file}: Interface has no **${label}:** part`);
        else if (!iface.parts[PART_LABELS[label]]) problems.push(`${mod.file}: Interface part ${label} is empty`);
      }
      for (const label of new Set(iface.labels)) {
        if (iface.labels.filter((l) => l === label).length > 1) problems.push(`${mod.file}: Interface part ${label} appears more than once`);
      }
      for (const label of iface.labels) {
        if (!(label in PART_LABELS)) problems.push(`${mod.file}: Interface has an unknown part "${label}"`);
      }
    }
  }
  return problems;
}

// A report that starts with the `STATUS:` line: it is the first thing the Outputs say, or they say the
// report starts (or begins) with it.
const STATUS_START_RE = /^`?STATUS:|\b(?:starts?|begins?) with (?:a |the |its )?(?:first )?(?:line )?`?STATUS:/i;

function checkAgentOutputs(root, options = {}) {
  checkOptions(options);
  const owners = new Map(agentOwners(root).map((a) => [a.name, a.owner]));
  const problems = [];
  for (const mod of listModules(root).filter((m) => m.kind === 'agent')) {
    const iface = readModule(root, mod);
    if (!iface || !iface.found) continue;
    // The `STATUS:` line must be named as the start of the report, so "no STATUS: line" fails.
    const out = iface.parts.outputs.trim();
    const negated = /\b(?:not|no|never|without)\b[^.\n]*\b(?:starts?|begins?) with\b/i.test(out);
    // A person-launched agent reports to no orchestrator, so it may say so instead of giving a STATUS: line.
    const personNone = owners.get(mod.name) === 'person' && /^none \(person-launched\)/.test(out);
    if (!personNone && (negated || !STATUS_START_RE.test(out))) {
      problems.push(`${mod.file}: Interface Outputs do not give the STATUS: line`);
    }
  }
  return problems;
}

function escapeRe(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// The skills whose SKILL.md starts the agent. The agent is named as a bare word, not as a path such
// as `agents/<name>.md` (a pointer to the file), and one of these holds: its line has a start verb
// (spawn, launch, start, run); its line introduces it as "Agent <X>:" or "Agent <X> —"; or the line
// before has a start verb (the name on the next line). An example mention has none of these.
const START_VERB_RE = /\b(?:spawn|launch|start|run)(?:s|es|ed|ing)?\b/i;
const AGENT_INTRO_RE = /\bAgent [A-Z0-9]+\s*[:—–-]/;
function callersOf(root, agent) {
  const re = new RegExp(`${PATH_BOUNDARY}${escapeRe(agent)}(?![A-Za-z0-9_-])`);
  const spawns = (text) => {
    const lines = text.split(/\r?\n/);
    return lines.some((l, i) => re.test(l) &&
      (START_VERB_RE.test(l) || AGENT_INTRO_RE.test(l) || (i > 0 && START_VERB_RE.test(lines[i - 1]))));
  };
  return listModules(root)
    .filter((m) => m.kind === 'skill' && fs.existsSync(path.join(root, m.file)))
    .filter((m) => spawns(fs.readFileSync(path.join(root, m.file), 'utf8')))
    .map((m) => m.name)
    .sort();
}

// True when `text` gives the usage `/<name>`. The `/` must not follow a path character, and the name
// must not run on into a longer name (`/name-x`), a path (`/name/x`) or a file (`/name.md`); a `.` that
// ends a sentence is fine.
function namesSkill(text, name) {
  return new RegExp(`${PATH_BOUNDARY}/${escapeRe(name)}(?![A-Za-z0-9_/-]|\\.[A-Za-z0-9_])`).test(text);
}

// The command a person types: the frontmatter `name:` when the SKILL.md has one, else the folder name.
function commandName(root, mod) {
  const abs = path.join(root, mod.file);
  const name = fs.existsSync(abs) ? parse(fs.readFileSync(abs, 'utf8')).name : '';
  return typeof name === 'string' && name.trim() ? name.trim() : mod.name;
}

function checkSharedInputs(root, options = {}) {
  checkOptions(options);
  const problems = [];
  for (const { name, owner } of agentOwners(root)) {
    if (owner !== 'shared') continue;
    const text = fs.readFileSync(path.join(root, 'agents', `${name}.md`), 'utf8');
    const iface = readInterface(text);
    if (!iface.found) continue;
    for (const skill of callersOf(root, name)) {
      const command = commandName(root, { name: skill, file: `skills/${skill}/SKILL.md` });
      // The `/` must not follow a path character, so `skills/debug/...` and `rules/debug` do not count.
      if (!namesSkill(iface.parts.inputs, command)) {
        problems.push(`agents/${name}.md: Interface Inputs do not name calling skill /${command}`);
      }
    }
  }
  return problems;
}

// Every skill with an Interface block: its Inputs name the usage `/<name>`, and its Outputs name a
// tasks/ path or say "no tasks/ files". The `/` must not follow a path character.
const TASKS_PATH_RE = new RegExp(`${PATH_BOUNDARY}tasks\\/\\S|^no tasks\\/ files\\b`);

function checkSkillUsage(root, options = {}) {
  checkOptions(options);
  const exe = exemptSet(options);
  const problems = [];
  for (const mod of listModules(root).filter((m) => m.kind === 'skill')) {
    if (exe.has(mod.name)) continue;
    const iface = readModule(root, mod);
    if (!iface || !iface.found) continue;
    const command = commandName(root, mod);
    if (!namesSkill(iface.parts.inputs, command)) {
      problems.push(`${mod.file}: Interface Inputs do not give the usage /${command}`);
    }
    // "no tasks/ files" must open Outputs; a tasks/ path must not follow a path character.
    if (!TASKS_PATH_RE.test(iface.parts.outputs)) {
      problems.push(`${mod.file}: Interface Outputs name no tasks/ path and do not say "no tasks/ files"`);
    }
  }
  return problems;
}

module.exports = {
  agentOwners, listModules, readModule, PART_LABELS,
  readInterface, checkInterfaces, checkAgentOutputs, callersOf, checkSharedInputs, checkSkillUsage,
};
