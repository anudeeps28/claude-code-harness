# Examples

Real filled-in examples of what your project setup should look like after install and configuration. Use these as a reference when setting up a new project.

---

## Files in this folder

| File | What it shows |
|---|---|
| [`settings.json`](settings.json) | What `.claude/settings.json` looks like after `install.sh` runs (global install) |
| [`tasks/tracker-config.md`](tasks/tracker-config.md) | Fully filled-in tracker config — ADO variant and GitHub variant |
| [`tasks/lessons.md`](tasks/lessons.md) | Filled-in lessons file with real git rules, Code Rabbit patterns, and project conventions |
| [`tasks/todo.md`](tasks/todo.md) | Example XML task plan — the format `/story` and `/run-tasks` use |
| [`tasks/pr-queue.md`](tasks/pr-queue.md) | Example PR queue with real entries |

---

## The blank templates live here

The blank versions of these files are in [`templates/tasks/`](../templates/tasks/). The installer copies them into your project's `tasks/` folder. Fill them in from there.

These examples show what a well-configured project looks like after a few sprints — so you know what you're aiming for.

---

## Scenario walkthrough: Your first story (GitHub)

This walkthrough shows what a complete workflow looks like from install to merged PR.

### Step 1: Install the harness

```bash
git clone https://github.com/YOUR_USERNAME/claude-code-harness
cd my-project
bash ../claude-code-harness/install/install.sh --project .
```

The installer asks for your workflow pack (Solo or Enterprise), tracker (GitHub), and your name. It copies skills, agents, hooks, and rules into `.claude/`, generates `settings.json`, and creates task files in `tasks/`.

You'll see output like:
```
  [OK]      jq
  [OK]      gh
  Copying skills...
    Installing: skills/story
    Installing: skills/implement
    ...
  [OK] All critical files present
  claude-code-harness installed successfully.
```

### Step 2: Configure your project

Open `tasks/lessons.md` and fill in your project's conventions:
- Build command (`npm run build`, `dotnet build`, `go build ./...`)
- Test command and naming pattern
- Git commit format your team uses
- Any known build fixes

See [`tasks/lessons.md`](tasks/lessons.md) in this folder for a filled-in example.

### Step 3: Run /story 42

Open Claude Code in your project directory and type:

```
/story 42
```

**Phase 1 (Understand):** Claude reads GitHub issue #42, scans your codebase, reads `docs/`, and produces an 8-point brief. It writes `tasks/stories/42/brief.md` and stops:

> "Does this match your understanding of the story? Say 'go' to proceed to planning."

Review the brief. Say **go**.

**Phase 2 (Plan):** Claude decomposes the story into an XML task plan with parallel groups. It writes `tasks/stories/42/plan.md` and stops:

> "Review the plan. Say 'go' to start execution."

Review the tasks, parallel grouping, and verify commands. Say **go**.

**Phase 3 (Execute):** Claude works through the task plan wave by wave. Each task runs in an isolated git worktree. After each wave:

> "Wave 1 complete (3/3 tasks passed). Continue to wave 2?"

Say **go** to continue. If a task fails 3 times, `/debug` is invoked automatically.

**Phase 3.5 (Verify):** Claude runs `/local-test` to confirm the build passes and tests are green.

**Phase 3.6 (Evaluate):** A separate evaluator agent reviews all changes against the plan. It writes `tasks/stories/42/evaluation.md` with findings. For each finding, you say **fix** or **skip**.

**Phase 4 (PR):** Claude drafts commit messages and a PR description. It stops:

> "Review the commits and PR description. Run the git commands when ready."

You run `git push` and create the PR.

### Step 4: Run /babysit-pr 7

Once Code Rabbit reviews the PR:

```
/babysit-pr 7
```

Claude fetches all active review threads, categorizes each as **fix** (needs code change) or **reply** (needs explanation). It presents the analysis and stops:

> "Review the categorization. Say 'go' to start fixing."

After fixes are committed and replies posted, wait ~10 minutes for Code Rabbit to re-analyze. Run `/babysit-pr 7` again. Repeat until zero active threads remain.

### Step 5: Merge

When all threads are resolved and CI is green, merge the PR. The story is done.

---

## Scenario walkthrough: Quick feature (Solo)

For solo developers who don't need sprint ceremony:

```
/implement #42
```

Or without an issue:

```
/implement "add dark mode toggle to the settings page"
```

This runs a streamlined 3-phase flow:
1. **Understand + Plan** — reads the issue (or your description), produces a brief and task plan in one pass
2. **Execute** — same worktree-isolated executor as `/story`
3. **Evaluate + PR** — quick eval for small changes, full eval for large ones, then commit/PR drafting

Same quality gates, fewer stops.
