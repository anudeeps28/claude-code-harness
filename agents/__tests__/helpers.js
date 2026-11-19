'use strict';
// Shared helpers for the agent-text-*.test.js files (not a test file itself): one reader, one matcher, one
// whitespace-flattener per need, so a fix to one reaches every agent-text test.

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const AGENTS_DIR = path.join(__dirname, '..');

// An agent file, line ends normalised so a pattern that spans a line end works on a Windows checkout too.
const readAgent = (name) => fs.readFileSync(path.join(AGENTS_DIR, name), 'utf8').replace(/\r\n/g, '\n');
const agentFiles = () => fs.readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'));

// Whitespace runs as one space and bold marks removed, so a wrapped phrase is one phrase.
const flat = (t) => String(t).replace(/\*\*/g, '').replace(/\s+/g, ' ');
// The same with backticks removed too, for a phrase that is checked without its code marks.
const flatPlain = (t) => String(t).replace(/[*`]/g, '').replace(/\s+/g, ' ');

// Fails on empty content as well as on a missing match, so a file that was not read cannot pass.
function mustMatch(content, re, message) { assert.ok(content && re.test(content), message); }

const ownerOf = (text) => (text.match(/^owner:\s*(\S+)\s*$/m) || [])[1];

// The agents that run build, test or Observe commands in a Feature run: every agent /implement uses (owned by
// `implement` or `shared`) whose file gives it Bash and says to run the build or the tests. Derived from the
// agents' own text, so a new such agent is found instead of being forgotten by a hand-kept list.
// F73 fix (A2): the review agents run the build and the tests too (the evaluator's Steps 2-3, the acceptance
// agent's Step 3). Round 2 (F6): the feedback loop /debug and debug-agent run, and the architect reviewer's
// `Migrate forward:` command, are suite commands too, so the lock reaches them.
const RUNS = /Run the project (?:build|tests?)|<(?:build|test|unit test|integration test) command|\b(?:run|runs) the (?:build|tests?|test suite)\b|\bRun the feedback loop\b|`Migrate forward:` command/i;
function suiteRunningAgents(agentTexts) {
  return Object.keys(agentTexts).filter((n) => {
    const t = agentTexts[n];
    return ['implement', 'shared'].includes(ownerOf(t)) && /^tools:.*\bBash\b/m.test(t)
      && (RUNS.test(t) || /\bbuild and tests?\b/i.test(flat(t)));
  }).sort();
}
const allAgentTexts = () => Object.fromEntries(agentFiles().map((f) => [f.slice(0, -3), readAgent(f)]));

module.exports = { AGENTS_DIR, readAgent, agentFiles, flat, flatPlain, mustMatch, ownerOf, suiteRunningAgents, allAgentTexts };
