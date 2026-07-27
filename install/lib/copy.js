'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { walk } = require('../../hooks/lib/walk.js');

const IS_WINDOWS = process.platform === 'win32';

function copyDirsWithLog(srcRoot, destRoot, label, skipSet = null) {
  const installed = [];
  if (!fs.existsSync(srcRoot)) return installed;
  for (const entry of fs.readdirSync(srcRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (skipSet && skipSet.has(entry.name)) {
      console.log(`    Skipped:   ${label}/${entry.name} (enterprise-only)`);
      continue;
    }
    const destPath = path.join(destRoot, entry.name);
    const existed = fs.existsSync(destPath);
    console.log(`    ${existed ? 'Updating:  ' : 'Installing:'} ${label}/${entry.name}`);
    fs.cpSync(path.join(srcRoot, entry.name), destPath, { recursive: true, force: true });
    const files = walk(destPath, { match: () => true });
    for (const f of files) installed.push(`${label}/${path.relative(destRoot, f)}`);
  }
  return installed;
}

function copyFilesWithLog(srcRoot, destRoot, nameRegex, label, filesOnly = false, skipSet = null) {
  const installed = [];
  if (!fs.existsSync(srcRoot)) return installed;
  for (const entry of fs.readdirSync(srcRoot, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (nameRegex && !nameRegex.test(entry.name)) continue;
    if (filesOnly && entry.isDirectory()) continue;
    if (skipSet && skipSet.has(entry.name)) {
      console.log(`    Skipped:   ${label}/${entry.name} (enterprise-only)`);
      continue;
    }
    const destPath = path.join(destRoot, entry.name);
    const existed = fs.existsSync(destPath);
    console.log(`    ${existed ? 'Updating:  ' : 'Installing:'} ${label}/${entry.name}`);
    fs.copyFileSync(path.join(srcRoot, entry.name), destPath);
    installed.push(`${label}/${entry.name}`);
  }
  return installed;
}

function copyGlob(srcDir, destDir, regex, label) {
  const installed = [];
  if (!fs.existsSync(srcDir)) return installed;
  for (const name of fs.readdirSync(srcDir)) {
    if (!regex.test(name)) continue;
    fs.copyFileSync(path.join(srcDir, name), path.join(destDir, name));
    if (label) installed.push(`${label}/${name}`);
  }
  return installed;
}

function copyTemplatesNoClobber(srcDir, destDir, label) {
  if (!fs.existsSync(srcDir)) return;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const destPath = path.join(destDir, entry.name);
    if (fs.existsSync(destPath)) {
      console.log(`    Skipped (exists): ${label}/${entry.name}`);
    } else {
      fs.copyFileSync(path.join(srcDir, entry.name), destPath);
      console.log(`    Created: ${label}/${entry.name}`);
    }
  }
}

function chmodExecutables(dir) {
  if (IS_WINDOWS) return;
  for (const name of fs.readdirSync(dir)) {
    if (name.endsWith('.sh')) {
      try { fs.chmodSync(path.join(dir, name), 0o755); } catch { /* ignore */ }
    }
  }
}

module.exports = {
  copyDirsWithLog, copyFilesWithLog, copyGlob, copyTemplatesNoClobber, chmodExecutables,
};
