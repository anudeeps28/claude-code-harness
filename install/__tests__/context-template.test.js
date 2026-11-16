'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const INSTALL_JS = path.resolve(__dirname, '..', 'install.js');
const REPO = path.resolve(__dirname, '..', '..');

// Interactive project install: each prompt is answered when it appears, because the installer reads
// one answer per question and drops early lines. The task list goes in local files and pull requests
// nowhere, so the install needs no tracker CLI (td, gh, az) on the machine running the test; any
// other numbered choice gets "2" and anything else "y" (which says yes to the CONTEXT.md offer).
function answerFor(block) {
  const question = block.split('\n').pop();
  if (!/\[[\d/]+\]/.test(question)) return 'y';
  if (/task list live/.test(block)) return '1';
  if (/pull requests live/.test(block)) return '3';
  return '2';
}

function installInteractive(dir, home) {
  return new Promise((resolve, reject) => {
    // HOME and USERPROFILE point at a temp folder, so the run never touches the developer's own home.
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    const child = spawn(process.execPath, [INSTALL_JS, '--project', dir, '--local', REPO], { env });
    const guard = setTimeout(() => { child.kill(); reject(new Error('install did not finish in 60s')); }, 60_000);
    let pending = '';
    let stdout = '';
    child.stdout.on('data', (chunk) => {
      pending += chunk;
      stdout += chunk;
      if (/[:\]] $/.test(pending)) {
        const answer = answerFor(pending);
        pending = '';
        child.stdin.write(`${answer}\n`);
      }
    });
    child.on('error', reject);
    child.on('close', (code) => { clearTimeout(guard); resolve({ stdout, code }); });
  });
}

function tempProject() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'context-install-'));
}

// Runs the install in a fresh project folder with a fresh home, and removes both afterwards.
async function withInstall(setup, check) {
  const dir = tempProject();
  const home = tempProject();
  try {
    if (setup) setup(dir);
    const run = await installInteractive(dir, home);
    assert.strictEqual(run.code, 0, `install exited ${run.code}: ${run.stdout}`);
    check(dir, run);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test('install copies the CONTEXT.md template, opening with the Architecture map (AC7)', () =>
  withInstall(null, (dir) => {
    const text = fs.readFileSync(path.join(dir, 'CONTEXT.md'), 'utf8');
    const firstHeading = text.split(/\r?\n/).find((l) => l.startsWith('## '));
    assert.strictEqual(firstHeading, '## Architecture map');
  }));

test('install does not clobber an existing CONTEXT.md (AC7)', () => {
  const mine = '# My own context\n\n## Architecture map\n\nkeep me\n';
  return withInstall((dir) => fs.writeFileSync(path.join(dir, 'CONTEXT.md'), mine), (dir, run) => {
    assert.strictEqual(fs.readFileSync(path.join(dir, 'CONTEXT.md'), 'utf8'), mine);
    assert.ok(/Skipped \(exists\): CONTEXT\.md/.test(run.stdout), 'install reported it skipped the existing file');
  });
});
