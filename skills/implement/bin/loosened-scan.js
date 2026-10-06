#!/usr/bin/env node
// loosened-scan.js — the list half of loosened-reviewer-agent (F6 #58): every check, gate, skip,
// exemption or baseline the branch relaxed, and everything that will cost money or change operations
// once deployed. The agent judges each one; this finds them, so none is missed.
//
// Usage: node loosened-scan.js --base <ref> [--path <work folder>]
//
// Output, one line each:
//   loosened: <file>:<line>  <kind>  reason: none           (no reason written next to it: a finding)
//   loosened: <file>:<line>  <kind>  reason: "<the reason>"
//   ops: <file>:<line>  <kind>  <the line, trimmed>
// Exit 1 when a loosening has no reason, else 0. Exit 2: usage error.

const path = require('node:path');
const { added, addedFiles } = require('./diff-lines.js');

const LOOSEN = [
  ['test skipped', /\b(it|test|describe|context)\.(skip|todo)\s*\(|\bx(it|describe|test)\s*\(|@(Ignore|Disabled)\b|\[Ignore\b|\bSkip\s*=\s*"|pytest\.mark\.(skip|xfail)|@unittest\.skip|\bt\.Skip(Now|f)?\s*\(|#\[ignore\]|\{\s*skip:\s*true/],
  ['check switched off', /eslint-disable|@ts-(ignore|nocheck|expect-error)|#\s*noqa|#\s*type:\s*ignore|#pragma warning disable|\/\/\s*nolint|SuppressMessage|rubocop:disable|istanbul ignore|c8 ignore|pragma: no cover|NOSONAR/],
  ['gate bypassed', /--no-verify|continue-on-error:\s*true|allow_failure:\s*true|--passWithNoTests|\|\|\s*true\b|--skip-tests?\b|-DskipTests|SkipTests/i],
  ['baseline changed', /(coverage|threshold|fail_under|fail-under|baseline)[^\n]*[:=]\s*["']?\d/i],
];

const OPS = [
  ['new schedule', /^\s*(-\s*)?cron:|^\s*schedule:|\bkind:\s*CronJob\b|TimerTrigger|@Scheduled\b|\b(rate|cron)\(/],
  ['new cloud resource', /^\s*resource\s+["'\w]|^\s*Type:\s*['"]?AWS::|"type":\s*"Microsoft\.|^\s*kind:\s*(Deployment|StatefulSet|DaemonSet|Service|Ingress)\b/],
];
const OPS_FILES = [
  ['new pipeline', /^\.github\/workflows\/|azure-pipelines|\.gitlab-ci|Jenkinsfile|\.circleci\//i],
  ['new container', /(^|\/)(Dockerfile|docker-compose[\w.-]*\.ya?ml)$/i],
  ['new infrastructure file', /\.(tf|bicep)$/i],
];

// A reason is words written beside the loosening: after the marker on the same line, or on the line
// just above as a comment. A bare marker, or a comment that only repeats it, is no reason.
function reasonFor(rec) {
  const after = rec.text.match(/(?:--|\/\/|#|\/\*|reason[:=])\s*([A-Za-z][^*]{8,}?)\s*(\*\/)?\s*$/i);
  const above = rec.before.match(/^\s*(?:\/\/|#|\*|--|<!--)\s*(.{8,}?)\s*(-->)?\s*$/);
  const pick = [after && after[1], above && above[1]].find((t) => t && /\s/.test(t) && !/^(eslint|@ts-|noqa|nolint|istanbul|c8|pragma)/i.test(t));
  return pick ? pick.trim().slice(0, 120) : null;
}

function scan(cwd, base) {
  const lines = [];
  let unexplained = 0;
  for (const rec of added(cwd, base)) {
    const loose = LOOSEN.find(([, re]) => re.test(rec.text));
    if (loose) {
      const reason = reasonFor(rec);
      if (!reason) unexplained++;
      lines.push(`loosened: ${rec.file}:${rec.line}  ${loose[0]}  reason: ${reason ? JSON.stringify(reason) : 'none'}`);
    }
    const ops = OPS.find(([, re]) => re.test(rec.text));
    if (ops) lines.push(`ops: ${rec.file}:${rec.line}  ${ops[0]}  ${rec.text.trim().slice(0, 120)}`);
  }
  for (const file of addedFiles(cwd, base)) {
    const ops = OPS_FILES.find(([, re]) => re.test(file));
    if (ops) lines.push(`ops: ${file}:1  ${ops[0]}  (file added)`);
  }
  return { lines, unexplained };
}

function main() {
  const argv = process.argv.slice(2);
  const o = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--') || argv[i + 1] === undefined) { process.stderr.write(`bad argument: ${argv[i]}\n`); process.exit(2); }
    o[argv[i].slice(2)] = argv[i + 1];
  }
  if (!o.base) { process.stderr.write('usage: loosened-scan.js --base <ref> [--path <work folder>]\n'); process.exit(2); }
  const { lines, unexplained } = scan(path.resolve(o.path || '.'), o.base);
  if (lines.length) process.stdout.write(lines.join('\n') + '\n');
  process.exit(unexplained ? 1 : 0);
}

if (require.main === module) main();

module.exports = { scan, reasonFor };
