# Tracker Config

> Todoist project filter — keeps task queries scoped to this project.
> Without this, `get-sprint-issues.sh` returns ALL open tasks across all Todoist projects.

```
todoist_project = YOUR_TODOIST_PROJECT
```

The Todoist project name to list and create tasks in.

```
todoist_default_section =
```

Optional. The default section within the project. Sections map to sprints — `get-sprint-issues.sh` lists tasks in the named section.

```
feeds_agent_scheduler = false
```

Set to `true` if an agent scheduler picks work straight off this board. `/to-issues` then refuses
`--with-tasks` and stops at feature → story, keeping child tasks off the scheduler's queue; the
breakdown goes into each story body's `## Breakdown` section instead.

---

## PRD Configuration

```
prd_mode = YOUR_PRD_MODE
```

Options:
- `file` — write `PRD.md` to the repo (default)
- `tracker` — publish as a tracker issue only
- `both-file-canonical` — file + tracker; file is canonical
- `both-tracker-canonical` — file + tracker; tracker is canonical
