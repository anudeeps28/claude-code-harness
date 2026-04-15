# Contributing to claude-code-harness

Thanks for your interest in contributing! This guide explains how to add skills, agents, hooks, or tracker adapters.

---

## Quick start

1. Fork this repo
2. Create a branch: `git checkout -b feature/my-skill`
3. Make your changes (see sections below)
4. Test by installing locally: `bash install/install.sh`
5. Open a PR with a clear description of what you added

---

## Adding a new skill

1. Create a folder: `skills/your-skill/`
2. Create `skills/your-skill/SKILL.md` with this frontmatter:

```yaml
---
name: your-skill
description: Short description (under 250 chars) — what it does and when to use it
argument-hint: Optional example arguments
---

Your skill instructions here...
```

3. Add supporting files in the same folder if needed (templates, scripts, reference docs)
4. Add your skill to the table in `README.md`

### Skill guidelines

- Use `YOUR_NAME`, `YOUR_PROJECT_ROOT`, `YOUR_ORG` placeholders — never hardcode names or paths
- Include a `**Triggers:**` line listing natural language phrases that should activate the skill
- Add human gates (STOP checkpoints) for any destructive or irreversible operations
- Reference `tasks/lessons.md` for project-specific conventions — don't hardcode stack-specific patterns
- Read test commands from the "Test Commands" section of `tasks/lessons.md` — never hardcode test runners like `dotnet test` or `npm test`
- If the skill spawns agents, list which agents and in what order
- If the skill produces code, it must gate progress on `<verify>` commands that include tests — not just builds

---

## Adding a new agent

1. Create `agents/your-agent.md` with this frontmatter:

```yaml
---
name: your-agent
description: What this agent does (shown in agent catalog)
tools: Read, Glob, Grep, Bash
model: opus|sonnet|haiku
---

Your agent instructions here...
```

2. Add your agent to the table in `README.md`

### Agent guidelines

- **Model routing:** Use `opus` for thinking/planning/judging, `sonnet` for writing code, `haiku` for simple data gathering
- Use numbered steps (`## Step 1`, `## Step 2`, etc.)
- End with a structured output format so the orchestrating skill can parse results
- Include a `## Hard rules` section at the bottom
- Don't hardcode stack-specific conventions — reference `tasks/lessons.md`
- **Planning agents** (agents that produce execution plans): must output a test strategy with acceptance criteria, integration scenarios, and regression guardrails. Must include `type="test"` tasks. Verify commands must include running tests.
- **Executor agents** (agents that write code): must run `<verify>` which includes tests, not just builds

---

## Adding a new tracker adapter

1. Create a folder: `trackers/your-tracker/`
2. Implement these 6 scripts (same interface as `ado/` and `github/`):

| Script | Input | Output |
|---|---|---|
| `get-issue.sh <ID>` | Issue/work-item ID | Markdown: title, description, acceptance criteria, state |
| `get-issue-children.sh <ID>` | Parent issue ID | Markdown table: child ID, title, description, state |
| `get-pr-review-threads.sh <PR_ID>` | PR number | JSON array of thread objects |
| `reply-pr-thread.sh <PR_ID> <THREAD_ID> "<text>"` | PR, thread, reply text | Success/failure message |
| `resolve-pr-thread.sh <PR_ID> <THREAD_ID>` | PR, thread | Success/failure message |
| `get-sprint-issues.sh <SPRINT_NUM>` | Sprint number | Markdown: all issues in sprint with children |

3. See `trackers/README.md` for the full interface spec and output format requirements
4. Update the installer (`install/install.sh`) to offer your tracker as an option

---

## Adding a new hook

1. Create your script in `hooks/`
2. Add the wiring to the settings.json template in `hooks/README.md`
3. Update the installer to include the hook in generated settings
4. Add your hook to the table in `README.md`

---

## Security considerations

### Agents with `bypassPermissions`

Two agents run with `permissionMode: bypassPermissions`: `story-executor-agent` and `babysit-pr-fixer`. This means their tool calls execute without user approval prompts.

**Why:** These agents run inside `/story` and `/babysit-pr` loops where the user has already approved the plan at a gate checkpoint. Prompting for every Edit/Write/Bash call would make execution painfully slow.

**Risk:** A poorly written `<action>` or fix description could cause the agent to modify files outside the intended scope. The safety hook (`safety-check.js`) blocks destructive Bash commands and Writes that look like hardcoded secrets, but direct `Edit` calls are not intercepted by hooks.

**Guardrails:** Both agents have explicit scope constraints in their instructions:
- Only modify files listed in the task/fix input
- Only run build/test commands (no arbitrary Bash)
- No access outside the project root
- No package installs, config changes, or infrastructure modifications

**When to use `bypassPermissions` on a new agent:**
- Only for agents that run inside a human-gated workflow (the user approved a plan before the agent executes)
- Only for agents with tightly scoped `<action>` inputs — not open-ended instructions
- Always add a "Security note" section to the agent documenting the constraints
- Never use it on agents that receive raw user input without prior validation

---

## Code of conduct

Be kind, be constructive, be specific in your feedback. We're all here to build better tools.

---

## Questions?

Open an issue, or reach out on X: [@anudeep_2806](https://x.com/anudeep_2806).
