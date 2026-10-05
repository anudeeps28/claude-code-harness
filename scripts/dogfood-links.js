// @ts-check
// The dogfood link plan: which .claude/ paths point back at repo source, and where each points.
//
// Split out of dogfood.js so it can be tested without touching the filesystem.
//
// WHY THE ADAPTER DIRS ARE HERE
//
// Dogfooding originally linked only skills/agents/hooks/rules. `.claude/trackers/active/` and
// `.claude/code-platform/active/` stayed as copies taken at install time, so every edit to
// `trackers/<name>/*.sh` was invisible to the running harness — the fix could be written, tested
// green, and still be dead code from the harness's own point of view. A real `/implement` run found
// the two halves of one adapter out of sync with each other (`get-issue.sh` current, `create-issue.sh`
// five weeks stale), which is the failure mode this prevents.
//
// They cannot be linked wholesale: the installer flattens ONE chosen adapter into `active/`, so the
// link must point at the selected adapter, which is only knowable from the manifest.

const STATIC_DIRS = ['skills', 'agents', 'hooks', 'rules'];

/**
 * @typedef {object} Link
 * @property {string} from     path under .claude/, e.g. "trackers/active"
 * @property {string} to       path under the repo root, e.g. "trackers/local"
 * @property {string} relative link target relative to the link's own location
 */

/**
 * @param {string} from
 * @param {string} to
 * @returns {Link}
 */
function link(from, to) {
  // .claude/<from> -> <repo root>/<to>. One '..' per segment of `from` (to climb back out of any
  // nesting) plus one more to escape `.claude` itself — which is exactly `from`'s segment count,
  // since `.claude/a/b` needs '../../..' to reach the root.
  const depth = from.split('/').length;
  return { from, to, relative: '../'.repeat(depth) + to };
}

/**
 * Build the link plan for a project.
 *
 * An unknown tracker or code platform yields no adapter links rather than a guess: pointing the
 * harness at the wrong adapter is far worse than leaving an honest copy in place.
 *
 * @param {{tracker?: string|null, codePlatform?: string|null}} manifest
 * @returns {Link[]}
 */
function planLinks({ tracker, codePlatform } = {}) {
  /** @type {Link[]} */
  const links = STATIC_DIRS.map((d) => link(d, d));

  if (tracker) {
    links.push(link('trackers/active', `trackers/${tracker}`));
    links.push(link('trackers/lib', 'trackers/lib'));
  }
  if (codePlatform) {
    links.push(link('code-platform/active', `code-platform/${codePlatform}`));
    links.push(link('code-platform/lib', 'code-platform/lib'));
  }
  return links;
}

module.exports = { planLinks, STATIC_DIRS };
