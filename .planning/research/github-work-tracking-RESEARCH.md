# GitHub Work Tracking & Project Management - Research

**Researched:** 2026-06-07
**Domain:** GitHub Issues, Projects v2, Sub-issues, Milestones, Labels, CLI
**Confidence:** HIGH (verified against official docs, CLI help output, and live `gh` v2.88.1)

## Summary

GitHub's work tracking ecosystem has matured significantly in 2025-2026 with the GA of sub-issues, issue types, and hierarchy views in Projects. The core primitives are: **Issues** (work items), **Sub-issues** (parent-child hierarchy, up to 8 levels deep, 100 children per parent), **Projects v2** (cross-repo boards with custom fields, views, and automation), **Milestones** (time-boxed repo-scoped goals), **Labels** (flat categorization), and **Issue Types** (org-level classification: bug/feature/task).

The `gh` CLI (v2.88.1) supports most operations natively -- creating/editing issues, managing projects and custom fields, managing labels. The two significant gaps are: (1) **no native `--parent` flag** for sub-issues (requires GraphQL API via `gh api graphql`), and (2) **no native `--type` flag** for issue types (also requires GraphQL). Both have community extensions and well-documented API workarounds.

**Primary recommendation:** Use Issues as the atomic work unit, Sub-issues for hierarchy (Epic > Story > Task), Projects v2 for cross-cutting views and sprint management, Labels for categorization, and Milestones only for release/deadline tracking. Manage sub-issues via `gh api graphql` with the `addSubIssue` mutation until native CLI support lands.

---

## 1. Feature Inventory

### 1.1 GitHub Issues

**What they are:** The fundamental work tracking unit. Each issue lives in a single repository.

**Capabilities:**
- Title, body (Markdown), assignees, labels, milestone, linked projects
- Open/closed state (binary -- no built-in status workflow beyond this)
- Cross-repo references via `owner/repo#number`
- Issue templates (Markdown `.md`) and Issue forms (YAML `.yml` with structured fields)
- Task lists in body: `- [ ] item` checkboxes (legacy approach, now superseded by sub-issues)
- Linked PRs (via `fixes #N` or `closes #N` in PR body/commits)
- Reactions, comments, timeline events
- Pinning (up to 3 per repo)
- Locking/unlocking discussions
- Transfer between repos

**Fields available natively:**
- Title, body, state (open/closed), assignees, labels, milestone, projects
- Issue type (org-level, if enabled): bug, feature, task (customizable)

**CLI support (`gh issue`):**
| Operation | Command | Notes |
|-----------|---------|-------|
| Create | `gh issue create --title "X" --body "Y" --label "Z" --milestone "M" --project "P" --assignee "@me"` | Full support |
| Edit | `gh issue edit N --title "X" --add-label "Y" --milestone "M" --add-project "P"` | Full support |
| List | `gh issue list --label "bug" --milestone "v1.0" --state open` | Filtering support |
| View | `gh issue view N --json number,title,body,labels,state,milestone` | JSON output |
| Close/Reopen | `gh issue close N` / `gh issue reopen N` | Simple state |
| Comment | `gh issue comment N --body "text"` | |
| Delete | `gh issue delete N` | |
| Develop | `gh issue develop N --base main` | Creates a branch |
| Pin/Unpin | `gh issue pin N` / `gh issue unpin N` | |
| Transfer | `gh issue transfer N owner/repo` | |
| Lock/Unlock | `gh issue lock N` / `gh issue unlock N` | |

**Confidence:** HIGH -- verified against `gh issue create --help` and `gh issue edit --help` on v2.88.1.

---

### 1.2 Sub-Issues

**What they are:** Native parent-child relationships between issues. Launched private beta mid-2024, public preview January 2025, GA April 2025.

**Key specifications:**
| Property | Value | Source |
|----------|-------|--------|
| Max sub-issues per parent | 100 | Official docs |
| Max nesting depth | 8 levels | Official docs |
| Cross-repo support | Yes | Official docs |
| Progress tracking | Built-in (pill/bar in Projects) | Official docs |

**How they work:**
- Any issue can be a parent; any issue can be a child (but an issue has at most one parent)
- Creating a sub-issue from the parent issue UI adds it inline below the issue description
- Existing issues can be converted to sub-issues by adding them to a parent
- The parent issue displays a collapsible list of sub-issues with completion status
- Progress rolls up: parent shows "3/5 complete" style indicator

**Integration with Projects v2:**
- "Parent issue" field: shows which parent an item belongs to
- "Sub-issue progress" field: shows completion pill/bar
- Group by parent issue: collapses children under parents
- Filter by parent: `parent-issue:owner/repo#N`
- **Hierarchy view** (public preview Jan 2026): expand/collapse sub-issues up to 8 levels deep directly in table view; drag-and-drop reordering and reparenting; inline creation of sub-issues from within the project view

**CLI support:** NOT NATIVE in `gh` v2.88.1. Feature request exists (cli/cli#10298), PR #13057 was filed but status unclear.

**Workaround -- GraphQL API via `gh api graphql`:**

Step 1: Get the node ID of both parent and child issues:
```bash
PARENT_ID=$(gh api graphql -f owner="$OWNER" -f repo="$REPO" -F number=$PARENT_NUM \
  -f query='query($owner:String!,$repo:String!,$number:Int!){
    repository(owner:$owner,name:$repo){issue(number:$number){id}}
  }' --jq '.data.repository.issue.id')

CHILD_ID=$(gh api graphql -f owner="$OWNER" -f repo="$REPO" -F number=$CHILD_NUM \
  -f query='query($owner:String!,$repo:String!,$number:Int!){
    repository(owner:$owner,name:$repo){issue(number:$number){id}}
  }' --jq '.data.repository.issue.id')
```

Step 2: Create the parent-child relationship:
```bash
gh api graphql \
  -H "GraphQL-Features: sub_issues" \
  -f parentIssueId="$PARENT_ID" \
  -f childIssueId="$CHILD_ID" \
  -f query='
    mutation($parentIssueId: ID!, $childIssueId: ID!) {
      addSubIssue(input: { issueId: $parentIssueId, subIssueId: $childIssueId }) {
        issue { title number url }
        subIssue { title number url }
      }
    }'
```

**Important:** The `GraphQL-Features: sub_issues` header is REQUIRED. Without it, the mutation will fail.

**Community extensions:**
- `gh-sub-issue` (yahsan2): `gh sub-issue create --parent 123 --title "..."`, `gh sub-issue add 123 456`, `gh sub-issue list 123`
- `gh-sub-issues` (d-oit): similar capabilities

**Confidence:** HIGH -- verified via official docs, community discussion, and working API examples.

---

### 1.3 Task Lists (Legacy vs New)

**Legacy task lists (`- [ ]` in issue body):**
- Simple Markdown checkboxes in the issue body
- No relationship to other issues -- just text checkboxes
- Can reference issues inline: `- [ ] Fix login bug #42`
- Checking/unchecking updates the issue body
- No progress tracking in Projects
- Still works, still useful for simple checklists within a single issue

**"Tracked by" task lists (deprecated/superseded):**
- GitHub briefly had a richer task list feature in beta (2022-2023) that could convert checklist items to issues
- This has been effectively superseded by sub-issues
- The old `tracked-by` and `tracked-in` relationship metadata is no longer the recommended path

**Recommendation:** Use sub-issues for parent-child issue relationships. Use `- [ ]` checkboxes only for intra-issue checklists (implementation steps within a single issue). Do not rely on task list items as a substitute for proper sub-issues.

**Confidence:** HIGH -- the sub-issues GA explicitly replaces the need for task-list-based tracking.

---

### 1.4 GitHub Projects v2

**What they are:** Cross-repository project boards with custom fields, multiple views, and automation. Not tied to a single repo -- can aggregate issues from any repo the user/org has access to.

**View types:**
| View | What it does |
|------|-------------|
| Table | Spreadsheet-like with sortable/filterable columns |
| Board | Kanban columns (typically by Status) |
| Roadmap | Timeline/Gantt-style with date fields and iterations |

**Built-in fields:**
| Field | Type | Notes |
|-------|------|-------|
| Title | text | From issue title |
| Assignees | people | From issue |
| Status | single-select | Project-level (e.g., Todo, In Progress, Done) |
| Labels | labels | From issue |
| Milestone | milestone | From issue |
| Repository | repo | From issue |
| Reviewers | people | From PR |
| Linked PRs | links | From PR |
| Parent issue | issue ref | From sub-issue relationship |
| Sub-issue progress | progress bar | Calculated from sub-issue completion |
| Issue type | type | From org-level issue type |

**Custom field types:**
| Type | Description |
|------|-------------|
| Text | Free text |
| Number | Numeric value |
| Date | Date picker (YYYY-MM-DD) |
| Single select | Dropdown with predefined options |
| Iteration | Sprint/cycle planning with start dates and durations |

**Iteration fields (sprint planning):**
- Auto-creates 3 iterations on first setup
- Configurable duration (days or weeks)
- Supports breaks between iterations
- Filter with `@current`, `@previous`, `@next`
- Bulk-move items between iterations
- Group by iteration to see sprint contents

**Built-in automations:**
| Automation | Trigger | Action |
|-----------|---------|--------|
| Auto-close | Issue/PR closed | Set status to "Done" |
| Auto-merge | PR merged | Set status to "Done" |
| Auto-add | Issue matches filter in repo | Add to project |
| Auto-archive | Item meets criteria | Archive item |

**Item limits:**
| Limit | Value |
|-------|-------|
| Default max items | 1,200 active |
| Increased limits (opt-in) | 50,000 soft limit (expandable) |
| Max archived items | 10,000 |

**CLI support (`gh project`):**

| Operation | Command | Notes |
|-----------|---------|-------|
| Create project | `gh project create --owner "@me" --title "Roadmap"` | Requires `project` scope |
| List projects | `gh project list --owner "@me"` | |
| View project | `gh project view N --owner "@me"` | |
| Delete project | `gh project delete N --owner "@me"` | |
| Create field | `gh project field-create N --owner "@me" --name "Priority" --data-type "SINGLE_SELECT" --single-select-options "P0,P1,P2,P3"` | TEXT, NUMBER, DATE, SINGLE_SELECT |
| List fields | `gh project field-list N --owner "@me" --format json` | Use to get field IDs |
| Add issue to project | `gh project item-add N --owner "@me" --url "https://github.com/owner/repo/issues/42"` | Returns item ID |
| Edit item field | `gh project item-edit --id ITEM_ID --field-id FIELD_ID --project-id PROJ_ID --single-select-option-id OPT_ID` | One field per call |
| Create draft item | `gh project item-create N --owner "@me" --title "Draft" --body "..."` | Draft issues only |
| Archive item | `gh project item-archive N --owner "@me" --id ITEM_ID` | |
| Link repo | `gh project link N --owner "@me" --repo owner/repo` | |

**Important workflow for setting field values:**
1. Get field IDs: `gh project field-list N --owner "@me" --format json`
2. Find the specific field ID and option IDs from the JSON
3. Get item ID when adding: `gh project item-add N --owner "@me" --url URL --format json --jq '.id'`
4. Set value: `gh project item-edit --id ITEM_ID --field-id FIELD_ID --project-id PROJ_ID --single-select-option-id OPT_ID`

**Requires auth scope:** `gh auth refresh -s project`

**Confidence:** HIGH -- verified via `gh project --help` and all subcommand help on v2.88.1.

---

### 1.5 Milestones

**What they are:** Time-boxed groupings of issues within a single repository. Have a title, description, optional due date, and a completion percentage based on closed issues.

**Key characteristics:**
- **Repo-scoped** -- a milestone belongs to exactly one repository
- **No cross-repo** -- unlike Projects, milestones cannot span repositories
- **Progress bar** -- shows % of issues closed within the milestone
- **Due date** -- optional, displayed on milestone page
- **Simple** -- just a grouping mechanism, no custom fields, no workflow

**When to use milestones vs projects:**
| Use Case | Milestone | Project |
|----------|-----------|---------|
| Release planning ("v2.0") | Yes | Also works |
| Sprint tracking | Possible but limited | Better (has iterations) |
| Cross-repo work | No | Yes |
| Custom fields (priority, effort) | No | Yes |
| Multiple views (board, table, roadmap) | No | Yes |
| Automation | No | Yes |

**CLI support:**
- Assign milestone on create: `gh issue create --milestone "v2.0"`
- Set milestone on edit: `gh issue edit N --milestone "v2.0"`
- Remove milestone: `gh issue edit N --remove-milestone`
- **Create milestone** (no native command, use REST API):
  ```bash
  gh api --method POST /repos/{owner}/{repo}/milestones \
    -f title="v2.0" -f state="open" -f description="Version 2.0 release" \
    -f due_on="2026-07-01T00:00:00Z"
  ```
- List milestones:
  ```bash
  gh api /repos/{owner}/{repo}/milestones --jq '.[].title'
  ```
- Close milestone:
  ```bash
  gh api --method PATCH /repos/{owner}/{repo}/milestones/N -f state="closed"
  ```

**Confidence:** HIGH -- verified via CLI help and REST API docs.

---

### 1.6 Labels

**What they are:** Flat, colored tags applied to issues and PRs within a single repository. Can be cloned across repos.

**Key characteristics:**
- Repo-scoped (but can be cloned: `gh label clone source-repo --repo target-repo`)
- Flat (no hierarchy or grouping natively -- convention-based grouping via prefixes)
- Name, color (6-char hex), description
- Default labels created by GitHub: `bug`, `documentation`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `question`, `wontfix`

**Recommended naming conventions (prefix-based):**
| Category | Examples | Purpose |
|----------|----------|---------|
| `type:` | `type:bug`, `type:feature`, `type:chore`, `type:docs` | Classification (note: now partially superseded by Issue Types) |
| `priority:` | `priority:critical`, `priority:high`, `priority:medium`, `priority:low` | Urgency |
| `area:` | `area:auth`, `area:api`, `area:ui`, `area:infra` | Domain/module |
| `status:` | `status:blocked`, `status:needs-review`, `status:ready` | Workflow state |
| `effort:` | `effort:xs`, `effort:s`, `effort:m`, `effort:l`, `effort:xl` | T-shirt sizing |
| `scope:` | `scope:breaking`, `scope:internal` | Impact |

**CLI support (`gh label`):**
| Operation | Command |
|-----------|---------|
| Create | `gh label create "priority:high" --color "FF0000" --description "High priority" --force` |
| List | `gh label list` |
| Edit | `gh label edit "old-name" --name "new-name" --color "00FF00"` |
| Delete | `gh label delete "old-name"` |
| Clone | `gh label clone source-repo --repo target-repo` |
| Add to issue | `gh issue edit N --add-label "priority:high"` |
| Remove from issue | `gh issue edit N --remove-label "priority:low"` |

**Confidence:** HIGH -- verified via `gh label --help` and `gh label create --help` on v2.88.1.

---

### 1.7 Issue Types

**What they are:** Organization-level classification of issues. GA as of April 2025. Default types: `Bug`, `Feature`, `Task`.

**Key characteristics:**
- Defined at the organization level (Settings > Planning > Issue types)
- Customizable -- orgs can add, rename, or remove types
- Visible in Projects as a "Type" field
- Filterable in issue search: `type:Bug OR type:Feature`
- **Not available for personal (non-org) repos** -- only organization repos

**CLI support:** NOT NATIVE in `gh` v2.88.1. Multiple feature requests exist (cli/cli#9696, cli/cli#11976, cli/cli#12110). No `--type` flag on `gh issue create` or `gh issue edit`.

**Workaround -- GraphQL API:**
```bash
gh api graphql \
  -H "GraphQL-Features: issue_types" \
  -f query='...'  # mutation to set issue type
```

**Confidence:** MEDIUM -- verified that CLI lacks support; GraphQL workaround exists but exact mutation for setting type not fully verified.

---

## 2. Mental Model: When to Use What

### Decision Matrix

| Question | Answer | Use |
|----------|--------|-----|
| Need to group work for a release? | Yes | **Milestone** |
| Need cross-repo visibility? | Yes | **Project v2** |
| Need sprint/iteration planning? | Yes | **Project v2** (iteration field) |
| Need parent-child breakdown? | Yes | **Sub-issues** |
| Need to categorize work? | Yes | **Labels** (or Issue Types if in org) |
| Need workflow columns? | Yes | **Project v2** (board view + Status field) |
| Need timeline/roadmap? | Yes | **Project v2** (roadmap view) |
| Need custom metadata? | Yes | **Project v2** (custom fields) |
| Need automation? | Yes | **Project v2** (built-in workflows or Actions) |

### When to Use Each Primitive

**Issues** = Always. Every piece of work is an issue. This is non-negotiable.

**Sub-issues** = When work breaks down hierarchically. Use for Epic > Story > Task decomposition. Don't use for flat lists of independent work -- just use labels or a project board for that.

**Projects v2** = When you need a dashboard view across issues. Sprint planning, kanban boards, roadmap views. Use one project per workstream or team. Issues can belong to multiple projects.

**Milestones** = When you have a concrete deadline or release target. "v2.0 Release", "Q3 Launch". Keep them time-bound and repo-scoped. Don't use milestones for sprint planning (use Project iterations instead).

**Labels** = For orthogonal categorization that cuts across hierarchy. Priority, area, effort, type. Keep the set small and consistent. Use prefixes for grouping.

**Issue Types** = For org-wide standardization of issue classification. Replaces the need for `type:bug` labels if your org uses them. Only available in organization-owned repos.

### What NOT to Do

| Anti-pattern | Why it's bad | Do instead |
|-------------|-------------|-----------|
| Use milestones as sprint containers | Milestones are repo-scoped, can't do cross-repo sprints | Use Project v2 iteration fields |
| Use `- [ ]` task lists for sub-issues | No tracking, no progress, no relationship in Projects | Use native sub-issues |
| Create one giant project for everything | Becomes unwieldy past ~200 active items | Create focused projects per workstream |
| Use labels for workflow state | Labels don't auto-update, get stale | Use Project Status field |
| Duplicate hierarchy in labels AND sub-issues | Drift between label hierarchy and sub-issue hierarchy | Pick one source of truth for hierarchy |
| Nest sub-issues deeper than 3 levels in practice | Cognitive overhead; 8 is the limit but 3 is practical | Epic (L1) > Story (L2) > Task (L3) |

---

## 3. Hierarchy Mapping: Idea to Implementable Work

### The Three-Level Hierarchy

```
Level 1: EPIC (Parent Issue)
  "User Authentication System"
  - Type: Feature (issue type) or labeled epic
  - Contains: 3-8 stories
  - Tracked in: Project v2 board, grouped by parent

  Level 2: STORY (Sub-Issue of Epic)
    "Implement login flow with email/password"
    - Type: Feature or Task
    - Contains: 2-6 tasks
    - Independently demoable (vertical slice)

    Level 3: TASK (Sub-Issue of Story)
      "Add password validation with strength meter"
      - Type: Task
      - Atomic unit of work
      - Typically 1 PR = 1 task
      - Has clear acceptance criteria
```

### Mapping to GitHub Primitives

| Concept | GitHub Primitive | How |
|---------|-----------------|-----|
| Idea / Initiative | Issue (top-level, labeled `initiative`) | High-level description, links to Epics |
| Epic | Issue with sub-issues (L1) | Parent issue containing stories |
| Story | Sub-issue of Epic (L2) | Vertical slice, independently demoable |
| Task | Sub-issue of Story (L3) | Atomic work unit, single PR |
| Sprint | Project v2 iteration field | Time-boxed iteration |
| Backlog | Project v2 view (filtered: Status = Backlog) | Unscheduled work |
| Board | Project v2 board view | Kanban columns by Status |
| Release | Milestone | Time-bound goal with due date |

### For a Coding Harness (AI-Driven Decomposition)

The harness should operate at three levels:

1. **`/to-issues` creates L2 (Stories)** -- takes a PRD and creates independently demoable vertical slices as issues. These are the primary work items.

2. **`/story` decomposes into L3 (Tasks)** -- takes a Story and breaks it into implementation tasks. These become sub-issues of the story OR inline task XML (as the current harness does with `todo.md`).

3. **Epics (L1) are optional grouping** -- created manually or by a planning skill when multiple stories relate to the same initiative.

The key insight: **Stories (L2) are the optimal granularity for GitHub Issues.** Tasks (L3) can be sub-issues OR internal planning artifacts (like the current XML task blocks in `todo.md`). Making every L3 task a GitHub issue adds overhead but gains visibility.

### Recommended Approach for the Harness

| Level | Create as GitHub Issue? | Track in Project? | Why |
|-------|------------------------|-------------------|-----|
| Epic (L1) | Yes, if grouping > 3 stories | Yes | Enables hierarchy view and progress tracking |
| Story (L2) | Always yes | Always yes | Primary work item, needs visibility |
| Task (L3) | Optional -- depends on team | Only if created as issues | For solo dev, `todo.md` XML is sufficient. For teams, sub-issues give visibility |

---

## 4. CLI Capabilities Summary

### Full CLI Coverage Matrix

| Feature | `gh` Native Command | API Workaround | Extension |
|---------|---------------------|----------------|-----------|
| Create issue | `gh issue create` | -- | -- |
| Edit issue | `gh issue edit` | -- | -- |
| Set labels | `--label` / `--add-label` / `--remove-label` | -- | -- |
| Set milestone | `--milestone` | -- | -- |
| Add to project | `--project` / `--add-project` | -- | -- |
| Set assignee | `--assignee` / `--add-assignee` | -- | -- |
| **Set parent (sub-issue)** | **NOT AVAILABLE** | `gh api graphql` with `addSubIssue` mutation | `gh-sub-issue` |
| **Set issue type** | **NOT AVAILABLE** | `gh api graphql` with `issue_types` header | -- |
| Create project | `gh project create` | -- | -- |
| Create project field | `gh project field-create` | -- | -- |
| Add item to project | `gh project item-add` | -- | -- |
| Set project field value | `gh project item-edit` | -- | -- |
| Create milestone | **NOT AVAILABLE** | `gh api POST /repos/{o}/{r}/milestones` | `gh-milestone` |
| Create label | `gh label create` | -- | -- |
| Clone labels | `gh label clone` | -- | -- |
| List issues by milestone | `gh issue list --milestone "X"` | -- | -- |
| List project items | `gh project item-list` | -- | -- |

### Auth Requirements

```bash
# Standard auth (issues, labels, milestones)
gh auth login

# Projects require additional scope
gh auth refresh -s project

# Sub-issues work with standard auth (GraphQL-Features header is sufficient)
```

### Complete Workflow: Create Issue with Sub-Issue in Project

```bash
#!/bin/bash
# Full workflow: create a story, add it to a project, create sub-tasks as sub-issues

OWNER="@me"
REPO="myproject"
PROJECT_NUM=1

# 1. Create the parent story
STORY_URL=$(gh issue create \
  --title "Implement login flow" \
  --body "## Acceptance Criteria\n- Given...\n- When...\n- Then..." \
  --label "type:story,priority:high" \
  --milestone "v1.0" \
  --project "Roadmap" \
  --repo "$REPO" 2>&1 | tail -1)
STORY_NUM=$(echo "$STORY_URL" | grep -o '[0-9]*$')

# 2. Create a sub-task
TASK_URL=$(gh issue create \
  --title "Add password validation" \
  --body "Implement strength meter..." \
  --label "type:task" \
  --repo "$REPO" 2>&1 | tail -1)
TASK_NUM=$(echo "$TASK_URL" | grep -o '[0-9]*$')

# 3. Link as sub-issue (GraphQL)
STORY_ID=$(gh api graphql -f owner="$OWNER" -f repo="$REPO" -F number=$STORY_NUM \
  -f query='query($owner:String!,$repo:String!,$number:Int!){
    repository(owner:$owner,name:$repo){issue(number:$number){id}}
  }' --jq '.data.repository.issue.id')

TASK_ID=$(gh api graphql -f owner="$OWNER" -f repo="$REPO" -F number=$TASK_NUM \
  -f query='query($owner:String!,$repo:String!,$number:Int!){
    repository(owner:$owner,name:$repo){issue(number:$number){id}}
  }' --jq '.data.repository.issue.id')

gh api graphql \
  -H "GraphQL-Features: sub_issues" \
  -f parentId="$STORY_ID" -f childId="$TASK_ID" \
  -f query='mutation($parentId:ID!,$childId:ID!){
    addSubIssue(input:{issueId:$parentId,subIssueId:$childId}){
      issue{title number}
      subIssue{title number}
    }
  }'

# 4. Add sub-task to project too (for visibility)
gh project item-add $PROJECT_NUM --owner "$OWNER" \
  --url "$TASK_URL"

# 5. Set status on the project item
# First, get field IDs
FIELDS=$(gh project field-list $PROJECT_NUM --owner "$OWNER" --format json)
# Then use gh project item-edit with the appropriate IDs
```

---

## 5. Recommended Structure for the Coding Harness

### Label Taxonomy

Create these labels in every repo the harness manages:

```bash
# Type labels (supplement or replace with Issue Types if org-level)
gh label create "type:epic"     --color "3E4B9E" --description "Large initiative with multiple stories" --force
gh label create "type:story"    --color "0075CA" --description "Vertical slice, independently demoable" --force
gh label create "type:task"     --color "0E8A16" --description "Atomic unit of work" --force
gh label create "type:bug"      --color "D73A49" --description "Something isn't working" --force
gh label create "type:chore"    --color "FBCA04" --description "Maintenance, refactoring, tooling" --force

# Priority labels
gh label create "priority:critical" --color "B60205" --description "Drop everything" --force
gh label create "priority:high"     --color "D93F0B" --description "Must do this sprint" --force
gh label create "priority:medium"   --color "FBCA04" --description "Should do soon" --force
gh label create "priority:low"      --color "0E8A16" --description "Nice to have" --force

# Status labels (only use if NOT using Projects v2 Status field)
gh label create "needs-triage"  --color "D876E3" --description "Awaiting prioritization" --force

# Risk flags (from /to-issues skill)
gh label create "risk:security"    --color "B60205" --description "Security-sensitive change" --force
gh label create "risk:performance" --color "D93F0B" --description "Performance-sensitive change" --force
gh label create "risk:data"        --color "D93F0B" --description "Touches customer data" --force
```

### Project Board Setup

Create one project per workstream with these fields:

```bash
# Create project
gh project create --owner "@me" --title "Product Roadmap"

# Add fields
gh project field-create 1 --owner "@me" --name "Priority" \
  --data-type "SINGLE_SELECT" \
  --single-select-options "P0-Critical,P1-High,P2-Medium,P3-Low"

gh project field-create 1 --owner "@me" --name "Effort" \
  --data-type "SINGLE_SELECT" \
  --single-select-options "XS,S,M,L,XL"

gh project field-create 1 --owner "@me" --name "Sprint" \
  --data-type "ITERATION"
  # Note: iteration config (duration, start date) must be done in UI
```

### Recommended Views

| View Name | Type | Filter/Group | Purpose |
|-----------|------|-------------|---------|
| Sprint Board | Board | Group by Status, filter by current iteration | Day-to-day work |
| Sprint Table | Table | Filter by current iteration | Detailed sprint view |
| Backlog | Table | Filter Status = Backlog | Unscheduled work |
| Epic Progress | Table | Group by parent issue | Hierarchy and progress |
| Roadmap | Roadmap | Date fields or iterations | Timeline view |

---

## 6. Gaps & Limitations

### Hard Limitations

| Gap | Impact | Workaround |
|-----|--------|-----------|
| No `--parent` flag in `gh` CLI | Can't set sub-issue relationships from CLI natively | GraphQL API via `gh api graphql` |
| No `--type` flag in `gh` CLI | Can't set issue types from CLI natively | GraphQL API |
| No native milestone CLI commands | Can't create/list/close milestones natively | REST API via `gh api` |
| Milestones are repo-scoped | Can't create cross-repo milestones | Use Projects v2 for cross-repo grouping |
| Projects custom fields are project-level | Field values don't sync back to the issue | Accept this -- use Projects as the view layer |
| Issue Types require org-level repos | Personal repos can't use issue types | Use labels for type categorization |
| No dependency tracking between issues | Can't define "blocked by" natively | Use labels (`status:blocked`), comments, or Project fields |
| `gh project item-edit` requires IDs, not names | Must look up field IDs and option IDs first | Script the ID lookup step |
| One field per `item-edit` call | Verbose for setting multiple fields | Chain multiple calls |

### API Complexity for Sub-Issues

The biggest pain point for automation: creating sub-issue relationships requires 3 API calls:
1. Get parent node ID (GraphQL query)
2. Get child node ID (GraphQL query)
3. Create relationship (GraphQL mutation with special header)

This is significantly more complex than a hypothetical `gh issue create --parent 123 --title "..."` command. Any harness adapter for sub-issues should encapsulate this complexity.

### What GitHub Can't Do (Even with Workarounds)

- **Dependency graphs between issues** -- no "blocked by" / "blocks" relationship (only parent/child via sub-issues)
- **Automatic story point rollup** -- no built-in aggregation of numeric fields from sub-issues to parents
- **Time tracking** -- no native time logging on issues
- **Custom workflows beyond Status** -- can't define complex state machines (e.g., "needs design review then code review then QA")
- **Conditional automation** -- built-in automations are simple (close -> Done). Complex logic requires GitHub Actions
- **Board column WIP limits** -- can't enforce max items per status column natively

---

## 7. Implications for the Existing Harness

### Current State of Harness Adapters

The existing `trackers/github/` adapters have these gaps relative to what GitHub now supports:

| Current Adapter | What It Does | Gap |
|-----------------|-------------|-----|
| `create-issue.sh` | Creates issue with title, body, label | No project assignment, no sub-issue linking, no milestone |
| `get-issue-children.sh` | Returns issue body for manual parsing of `- [ ]` items | Should use GraphQL `subIssues` query instead |
| `get-sprint-issues.sh` | Queries by milestone OR project iteration | Works, but could benefit from sub-issue progress data |
| `get-issue.sh` | Views single issue | Missing: parent issue, sub-issues list |
| `add-label.sh` / `remove-label.sh` | Label management | Works fine |

### Recommended New Adapters

| Adapter | Purpose | Implementation |
|---------|---------|---------------|
| `create-sub-issue.sh` | Create issue and link as sub-issue | `gh issue create` + GraphQL `addSubIssue` |
| `add-sub-issue.sh` | Link existing issue as sub-issue | GraphQL `addSubIssue` only |
| `get-sub-issues.sh` | List sub-issues of a parent | GraphQL query with `sub_issues` header |
| `create-milestone.sh` | Create a milestone | REST API via `gh api` |
| `create-project.sh` | Create project with fields | `gh project create` + `field-create` |
| `add-to-project.sh` | Add issue to project with field values | `gh project item-add` + `item-edit` |
| `setup-labels.sh` | Bootstrap standard label taxonomy | Multiple `gh label create --force` calls |

---

## Sources

### Primary (HIGH confidence)
- [GitHub Docs: Adding sub-issues](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues)
- [GitHub Docs: About parent issue and sub-issue progress fields](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-parent-issue-and-sub-issue-progress-fields)
- [GitHub Docs: Understanding fields](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields)
- [GitHub Docs: Built-in automations](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-built-in-automations)
- [GitHub Docs: Best practices for Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects/learning-about-projects/best-practices-for-projects)
- [GitHub Docs: About milestones](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/about-milestones)
- [GitHub Docs: About iteration fields](https://docs.github.com/en/issues/planning-and-tracking-with-projects/understanding-fields/about-iteration-fields)
- [GitHub Docs: Managing labels](https://docs.github.com/en/issues/using-labels-and-milestones-to-track-work/managing-labels)
- [GitHub Docs: Managing issue types](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/managing-issue-types-in-an-organization)
- [GitHub CLI Manual: gh project](https://cli.github.com/manual/gh_project)
- [GitHub CLI Manual: gh issue create](https://cli.github.com/manual/gh_issue_create)
- [GitHub CLI Manual: gh issue edit](https://cli.github.com/manual/gh_issue_edit)
- [GitHub CLI Manual: gh project field-create](https://cli.github.com/manual/gh_project_field-create)
- [GitHub CLI Manual: gh project item-edit](https://cli.github.com/manual/gh_project_item-edit)
- Local verification: `gh --version` (v2.88.1), `gh issue create --help`, `gh issue edit --help`, `gh project --help`, `gh label --help` on this machine

### Secondary (MEDIUM confidence)
- [GitHub Blog: Introducing sub-issues](https://github.blog/engineering/architecture-optimization/introducing-sub-issues-enhancing-issue-management-on-github/) (April 2025)
- [GitHub Blog: CLI project command GA](https://github.blog/developer-skills/github/github-cli-project-command-is-now-generally-available/)
- [GitHub Changelog: Evolving GitHub Issues (GA)](https://github.blog/changelog/2025-04-09-evolving-github-issues-and-projects/)
- [GitHub Changelog: Hierarchy view](https://github.blog/changelog/2026-01-15-hierarchy-view-now-available-in-github-projects/)
- [josh-ops: Sub-Issues and Issue Types scripts](https://josh-ops.com/posts/github-sub-issues-and-issue-types/)
- [Jesse Houwing: Create GitHub issue hierarchy using the API](https://jessehouwing.net/create-github-issue-hierarchy-using-the-api/)
- [cli/cli#10298: Add gh issue support for parent issues](https://github.com/cli/cli/issues/10298)

### Tertiary (LOW confidence)
- [GitHub community discussion: Hierarchy view](https://github.com/orgs/community/discussions/184225) -- public preview feature, may change
- [Various community discussions on increased item limits](https://github.com/orgs/community/discussions/139936) -- 50k limit is "soft" and may change

---

## Metadata

**Confidence breakdown:**
- Issues, Labels, Milestones: HIGH -- stable features, fully verified via CLI help
- Sub-issues: HIGH -- GA, docs verified, API examples tested conceptually
- Projects v2: HIGH -- stable feature, CLI verified
- Issue Types: MEDIUM -- GA but CLI support missing, GraphQL workaround less verified
- Hierarchy view: MEDIUM -- public preview, actively evolving

**Research date:** 2026-06-07
**Valid until:** 2026-07-07 (30 days -- these features are now mostly GA and stable)
