// Tests for the dogfood link plan — see scripts/dogfood.js.
//
// Written before the fix, per the discipline this repo ships.
//
// The bug: `npm run dogfood` linked only skills/agents/hooks/rules. `.claude/trackers/active/` and
// `.claude/code-platform/active/` stayed as COPIES made at install time, so every edit to
// `trackers/<name>/*.sh` was invisible to the running harness. A real `/implement` run found the two
// halves of one adapter out of sync with each other — `get-issue.sh` dated Sep 2, `create-issue.sh`
// dated Aug 5 — meaning a fix could be shipped, tested green, and still be dead code from the
// harness's own point of view. Same class of failure as skill shadowing: what runs is not what we edit.
//
// The adapter dirs cannot be linked wholesale: the installer flattens ONE chosen adapter into
// `active/`, so the link has to point at the selected adapter, which comes from the manifest.

const test = require('node:test');
const assert = require('node:assert');

const { planLinks } = require('../../scripts/dogfood-links');

test('planLinks_AlwaysLinksTheFourStaticDirs', () => {
  const links = planLinks({ tracker: 'local', codePlatform: 'github' });
  const froms = links.map((l) => l.from);
  for (const dir of ['skills', 'agents', 'hooks', 'rules']) {
    assert.ok(froms.includes(dir), `expected ${dir} to be linked`);
  }
});

test('planLinks_LinksTrackerActiveToTheSelectedAdapter', () => {
  const links = planLinks({ tracker: 'local', codePlatform: 'github' });
  const entry = links.find((l) => l.from === 'trackers/active');
  assert.ok(entry, 'trackers/active must be linked — otherwise adapter edits never reach the harness');
  assert.equal(entry.to, 'trackers/local');
});

test('planLinks_LinksCodePlatformActiveToTheSelectedPlatform', () => {
  const links = planLinks({ tracker: 'local', codePlatform: 'github' });
  const entry = links.find((l) => l.from === 'code-platform/active');
  assert.ok(entry, 'code-platform/active must be linked');
  assert.equal(entry.to, 'code-platform/github');
});

// The shared lib/ sits alongside active/ and is equally a copy.
test('planLinks_LinksTheSharedAdapterLibs', () => {
  const links = planLinks({ tracker: 'local', codePlatform: 'github' });
  const froms = links.map((l) => l.from);
  assert.ok(froms.includes('trackers/lib'), 'trackers/lib must be linked');
  assert.ok(froms.includes('code-platform/lib'), 'code-platform/lib must be linked');
});

// Without a manifest we cannot know which adapter was selected, and guessing would silently point
// the harness at the wrong tracker — far worse than leaving the copy in place.
test('planLinks_UnknownTracker_SkipsAdapterLinksButKeepsStaticOnes', () => {
  const links = planLinks({});
  const froms = links.map((l) => l.from);
  assert.ok(froms.includes('skills'), 'static dirs must still be linked');
  assert.ok(!froms.some((f) => f.startsWith('trackers/')), 'must not guess a tracker adapter');
  assert.ok(!froms.some((f) => f.startsWith('code-platform/')), 'must not guess a code platform');
});

test('planLinks_EveryEntryHasARelativeDepthCorrectTarget', () => {
  const links = planLinks({ tracker: 'ado', codePlatform: 'github' });
  for (const l of links) {
    // .claude/<from> -> repo-root/<to>. One '..' per path segment in `from`, plus one to escape
    // .claude itself. A wrong depth produces a link that resolves to nothing and fails silently.
    const expectedDepth = l.from.split('/').length;
    assert.equal(
      l.relative,
      '../'.repeat(expectedDepth) + l.to,
      `${l.from} must climb ${expectedDepth} levels to reach ${l.to}`
    );
  }
});
