# Examples

Real filled-in examples of what your project setup should look like after install and configuration. Use these as a reference when setting up a new project.

---

## Files in this folder

| File | What it shows |
|---|---|
| [`settings.json`](settings.json) | What `.claude/settings.json` looks like after `install.sh` runs (global install) |
| [`tasks/tracker-config.md`](tasks/tracker-config.md) | Fully filled-in tracker config — ADO variant and GitHub variant |
| [`tasks/lessons.md`](tasks/lessons.md) | Filled-in lessons file with real git rules, Code Rabbit patterns, and project conventions |
| [`tasks/todo.md`](tasks/todo.md) | Example XML task plan — the format `/implement` plans and `/implement --resume` carries on |
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
    Installing: skills/implement
    Installing: skills/local-test
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

### Step 3: Run /implement 42

Open Claude Code in your project directory and type:

```
/implement 42 --standalone
```

(`--standalone` because #42 is a story with no parent Feature; for a story inside a Feature,
`/implement` asks whether you meant to build the whole Feature.)

**Phase 1 (Understand):** Claude reads the whole of issue #42 (its comments and linked items too), scans your codebase, reads `docs/`, and produces a brief. It writes `tasks/stories/42/brief.md` and stops:

> "Does this brief match your understanding of the task? Any corrections before I define the goal?"

Review the brief. Say **yes**.

**Phase 1.5 (Goal):** Claude defines how "done" will be checked end to end — each acceptance criterion with its proof — and stops for you to approve it.

**Phase 1c (Plan):** Claude decomposes the story into an XML task plan with parallel groups. It writes `tasks/stories/42/plan.md` and stops:

> "Approve the plan to begin execution, or request changes."

Review the tasks, parallel grouping, and verify commands. Say **go**.

**Phase 2 (Execute):** Claude works through the task plan wave by wave, the tasks in a wave running side by side in your working folder. After each wave:

> "Wave 1 complete (3/3 tasks passed). Continue to wave 2?"

Say **yes** to continue. If a task fails 3 times, `/debug` is invoked automatically.

**Phase 2.5 (Verify):** Claude runs `/local-test` to confirm the build passes and tests are green.

**Phase 3 (Review, e2e gate, PR):** Four review agents (evaluator, acceptance, architect, security) check the change; for each finding you say **fix** or **skip**. Then the end-to-end gate runs, and Claude drafts the commit messages and PR description and stops:

> "Review the commit messages and PR description above. Run the git commands shown, then say 'push' when ready."

You run `git push` and create the PR. On the Enterprise pack, the sprint file's Master Status Table is updated too.

If the session stops part-way, `/implement --resume 42` carries on from the last finished step.

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

## Scenario walkthrough: a whole Feature

When `/plan-features` has broken the work into a Feature with stories:

```
/implement 40
```

#40 is a Feature, so `/implement` builds all of it. It shows one plan — the stories in dependency
order, the Feature's Demo, and anything it needs from you — and that is the only stop. Then each story
is built in its own git worktree, stories that don't depend on each other at the same time, and merged
into the Feature branch only after its tests pass. Once every story has merged, a full review panel and
**Prove it** run on the whole Feature, and one PR opens — only when every acceptance criterion is met.

## Scenario walkthrough: a quick change, no issue

```
/implement "add dark mode toggle to the settings page"
```

The same flow on a plain description. Add `--quick` to skip the review agents and the e2e gate for a
small change.
