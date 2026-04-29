# Git Worktree Workflow — Harness Rule

This file teaches the AI harness (Claude Code, Cursor, Aider, Cline, Continue, etc.) how to work with git worktrees so multiple branches can be developed in parallel — one folder, one branch, one AI terminal per active piece of work.

**Location:** This file lives at `.claude/rules/git-worktrees.md` (installed by the harness alongside `.claude/skills/`, `.claude/agents/`, `.claude/hooks/`).
**To activate:** add a line `@.claude/rules/git-worktrees.md` to the project's `CLAUDE.md`.
**To opt out:** comment that line out (`# @.claude/rules/git-worktrees.md`) — sticks forever, no other change needed.
**Stack-agnostic:** project-specific restore commands and gitignored files come from `tasks/lessons.md` (or `tasks/notes.md` in the solo pack), not from this file.

---

## Core Principle

**1 worktree = 1 folder = 1 branch = 1 AI terminal context.**

The home folder is pinned to `main` (or the project's default branch). Every feature, fix, or PR-review lives in its own sibling folder named `<repo>-<short-name>`. Each worktree gets its own AI terminal — no stash/checkout dance, no cross-contamination between in-flight work.

---

## When to Create a Worktree vs. Continue in an Existing One

**Create a new worktree when** the work:
- Will live on its own branch and produce its own PR
- Needs to coexist with other in-flight work
- Forks from `main` (or another base branch)
- Is a teammate's PR you need to build/test locally

**Continue in the existing worktree (or home folder) when** the work:
- Is a continuation of an active branch already checked out somewhere
- Is a tiny edit on the branch you're currently on
- Is read-only exploration / answering questions about code

**Decision flow when the user starts a task:**
1. Ask: is this a new branch, or continuation of an existing one?
2. New → propose a worktree (state path + branch name in plain English, get OK before creating).
3. Continuation → identify which existing worktree owns the branch; switch terminals, don't create.

**Always confirm before creating.** Never create a worktree without an explicit "yes" from the user. The user may also pre-authorize via a session instruction like "always create worktrees for new branches" — in that case, skip the per-task confirmation but still announce path + branch before running the command.

---

## Naming Convention

- Branch: `feature/<issue>-<slug>` or `fix/<issue>-<slug>` or `chore/<slug>`
- Worktree folder: `<repo-folder-name>-<issue-or-slug>`, sibling of the home folder
- Examples:
  - Branch `feature/10299-sql-path-accuracy` → folder `<repo>-10299/`
  - Branch `fix/embedding-port` → folder `<repo>-embedding-port/`

Keep folder names short. Issue numbers are usually enough when they exist.

---

## Creating a Worktree

**For a NEW branch (most common):**
```
git worktree add <sibling-path> -b <branch-name> main
```
This creates `<branch-name>` from main's tip and checks it out into `<sibling-path>`. Substitute `master` if that is the project's default branch.

**For an EXISTING branch (e.g., picking up a teammate's PR or migrating in-flight work):**
```
git worktree add <sibling-path> <existing-branch-name>
```

**After creating, do these steps in the new folder:**
1. Copy gitignored config files from the home folder (the list lives in `tasks/lessons.md` under "Worktree setup" — if that section is absent, ask the user).
2. Run package restore so the project builds. The exact commands also live in `tasks/lessons.md` (e.g., `npm install`, `dotnet restore`, `pip install -r requirements.txt`, `go mod download`, `bundle install`). If `lessons.md` doesn't list them, ask the user once and then add the answer to `lessons.md`.
3. The user opens a NEW AI terminal in the new folder — that terminal becomes the dedicated context for this branch.

---

## Lifecycle: Auto-Detect Merged Branches at Session Start

After the standard `git fetch --prune` at session start:

1. Run `git worktree list` to see all active worktrees.
2. For each worktree, check if its branch still exists on `origin`:
   ```
   git ls-remote --exit-code --heads origin <branch>
   ```
   Exit code 2 (or non-zero) means the branch is gone from origin — typically because the PR merged and the source branch was deleted.
3. For each worktree whose remote branch is gone, prompt the user:
   > "Worktree `<path>` is on branch `<name>` which no longer exists on origin (likely merged). Remove it? [y/n]"
4. On `y`: run `git worktree remove <path>` then `git branch -d <name>`.
5. On `n`: leave it — ask again next session.

**Never use `--force`.** If the worktree has uncommitted changes, git refuses to remove it. Surface that error and let the user decide; do not bypass.

---

## Manual Cleanup

```
git worktree list                    # see all worktrees
git worktree remove <path>           # remove one (errors on uncommitted changes)
git branch -d <branch>               # delete the local branch ref
git worktree prune                   # clean up stale worktree metadata
```

---

## Working in a Worktree

Normal git/build/test commands. Nothing special. Notes:
- The shared `.git` history means commits in any worktree are visible to all others on `git fetch`.
- The same branch can NEVER be checked out in two worktrees. Git enforces this.
- Branches you create in any worktree appear in `git branch` output across all worktrees.

---

## Anti-Patterns — Don't Do These

- **Don't copy build artefacts** (`bin/`, `obj/`, `node_modules/`, `target/`, `dist/`, virtualenvs, etc.) into a fresh worktree. Let build tools regenerate. Faster (global package caches handle the heavy lifting), and catches environment drift.
- **Don't put session memory / working notes inside a worktree.** Keep `tasks/` in the home folder; reference via absolute paths so all worktrees share one source of truth.
- **Don't try to check out the same branch in two worktrees.** Git refuses; respect that.
- **Don't `git worktree remove --force` casually** — it discards uncommitted work silently.
- **Don't leave merged worktrees lying around.** They eat 1–3 GB each. Clean them up at session start.

---

## Project-Specific Setup

This rule is stack-agnostic. The project-specific bits live in **`tasks/lessons.md`** (or `tasks/notes.md` in the solo pack) under a section titled **"Worktree setup"**:

- **Files to copy from the home folder into a new worktree** — anything gitignored that the build needs (e.g., `.env`, `appsettings.Development.json`, `local.settings.json`, `config.local.yml`).
- **Files / folders that are SHARED automatically (don't copy)** — `tasks/`, the `.git` history, OS-level secret stores keyed by an in-tree ID.
- **Restore commands to run after creating a worktree** — the exact build/dependency commands for the stack (npm/pnpm/yarn install, dotnet restore, pip install, poetry install, bundle install, go mod download, etc.).

If that section is missing in `lessons.md` / `notes.md`, ask the user once for the values and write them in. The harness's `/sync-tasks` and `/retro` skills will keep that section healthy over time.
