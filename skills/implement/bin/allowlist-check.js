#!/usr/bin/env node
// allowlist-check.js — before the first story of a Feature run starts, list every command the run will
// use that no allow rule covers (F5 #52; ARCHITECTURE.md §6). Background agents show their permission
// prompts in the main session, so one unapproved command stalls an unattended run.
//
// Usage: node allowlist-check.js [--command <cmd>]... [--settings <file>]... [--user-settings <file>]
//   The commands checked: the harness's own (git worktree and merge, git add/commit/push, gh pr create,
//   node for its scripts, bash for the tracker adapters), the build, test and Observe commands from
//   tasks/lessons.md or tasks/notes.md, and any --command given.
//   The rules read: .claude/settings.json, .claude/settings.local.json, --settings files, and the user's
//   ~/.claude/settings.json (or --user-settings).
//
// Output: "missing: <command>  → add "Bash(<rule>)"" per uncovered command (exit 1); "refused: ..." for
// a destructive command, for which no rule is ever proposed (exit 1); nothing when all are covered.
// It only reports. It never writes a settings file: agents cannot raise their own permissions, and a
// person adds the rules.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { lessonsFile } = require('./settings.js');

// The harness's own commands in a Feature run, each with the rule that covers it.
const HARNESS = [
  ['git worktree add <path> -b <branch> <base>', 'git worktree add'],
  ['git worktree remove <path>', 'git worktree remove'],
  ['git merge --no-ff --no-commit <story branch>', 'git merge'],
  ['git branch -d <story branch>', 'git branch -d'],
  ['git add <files>', 'git add'],
  ['git commit -m <message>', 'git commit'],
  ['git push -u origin <feature branch>', 'git push'],
  ['gh pr create --base main --head <feature branch>', 'gh pr create'],
  ['node <skill-dir>/bin/<script>.js', 'node'],
  ['bash trackers/active/<script>.sh', 'bash'],
];

// Never allowed, never proposed: the same commands safety-check.js blocks.
const DESTRUCTIVE = [
  /\bgit\s+push\b.*(\s--force\b|\s-f\b|\s--force-with-lease\b)/,
  /\bgit\s+worktree\s+remove\b.*(\s--force\b|\s-f\b)/,
  /\bgit\s+branch\b.*\s-D\b/,
  /\bgit\s+reset\b.*\s--hard\b/,
  /\bgit\s+clean\b.*\s-[a-z]*f/,
  /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/,
];

// The command lines in the lessons/notes file that a run executes.
const COMMAND_KEYS = /^(build|unit tests|integration tests|setup|cleanup|e2e command|start the app|screenshot|custom test script)$/i;

function collectProjectCommands(root) {
  const file = lessonsFile(root);
  if (!file) return [];
  const found = [];
  for (const line of fs.readFileSync(file, 'utf8').replace(/\r/g, '').split('\n')) {
    const m = line.match(/^\s*-\s+([^:]+):\s*`([^`]+)`/);
    if (!m || !COMMAND_KEYS.test(m[1].trim())) continue;
    const cmd = m[2].trim();
    if (cmd === '' || /^<!--/.test(cmd) || /not applicable/i.test(cmd)) continue;
    found.push([cmd, cmd]);
  }
  return found;
}

/** Does one allow rule cover the command? Bash(x:*) is a prefix, Bash(x *) a wildcard, Bash(x) exact. */
function covers(rule, command) {
  if (rule === 'Bash' || rule === 'Bash(*)') return true;
  const m = rule.match(/^Bash\((.*)\)$/);
  if (!m) return false;
  const body = m[1];
  if (body.endsWith(':*')) {
    const prefix = body.slice(0, -2);
    return command === prefix || command.startsWith(prefix + ' ');
  }
  if (body.includes('*')) {
    const re = new RegExp('^' + body.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
    return re.test(command);
  }
  return command === body;
}

function readAllow(file) {
  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(json?.permissions?.allow) ? json.permissions.allow : [];
  } catch { return []; }
}

function main() {
  const argv = process.argv.slice(2);
  const extraCommands = [];
  const settingsFiles = [path.join('.claude', 'settings.json'), path.join('.claude', 'settings.local.json')];
  let userSettings = path.join(os.homedir(), '.claude', 'settings.json');
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i + 1] === undefined) { process.stderr.write(`${argv[i]} needs a value\n`); process.exit(2); }
    if (argv[i] === '--command') extraCommands.push(argv[i + 1]);
    else if (argv[i] === '--settings') settingsFiles.push(argv[i + 1]);
    else if (argv[i] === '--user-settings') userSettings = argv[i + 1];
    else { process.stderr.write(`unknown argument: ${argv[i]}\n`); process.exit(2); }
  }
  const rules = [...settingsFiles, userSettings].flatMap(readAllow);

  const lines = [];
  let problems = 0;
  const all = [...HARNESS, ...collectProjectCommands(process.cwd()), ...extraCommands.map((c) => [c, c])];
  // The same command can be named twice (a unit-test command that is also the e2e command): list it once.
  const commands = all.filter(([shown], i) => all.findIndex(([s]) => s === shown) === i);
  for (const [shown, sample] of commands) {
    if (DESTRUCTIVE.some((re) => re.test(sample))) {
      lines.push(`refused: "${shown}" is destructive and is never allowed; the run does not need it`);
      problems++;
      continue;
    }
    const probe = sample.replace(/<[^>]+>/g, 'x');
    if (rules.some((r) => covers(r, probe) || covers(r, sample))) continue;
    lines.push(`missing: ${shown}  → add "Bash(${sample.replace(/\s*<[^>]+>.*$/, '')}:*)"`);
    problems++;
  }
  if (rules.some((r) => r === 'Bash' || r === 'Bash(*)')) {
    lines.push('note: an allow rule of plain "Bash" lets every command through; the harness never needs it, and the narrower rules above are enough');
  }
  if (lines.length) process.stdout.write(lines.join('\n') + '\n');
  process.exit(problems ? 1 : 0);
}

if (require.main === module) main();

module.exports = { covers, HARNESS, DESTRUCTIVE };
