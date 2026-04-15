// Shared I/O helpers for Claude Code hooks.
// Hooks receive JSON on stdin; respond via stdout JSON and/or exit code.
//
// Hardening (v1.3): every hook is wrapped in `runHook(...)` which adds:
//   - 5s timeout (fail-open: exits 0, never blocks Claude)
//   - try/catch around the hook body (fail-open)
//   - unhandled rejection / uncaught exception handlers
//   - per-invocation metric appended to tasks/metrics.jsonl

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const STDIN_TIMEOUT_MS = 500;
const HOOK_TIMEOUT_MS = 5000;
const ROTATION_MAX_BYTES = 10 * 1024 * 1024;
const ROTATION_KEEP = 5;

let currentHookName = 'unknown';
let hookStartedAt = 0;

function readStdinJson() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      resolve({});
      return;
    }
    let data = '';
    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const timer = setTimeout(() => settle({}), STDIN_TIMEOUT_MS);
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => {
      clearTimeout(timer);
      if (!data.trim()) return settle({});
      try { settle(JSON.parse(data)); }
      catch (e) {
        process.stderr.write(JSON.stringify({
          error: 'stdin_parse_failed',
          hook: currentHookName,
          message: e.message,
        }) + '\n');
        settle({});
      }
    });
    process.stdin.on('error', (e) => {
      clearTimeout(timer);
      process.stderr.write(JSON.stringify({
        error: 'stdin_read_failed',
        hook: currentHookName,
        message: e.message,
      }) + '\n');
      settle({});
    });
  });
}

// Records a single hook invocation to tasks/metrics.jsonl. Best-effort: a
// failed write logs to stderr and never throws.
function recordMetric({ decision, rule } = {}) {
  const workRoot = process.env.CLAUDE_HARNESS_WORK_ROOT;
  if (!workRoot) return;
  const metricsPath = path.join(workRoot, 'tasks', 'metrics.jsonl');
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    hook: currentHookName,
    duration_ms: Date.now() - hookStartedAt,
    decision: decision || 'allow',
    ...(rule ? { rule } : {}),
  });
  appendWithRotation(metricsPath, line);
}

// Append a line to a JSONL file, rotating at ROTATION_MAX_BYTES.
// On Windows the rename may fail if the file is locked by another process —
// in that case we just append to the oversized file (rotation is best-effort).
function appendWithRotation(filePath, line, opts = {}) {
  const maxBytes = opts.maxBytes || ROTATION_MAX_BYTES;
  const keep = opts.keep || ROTATION_KEEP;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    if (fs.existsSync(filePath) && fs.statSync(filePath).size >= maxBytes) {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const rotated = filePath.replace(/\.jsonl$/, `.${ts}.jsonl`);
      try {
        fs.renameSync(filePath, rotated);
        spawnGzip(rotated);
        pruneOldRotations(filePath, keep);
      } catch { /* rename lost the race or failed — append to oversized file */ }
    }
    fs.appendFileSync(filePath, line.endsWith('\n') ? line : line + '\n');
  } catch (e) {
    process.stderr.write(JSON.stringify({
      error: 'log_append_failed',
      file: filePath,
      message: e.message,
    }) + '\n');
  }
}

function spawnGzip(filePath) {
  // Detached child gzips the rotated file then deletes the original.
  // Don't await — the hook is exiting and gzip may take a few seconds on a 10MB file.
  const script =
    'const fs=require("fs");const z=require("zlib");' +
    'const src=' + JSON.stringify(filePath) + ';' +
    'fs.createReadStream(src).pipe(z.createGzip()).pipe(fs.createWriteStream(src+".gz"))' +
    '.on("finish",()=>{try{fs.unlinkSync(src);}catch{}});';
  const child = spawn(process.execPath, ['-e', script], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

function pruneOldRotations(filePath, keep) {
  try {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, '.jsonl');
    const entries = fs.readdirSync(dir)
      .filter(f => f.startsWith(base + '.') && (f.endsWith('.jsonl.gz') || f.endsWith('.jsonl')))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    for (const old of entries.slice(keep)) {
      try { fs.unlinkSync(path.join(dir, old.name)); } catch { /* ignore */ }
    }
  } catch { /* prune is best-effort */ }
}

// PreToolUse deny — exit 2 + JSON on stdout. Prevents the tool call.
function deny(reason, rule) {
  recordMetric({ decision: 'deny', rule });
  process.stdout.write(JSON.stringify({ decision: 'deny', reason }));
  process.exit(2);
}

// PostToolUse block — tells Claude to stop and address before further work.
// Does not (and cannot) undo the edit that already ran.
function blockPost(reason) {
  recordMetric({ decision: 'block' });
  process.stdout.write(JSON.stringify({ decision: 'block', reason }));
  process.exit(0);
}

// Soft context injection — hint without blocking.
function injectContext(hookEventName, additionalContext) {
  recordMetric({ decision: 'inject' });
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName, additionalContext },
  }));
  process.exit(0);
}

function ok() {
  recordMetric({ decision: 'allow' });
  process.exit(0);
}

// Fail-open envelope. A timed-out or crashed hook must NOT block Claude:
// a safety hook that denies everything is a self-inflicted DoS.
function runHook(hookName, fn) {
  currentHookName = hookName;
  hookStartedAt = Date.now();

  process.on('uncaughtException', (e) => {
    process.stderr.write(JSON.stringify({
      error: 'uncaught_exception',
      hook: hookName,
      message: e.message,
      stack: e.stack,
    }) + '\n');
    try { recordMetric({ decision: 'error' }); } catch { /* ignore */ }
    process.exit(0);
  });
  process.on('unhandledRejection', (e) => {
    const msg = e && e.message ? e.message : String(e);
    process.stderr.write(JSON.stringify({
      error: 'unhandled_rejection',
      hook: hookName,
      message: msg,
    }) + '\n');
    try { recordMetric({ decision: 'error' }); } catch { /* ignore */ }
    process.exit(0);
  });

  const timer = setTimeout(() => {
    process.stderr.write(JSON.stringify({
      error: 'hook_timeout',
      hook: hookName,
      timeout_ms: HOOK_TIMEOUT_MS,
    }) + '\n');
    try { recordMetric({ decision: 'timeout' }); } catch { /* ignore */ }
    process.exit(0);
  }, HOOK_TIMEOUT_MS);
  timer.unref();

  Promise.resolve()
    .then(() => fn())
    .catch((e) => {
      process.stderr.write(JSON.stringify({
        error: 'hook_exception',
        hook: hookName,
        message: e.message,
        stack: e.stack,
      }) + '\n');
      try { recordMetric({ decision: 'error' }); } catch { /* ignore */ }
      process.exit(0);
    });
}

module.exports = {
  readStdinJson,
  deny,
  blockPost,
  injectContext,
  ok,
  runHook,
  recordMetric,
  appendWithRotation,
};
