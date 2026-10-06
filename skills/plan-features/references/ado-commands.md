# Azure DevOps commands

Used when there is no harness tracker adapter (`trackers/active/` is absent — a ClaudeSkills install),
and for the ADO-only steps every install needs: points, the Acceptance Criteria field, the CC/SD sweep.
`az` with the azure-devops extension, signed in (`az login`, or `AZURE_DEVOPS_EXT_PAT` in the
environment). **Always pass `--org` explicitly.**

```bash
ORG="https://dev.azure.com/<org>"     # from the settings' project / board_url
PROJECT="<project>"                    # plan-features.settings.md: project
```

Known traps:

- `az boards work-item create` has **no `--tags`** — tags go in `--fields "System.Tags=a; b"`,
  separated by `;`.
- `--description` is stored as HTML, and `az` drops characters outside ASCII from it. Write plain ASCII
  (`-` not `—`, `'` not `’`) and use `<p>`, `<ul><li>`, `<h3>` for structure.
- A child does **not** inherit its parent's area or iteration: pass both on every create.

## Create

```bash
# The Feature
az boards work-item create --org "$ORG" --project "$PROJECT" --type Feature \
  --title "<title>" --description "<html body>" \
  --area "<area>" --iteration "<iteration>" \
  --fields "System.Tags=<CC-1234 | no-CC/SD>" --query id -o tsv

# A story (story_type from the settings: User Story or Product Backlog Item), then its parent link
az boards work-item create --org "$ORG" --project "$PROJECT" --type "<story_type>" \
  --title "<title>" --description "<html body>" \
  --area "<area>" --iteration "<iteration>" \
  --fields "System.Tags=<CC-1234 | no-CC/SD>; <QAble | Not QAble>" \
           "Microsoft.VSTS.Common.AcceptanceCriteria=<html criteria>" \
  --query id -o tsv
az boards work-item relation add --org "$ORG" --id <STORY_ID> --relation-type parent --target-id <FEATURE_ID>
```

A type with no Acceptance Criteria field rejects that `--fields` entry: drop it and keep the criteria in
the description. The same goes for a `Change Ticket` field (delivery process Appendix B) — set it with
`"Custom.ChangeTicket=CC-1234"` (or the board's own reference name) only when the type has it.

## Blocked-by edge (the same link `add-blocker.sh` writes)

```bash
# <BLOCKED_ID> cannot start until <BLOCKER_ID> is done: the predecessor link goes on the blocked item
az boards work-item relation add --org "$ORG" --id <BLOCKED_ID> --relation-type predecessor --target-id <BLOCKER_ID>
```

Never `related` for a blocker: a scheduler reads only predecessor links.

## Points

```bash
az boards work-item update --org "$ORG" --id <STORY_ID> --fields "<points_field>=<1|2|3|5>"
```

`points_field` is `Microsoft.VSTS.Scheduling.StoryPoints` (Agile, CMMI) or
`Microsoft.VSTS.Scheduling.Effort` (Scrum) — from the settings. To find it the first time, show one
existing story and see which of the two it has:

```bash
az boards work-item show --org "$ORG" --id <any story id> --query "fields | keys(@)" -o tsv
```

## Destination options (Phase 3.6)

```bash
az boards iteration project list --org "$ORG" --project "$PROJECT" --depth 2 -o table
az boards area project list --org "$ORG" --project "$PROJECT" --depth 3 -o table
```

## Items still missing a CC/SD (Phase 0.6)

```bash
az boards query --org "$ORG" --project "$PROJECT" -o table --wiql \
  "SELECT [System.Id],[System.WorkItemType],[System.Title] FROM WorkItems
   WHERE [System.TeamProject] = '$PROJECT' AND [System.Tags] CONTAINS 'no-CC/SD'
   AND [System.State] NOT IN ('Closed','Done','Completed','Removed','Resolved')"
```

Filling one in — read its tags first, then write them back with the number in place of `no-CC/SD`
(an update replaces the whole tag list):

```bash
az boards work-item show --org "$ORG" --id <ID> --query "fields.\"System.Tags\"" -o tsv
az boards work-item update --org "$ORG" --id <ID> --fields "System.Tags=<the same tags, CC-1234 instead of no-CC/SD>"
```

## Is it already on the board? (Phase 1)

```bash
az boards query --org "$ORG" --project "$PROJECT" -o table --wiql \
  "SELECT [System.Id],[System.Title],[System.State] FROM WorkItems
   WHERE [System.TeamProject] = '$PROJECT' AND [System.WorkItemType] = 'Feature'
   AND [System.Title] CONTAINS '<a key word>' AND [System.State] NOT IN ('Closed','Removed')"
```
