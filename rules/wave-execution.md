# Shared working directory — Harness Rule

This file is the **single source of truth** for how a build run shares its working directory with
everything else that writes to it: where the build agents run, what is checked before each story, what
the run's starting tree is, and what happens to a failed attempt's edits. (The file keeps its old name,
`rules/wave-execution.md`, from before the story executor was retired; nothing in it concerns that
executor any more.)

**Location:** `rules/wave-execution.md` (installed alongside `.claude/skills/`).
**Referenced by:** `skills/implement/SKILL.md`.

---

## Build agents run in the orchestrator's working directory

The agents that build a story (`story-builder`, `suite-runner`) are spawned in the **foreground with no
isolation** — they run directly in the orchestrator's working directory, on its branch: the project root
on `implement/<id>` for a standalone story, the Feature worktree for a Feature's stories. One story is
in flight at a time, so nothing in the directory is written by two agents at once.

**Do not spawn them with `isolation: "worktree"`.** An isolated worktree is created from the **default
branch** and can only ever see **committed** state, while a story's tests and code are written step
by step and committed only when the story's review is clean. So a later step would be given a copy of
the project that lacked the very files the earlier step wrote: the run would halt for a reason that had
nothing to do with the code. Worktrees also strand a failed agent's work in hidden
`.claude/worktrees/` directories that nothing collects. The protection worktrees were meant to
provide is provided by the story loop itself: one story at a time, with the checks below.

A Feature's stories are built one after another in the one Feature worktree, and the
`isolation: "worktree"` ban holds there too (`rules/git-worktrees.md`).

---

## Before each story

### Branch-drift check (before the loop and before every story, no exceptions)

```bash
git branch --show-current
```

If this is not the branch the run created, **stop immediately** — do not start the story. Another
session sharing this working directory has switched the branch, and every step you start now writes
feature work onto someone else's branch. Report the expected branch, the actual branch, and stop.

This is never ambiguous and is never self-answered, including under `rules/autonomous-mode.md`: a
branch changing mid-run is a **contradiction** pause-anyway trigger.

---

## The run's starting tree

**Compare against the run's own starting state, not against a clean tree.** At startup, before the
first builder, record the dirty tree:

```bash
git status --porcelain > "$RUN_BASELINE"     # e.g. tasks/stories/<id>/.tree-baseline
```

Then after the code step and after every fix, compare:

```bash
git status --porcelain | grep -Fxv -f "$RUN_BASELINE"
```

Only paths that appear **now but were not dirty when the run started** are candidate strays.

**Hand that baseline path to every agent that checks the tree** — the acceptance and evaluator agents
run the same comparison and cannot find the file on their own. It lives under `tasks/stories/<id>/`,
which is gitignored, so it is invisible to anything that goes looking rather than being told. A real
review agent reported the baseline "does not exist on disk" while it sat at exactly that path, and
fell back to its own snapshot; it reached the right answer by luck of a careful fallback.

**Known limit: this check is per-path, not per-hunk.** It cannot see a change made *inside* a file
that was already dirty at startup, so an edit there is neither flagged nor exonerated. In a real run
an evaluator attributed a pre-existing edit to the story on exactly this basis. When the tree starts
dirty, the diff of an already-dirty file is not evidence about this run either way — say so rather
than reasoning from it.

This baseline is not a nicety. The startup check below deliberately allows a dirty tree — "a dirty
tree is often YOUR_NAME's own scratch work, so the call is theirs" — and a run legitimately proceeds
with dozens of pre-existing modified files. Comparing the raw `git status` against the story's files
then flags every one of them, so a rule meant to catch a rare scope violation instead orders a
**stop after every step of every run in a dirty tree**.

Every *newly* changed path should be one a builder reported or the story's `**Files:**` names. A path
that appears here but is named by **neither** means an agent edited outside its scope. Surface it
loudly, name the file, and **stop**: it will otherwise ship inside the story's diff unnoticed. Ignore
paths that are gitignored and the story workspace (`tasks/stories/<id>/`); a leftover lock directory
under `verify-lock: global` is not a stray edit: do not report it, and **never remove the global lock by
hand**. `test-lock.js` breaks a dead owner's lock itself (same host and platform, owner pid gone) and an
empty ownerless one; a lock held by a live owner is waited on.

### The index at commit

The loop commits by path, never `git add -A`. Before every commit, `git diff --cached --name-only`
must hold only that story's paths: anything else in the index (a stuck story's leftovers, someone
else's staging) is a stop, never committed.

---

## When a job fails: restore before retrying

A failed agent leaves partially-applied edits in the shared working directory. **Before the job is
started again, put its files back the way they were.** For the story's own paths that the failed
attempt changed (found with the comparison above), and only those:

```bash
node "<skill-dir>/bin/worktree.js" git -- [-C "<feature-worktree>"] restore --worktree -- <the tracked paths>
```

(Revert modifications; `-C` names the Feature worktree in a Feature, a standalone run leaves it out.)

and delete any untracked files that attempt created. **Never put back a test file the red step
recorded as evidence**, and never use a blanket `git checkout .` or `git stash`, which would destroy
work that is not this story's.

The same holds for a **stuck** story: its own paths, new ones included, go back to `HEAD` in the index
and the tree before the next story starts (`skills/implement/SKILL.md`, **Stuck stories**).

Three reasons this is not optional:

1. **The retry gets a fair attempt.** A retry agent reading half-modified files has no way to know the
   damage is wreckage rather than existing code, so it works *around* it — producing a result that
   eventually passes while leaving dead half-code behind.
2. **The 3-attempt rule becomes meaningful.** Without a restore, attempt 3 is debugging attempts 1 and
   2 as much as the story, and what reaches `/debug` is three failures layered together.
3. **Nothing broken leaks into the branch.** If the run stops, a failed attempt's fragments sit in the
   working directory beside the good work and have to be picked out of the diff by hand.

This restores the one genuinely useful property worktrees had — a failed attempt vanishing instead of
accumulating — without the part that broke later steps.

---

## At skill startup: foreign work in the working directory

`rules/git-worktrees.md` states the invariant — **1 worktree = 1 folder = 1 branch = 1 AI terminal**.
Nothing enforced it, and two concurrent `/implement` runs in one directory have commingled two
features' uncommitted edits in shared files, costing a manual recovery.

At startup, after the existing `git status` call, actually **read** the result. Treat it as possible
foreign work when the tree is dirty **and** any of these hold:

- the current branch is already another story's branch (e.g. `implement/<some-other-id>`);
- another story's `tasks/stories/<other-id>/executor-state.md` shows an in-progress run with a recent
  `updated` timestamp;
- another story's `tasks/stories/<other-id>/phase.md` is fresh (see `rules/phase-markers.md` — freshness
  comes from `updated`, never from the file merely existing).

A marker with a `feature:` key is a Feature run in its own worktree, not foreign work here: such a run
writes only `tasks/` in this folder, and paths under `tasks/` are not counted as dirty for this check.
The same Feature open in two sessions is a different check, the claim (`feature-state.js claim`,
ADR-0006). A standalone run still builds in the folder it runs in, so the bullets above hold for it, and
it asks one more thing first: `feature-state.js live --feature <fid>` for each Feature in `tasks/features/`;
any that prints `live` means a Feature session is open in this home folder, and the run asks before it
checks out a branch here (`skills/implement/SKILL.md`, "Before you start"; not self-answerable).

**Show what was found and ask** — do not refuse outright and do not proceed silently. Dirty state is
often the human's own scratch work, so the decision is theirs:

```
This working directory has uncommitted changes that may belong to another story:

  branch: implement/<other-id>   (this run wants: <intended branch>)
  modified: server/src/ws-client.ts, server/src/ws-protocol.ts
  untracked: server/src/skills/
  tasks/stories/<other-id>/phase.md — updated 4 minutes ago (phase: coding)

Building two stories in one folder commingles their uncommitted work — see
rules/git-worktrees.md. Recommended: build this story in its own worktree.

(A) Stop — I'll set up a separate worktree
(B) These are my own changes, continue here
```

Under `rules/autonomous-mode.md` this is **not** self-answerable: proceeding could destroy another
run's uncommitted work, which fails the reversibility test. An autonomous run **pauses** here.

---

## One-line pattern for skills

> Build agents run in the orchestrator's working directory with **no** `isolation` — check the branch
> hasn't drifted before every story; compare changes against the run's starting tree, never a clean
> one, and commit only the story's own paths; on a failed attempt, restore that attempt's files before
> retrying. At startup, if the tree is dirty with another story's work, show it and ask
> (`rules/wave-execution.md`).
