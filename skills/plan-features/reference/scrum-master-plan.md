# Scrum Master mode: plan-<feature>.md

For a repo whose `plan-features.settings.md` says `board_mode: scrum-master`: developers there do not
create board items, so this skill writes `plan-<feature>.md` for the Scrum Master and **never writes to the board**
— not a create, not an update, not a link. It reads the board only to find the items afterwards.

## plan-<feature>.md

Written at the repo root as `plan-<feature-slug>.md` (e.g. `plan-release-train-mine.md`), never as
`plan.md` and never over a file this skill did not write — a repo may already have a `plan.md` of its
own. A re-run overwrites only its own earlier file (the one whose header says "by plan-features"). It is
in git. Self-contained: the Scrum Master
creates everything from this one file.

```markdown
# Plan: <initiative>

**Board:** <board_url> | **Project:** <project> | **Area:** <area> | **Sprint:** <iteration>
**Change ticket:** <CC-1234 | none yet — tag every item no-CC/SD>
**Written:** <YYYY-MM-DD> by plan-features | **Repo:** <repo name>

> Create the items **in the order listed** (it is the order the work is meant to run in), each
> **unassigned** and in its first state (New / Not Started). Apply the tags **exactly** as written:
> they are how plan-features and work-feature find the items afterwards. Then tell the developer it is
> done.

## 1. Feature

### <Feature title>
- **Type:** Feature | **Area:** <area> | **Sprint:** <iteration>
- **Tags:** <CC-1234 | no-CC/SD>[; Feature:<FEATURE_ID>; <repo name>]
- **Description:** <What this delivers, Demo, Change ticket, PRD, Source — the Feature body from Phase 6a>

(A second Feature, when the 8-story rule split the work, follows with its own stories.)

## 2. Stories — in this order

### 1. <story title>
- **Type:** <story_type> | **Parent:** Feature "<Feature title>" | **Area:** <area> | **Sprint:** <iteration>
- **Points:** <1|2|3|5> <- "Why 5: ..." when 5>
- **Tags:** <CC-1234 | no-CC/SD>; <QAble | Not QAble>[; <STORY_ID>; Feature:<FEATURE_ID>; <repo name>]
- **Description:** <What this delivers>
- **Acceptance Criteria** (paste into the Acceptance Criteria field — QAble stories only):
  <the numbered, tagged criteria>
- **Technical Requirements** (paste into the Technical Requirements field where the board has one,
  else at the end of the description):
  <the technical requirements>
- **Links:** Predecessor: <titles of the stories it is blocked by, or None>; Related: <or None>

## 3. Checklist

- [ ] Feature created (unassigned, tagged, area and sprint set)
- [ ] Stories created in the order above, each under the Feature, pointed, tagged
- [ ] Acceptance Criteria pasted into each QAble story's own field (never the Feature's)
- [ ] Predecessor links added as listed
- [ ] Developer told it is done
```

The `[...]` tags are added only when the input was a feature file.

## After the Scrum Master says it is done — read-only

Find each item by its exact title, then by its tags, and never write anything:

```bash
az boards query --org "$ORG" --project "$PROJECT" --query "[0].id" -o tsv --wiql \
  "SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '$PROJECT'
   AND [System.WorkItemType] = '<Feature | story_type>' AND [System.Title] = '<exact title>'"
```

Report one line per item: found (with its id) or not found. For a feature-file input, write the ids
into the file (SKILL.md 6e). Anything not found is listed for the person — the Scrum Master may not
have created it yet, or changed its title; a re-run later looks again. A wrong or missing item is
reported, never fixed on the board.
