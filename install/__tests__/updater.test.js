'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  reconcileSettings,
  isHarnessHook,
} = require('../install.js');

// ── HB-1: plan-lint-check.js must be recognised as a harness hook ────────────

test('updater_TreatsPlanLintCheckAsHarnessHook', () => {
  // (a) direct classification — control assertion proves the assertion shape is right.
  assert.equal(
    isHarnessHook({ type: 'command', command: 'node "/h/catalog-trigger.js"' }),
    true,
    'control: catalog-trigger.js must be recognised as a harness hook',
  );
  assert.equal(
    isHarnessHook({ type: 'command', command: 'node "/h/plan-lint-check.js"' }),
    true,
    'plan-lint-check.js must be recognised as a harness hook, same as catalog-trigger.js and drift-check.js',
  );

  // (b) consequence — reconcile against settings that already contain the three
  // generated PostToolUse hooks must not duplicate plan-lint-check.js.
  const newHarnessSettings = {
    hooks: {
      PostToolUse: [{
        matcher: 'Write|Edit',
        hooks: [
          { type: 'command', command: 'node "/h/catalog-trigger.js"' },
          { type: 'command', command: 'node "/h/drift-check.js"' },
          { type: 'command', command: 'node "/h/plan-lint-check.js"' },
        ],
      }],
    },
  };

  const existingSettings = {
    hooks: {
      PostToolUse: [{
        matcher: 'Write|Edit',
        hooks: [
          { type: 'command', command: 'node "/h/catalog-trigger.js"' },
          { type: 'command', command: 'node "/h/drift-check.js"' },
          { type: 'command', command: 'node "/h/plan-lint-check.js"' },
        ],
      }],
    },
  };

  const countPlanLintCheck = (settings) => {
    const groups = (settings.hooks && settings.hooks.PostToolUse) || [];
    let count = 0;
    for (const group of groups) {
      for (const h of (group.hooks || [])) {
        if ((h.command || '').includes('plan-lint-check.js')) count++;
      }
    }
    return count;
  };

  const reconciledOnce = reconcileSettings(existingSettings, newHarnessSettings);
  assert.equal(
    countPlanLintCheck(reconciledOnce), 1,
    'plan-lint-check.js must appear exactly once after a single reconcile',
  );

  const reconciledTwice = reconcileSettings(reconciledOnce, newHarnessSettings);
  assert.equal(
    countPlanLintCheck(reconciledTwice), 1,
    'plan-lint-check.js must still appear exactly once after a second reconcile (idempotence)',
  );
});
