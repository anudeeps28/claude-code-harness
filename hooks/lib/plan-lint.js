// @ts-check
// Lints a <tasks> XML plan for violations of the test-first red-window rule.
// Pure function: no filesystem access, no network access.

// Pulls attribute name/value pairs out of a task's opening-tag attribute string.
function parseAttributes(attrString) {
  const attrs = {};
  const re = /([\w-]+)\s*=\s*(?:"([^"]{0,2048})"|'([^']{0,2048})')/g;
  let m;
  while ((m = re.exec(attrString)) !== null) {
    attrs[m[1]] = m[2] !== undefined ? m[2] : m[3];
  }
  return attrs;
}

const FILES_RE = /<files>([\s\S]*?)<\/files>/;
const READ_FIRST_RE = /<read_first>([\s\S]*?)<\/read_first>/;

// Reads a single child element's text, non-greedy; returns '' if absent.
function readChild(body, re) {
  const m = re.exec(body);
  return m ? m[1].trim() : '';
}

// Splits a <files> body into a trimmed, non-empty list of file entries.
function parseFiles(filesText) {
  return filesText
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

// Walks the <task> elements of the plan and builds a normalized task list.
function parseTasks(planXml) {
  const tasks = [];
  const re = /<task\b([^>]{0,2048})>([\s\S]*?)<\/task>/g;
  let m;
  while ((m = re.exec(planXml)) !== null) {
    const attrs = parseAttributes(m[1]);
    const body = m[2];
    const wave = Number(attrs.parallel_group);
    if (!Number.isFinite(wave)) continue;
    tasks.push({
      id: attrs.id,
      wave,
      mustFail: String(attrs.must_fail).trim().toLowerCase() === 'true',
      files: parseFiles(readChild(body, FILES_RE)),
      readFirst: readChild(body, READ_FIRST_RE),
    });
  }
  return tasks;
}

const internals = { parseTasks };

// Real plans are ~9KB; this is ~28x headroom (256 KiB).
const MAX_PLAN_CHARS = 262144;

function lintRedWindow(planXml) {
  if (typeof planXml !== 'string' || planXml.length === 0) return [];
  if (planXml.length > MAX_PLAN_CHARS) {
    return [
      {
        rule: 'input_too_large',
        taskId: null,
        message: `Plan is ${planXml.length} chars, above the ${MAX_PLAN_CHARS}-char lint cap — not checked.`,
      },
    ];
  }
  try {
    const tasks = internals.parseTasks(planXml);
    const mustFailTasks = tasks.filter((t) => t.mustFail);
    const violations = [];

    for (const task of mustFailTasks) {
      const siblings = tasks.filter((t) => t !== task && t.wave === task.wave);
      if (siblings.length > 0) {
        violations.push({
          rule: 'must_fail_not_alone',
          taskId: task.id,
          message: `Task ${task.id} carries must_fail="true" but shares parallel_group ${task.wave} with another task.`,
        });
      }

      const nextWave = task.wave + 1;
      const nextWaveTasks = tasks.filter((t) => t.wave === nextWave);
      if (nextWaveTasks.length === 0) {
        violations.push({
          rule: 'no_implementation_next_wave',
          taskId: task.id,
          message: `Task ${task.id} carries must_fail="true" in wave ${task.wave} but no task exists in wave ${nextWave} to implement it.`,
        });
      } else {
        // Rule 2 is an "every" check, not a "some" check: the wave that closes the red
        // window belongs to the implementation and nothing else, so a single task there
        // that does not read the failing test is already a violation. Entries are
        // compared for equality after splitting — a path that merely CONTAINS the test
        // path as a substring does not count as listing it.
        const everyTaskReads = nextWaveTasks.every((t) =>
          parseFiles(t.readFirst).some((entry) => task.files.includes(entry))
        );
        if (!everyTaskReads) {
          violations.push({
            rule: 'no_implementation_next_wave',
            taskId: task.id,
            message: `Task ${task.id} carries must_fail="true" in wave ${task.wave} but a task in wave ${nextWave} does not read its files first.`,
          });
        }
      }
    }

    const orderedMustFail = mustFailTasks.slice().sort((a, b) => a.wave - b.wave);
    let previousClosingWave = null;
    for (const task of orderedMustFail) {
      if (previousClosingWave !== null && task.wave <= previousClosingWave) {
        violations.push({
          rule: 'overlapping_red_windows',
          taskId: task.id,
          message: `Task ${task.id} in wave ${task.wave} overlaps the red window opened by an earlier must_fail task.`,
        });
      }
      previousClosingWave = task.wave + 1;
    }

    return violations;
  } catch (e) {
    return [
      {
        rule: 'lint_error',
        taskId: null,
        message: `Plan lint failed: ${e && e.message ? e.message : String(e)}`,
      },
    ];
  }
}

module.exports = { lintRedWindow, MAX_PLAN_CHARS, __internals: internals };
