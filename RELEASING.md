# Releasing

How to cut a release of the harness, and how to decide which number to move.

Releases are cheap — the whole procedure is four files and a tag. What is *not* cheap is a release where those four disagree, because nothing downstream can then tell which version a user is actually on.

---

## Where the version is recorded

Four places, and they must agree at every tagged commit:

| Where | Written by | Read by |
|---|---|---|
| `VERSION` | you, by hand | `/update-harness` — compares it against the installed version to decide whether an update exists ([install/lib/updater.js](install/lib/updater.js)) |
| `package.json` `version` | you, by hand | npm tooling; it is the number a contributor sees first |
| the git tag `vX.Y.Z` | you, by hand | anyone pinning an install to a release |
| `.claude/.harness-manifest.json` `harnessVersion` | the installer, automatically | `/update-harness`, as the "currently installed" side of the comparison |

You edit the first three. The fourth is a build artifact — never hand-edit it; it records what a user installed, so on your own dogfood install it legitimately lags `VERSION` until you re-install.

These drifted once already — `VERSION` said 3.1.0, `package.json` said 2.0.0, and the tag said v2.0.0 — because nothing compared them. [hooks/inventory-check.js](hooks/inventory-check.js) now does: a commit that stages `VERSION` is blocked if `package.json` disagrees, or if the changelog's `[Unreleased]` section is empty.

---

## Which number moves

Standard semver, read from the installing user's point of view — *what breaks for someone who runs `/update-harness`?*

| Bump | When | Examples |
|---|---|---|
| **MAJOR** — `X.0.0` | A breaking change. Something a user relies on stops working the way it did, and they have to do something about it. | A schema version bump a consumer must be upgraded in lockstep with; renaming or removing a skill, agent, or rule; changing an adapter's script contract; a settings key that is no longer read. |
| **MINOR** — `x.Y.0` | New capability, nothing breaks. | A new skill, agent, hook, rule, or tracker adapter; a new flag on an existing skill; a new optional setting. |
| **PATCH** — `x.y.Z` | A fix or an internal change with no new surface. | Bug fixes, doc corrections, test additions, refactors, performance work. |

Two judgement calls worth settling in advance:

- **Removing a skill is MAJOR**, even when its behavior was folded into another skill. Someone's muscle memory, notes, or scripts reference the old name, and after the update it is simply gone.
- **A deliberate behavior narrowing is MAJOR**, even when it is an improvement. If a run that used to produce four things now produces one, that is breaking for whoever depended on four.

When genuinely torn, pick the larger bump. A too-large version number costs nothing; a too-small one tells users a breaking change is safe.

---

## The procedure

Releases happen on their own branch and PR, exactly like any other change — never directly on `main`.

**1. Freeze the changelog.**

Rename the `## [Unreleased]` heading to the version and date, and open a fresh empty `[Unreleased]` above it:

```markdown
## [Unreleased]

## [3.3.0] - 2026-09-21
```

Read the entries as you go. If what is under `[Unreleased]` describes a breaking change, this is the moment you find out the bump is MAJOR, not MINOR.

**2. Set `VERSION`** to the new number — no leading `v`, no trailing text.

**3. Set `package.json` `version`** to the same string. The commit hook blocks you if these two disagree, so there is no way to forget this one silently.

**4. Commit, push, open the PR, and merge.**

```bash
git checkout -b chore/release-3.3.0
git add VERSION package.json CHANGELOG.md
git commit -m "chore: release 3.3.0"
```

**5. Tag the merge commit on `main`**, after the PR merges — never the branch commit, so the tag points at what actually shipped:

```bash
git checkout main && git pull
git tag v3.3.0
git push origin v3.3.0
```

---

## Before you start

The release commit is not the place to discover a broken suite:

```bash
npm test && npm run lint
```

Both must be clean. The commit hook also checks that the README's skill and agent counts still match the tree — a release that ships a wrong count is the most-read wrong fact in the repo.

---

## What not to do

- **Never hand-edit `.claude/.harness-manifest.json`.** It is written by the installer and describes an installation, not the source.
- **Never tag a branch commit.** Tag the merge commit on `main`, so the tag and the shipped history are the same thing.
- **Never leave `[Unreleased]` empty at a bump.** The hook blocks it, and the reason is that `/update-harness` shows users that section verbatim as the "what's new" text. Empty means they are asked to update for no stated reason.
- **Never bump the version in a feature PR.** Version bumps are their own change, so `git log VERSION` reads as a clean list of releases.
