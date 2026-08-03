# Wave Execution — Harness Rule

This file is the **single source of truth** for how a skill runs a wave of executor agents: where they
run, what must be checked before and after each wave, and what happens to a failed task's edits.

**Location:** `rules/wave-execution.md` (installed alongside `.claude/skills/`).
**Referenced by:** `skills/implement/SKILL.md`, `skills/story/SKILL.md`, `skills/run-tasks/SKILL.md`,
`agents/story-executor-agent.md`.

---

## Executor agents run in the orchestrator's working directory

Wave tasks are spawned as **background agents with no isolation** — they run directly in the
orchestrator's working directory, on its feature branch, alongside each other.

**Do not spawn them with `isolation: "worktree"`.** That was the previous design and it cannot work
here. An isolated worktree is created from the **default branch** and can only ever see **committed**
state, while these skills deliberately commit nothing until the PR phase. So every wave after the
first was given a copy of the project that lacked the very files its own plan ordered to be written
first: the task's `<verify>` failed on missing modules, and the run halted for a reason that had
nothing to do with the code. Worktrees also stranded the failed agents' work in hidden
`.claude/worktrees/` directories that nothing collected.

The protection worktrees were meant to provide — two agents never clobbering the same file — is
provided by the **pre-wave overlap check** below, which holds regardless of isolation.

---

## Before each wave

### 1. Branch-drift check (every wave, no exceptions)

```bash
git branch --show-current
```

If this is not the branch the run created, **stop immediately** — do not launch the wave. Another
session sharing this working directory has switched the branch, and every task you launch now writes
feature work onto someone else's branch. Report the expected branch, the actual branch, and stop.

This is never ambiguous and is never self-answered, including under `rules/autonomous-mode.md`: a
branch changing mid-run is a **contradiction** pause-anyway trigger.

### 2. Overlap check (waves with 2+ tasks)

Agents in a wave share one working directory, so this check is what keeps them off each other's files.
Compare, across every pair of tasks in the wave:

- task A's `<files>` against task B's `<files>` — **two writers**, the classic clobber; and
- task A's `<read_first>` against task B's `<files>` — **a reader against a writer**. A reads the file
  for context while B is rewriting it, so A works from a half-written version. This is silent and does
  not announce itself in any build output.

On any overlap, auto-split: move the higher-id task into a new wave immediately after this one,
renumber the rest, and show the updated wave table, naming the file and both tasks. If there is no
overlap, proceed silently.

---

## Launching the wave

Spawn each `type="auto"` / `type="test"` task as a **background** `story-executor-agent`, all in the
same message so they run concurrently. Pass the single `<task>` XML block and the story id.

Agents **edit in parallel**; they **serialize only on the `<verify>` step**, via the lock defined in
`agents/story-executor-agent.md` Step 3. Editing is where the wall-clock goes, so parallelism is
preserved; builds queue because concurrent builds corrupt each other's shared scratch state
(`node_modules/.cache`, `.next`, `tsconfig.tsbuildinfo`, `obj/`, `target/`, `__pycache__`) and produce
failures unrelated to the code.

---

## After each wave

### 1. Stray-file check

Compare what actually changed against what the wave was authorized to change:

```bash
git status --porcelain
```

Every changed path should appear in the `<files>` of some task in this wave (or an earlier completed
wave). A path that appears here but was declared by **no** task means an agent edited outside its
scope — the one failure the overlap check cannot prevent, because it assumes the plan's file lists are
accurate.

Surface it loudly, name the file, and **stop** — do not roll into the next wave. An undeclared edit
may be a sibling agent's work being silently overwritten, and it will otherwise ship inside the story's
diff unnoticed. Ignore paths that are gitignored, the story workspace (`tasks/stories/<id>/`), and
`tasks/.verify.lock` — a leftover lock directory means an agent died mid-verify, which its own BLOCKED
report already covers; `rmdir` it and carry on rather than reporting it as a stray edit.

### 2. Branch-drift check again

Re-run the branch check from "Before each wave". Running it on both sides of a wave means a hijack is
caught within one wave instead of at the end of the run.

---

## When a task fails: restore before retrying

A failed agent leaves partially-applied edits in the shared working directory. **Before re-spawning
the task, put its files back the way they were.** For that task's `<files>` only:

```bash
git checkout -- <that task's tracked files>     # revert modifications
```

and delete any untracked files that task created. Because the overlap check guarantees waves are
file-disjoint, this can never touch another task's work — but restore **only** that task's declared
files, never a blanket `git checkout .` or `git stash`, which would destroy sibling agents' in-flight
work.

Three reasons this is not optional:

1. **The retry gets a fair attempt.** A retry agent reading half-modified files has no way to know the
   damage is wreckage rather than existing code, so it works *around* it — producing a task that
   eventually passes while leaving dead half-code behind.
2. **The 3-attempt rule becomes meaningful.** Without a restore, attempt 3 is debugging attempts 1 and
   2 as much as the task, and what reaches `/debug` is three failures layered together.
3. **Nothing broken leaks into the branch.** If the run stops, a failed task's fragments sit in the
   working directory beside the passing tasks' work and have to be picked out of the diff by hand.

This restores the one genuinely useful property worktrees had — a failed attempt vanishing instead of
accumulating — without the part that broke dependent waves.

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

> Wave agents run in the orchestrator's working directory with **no** `isolation` — check the branch
> hasn't drifted and that no two tasks in the wave share a file (`<files>` vs `<files>` **and**
> `<read_first>` vs `<files>`) before launching; after the wave, check the branch again and that
> nothing changed outside the wave's declared files; on task failure, restore that task's files before
> retrying. At startup, if the tree is dirty with another story's work, show it and ask
> (`rules/wave-execution.md`).
