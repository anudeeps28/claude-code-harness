# PR Queue

Active branches and pull requests. Keep this in sync with the sprint file.

---

## Active PRs

| Story | Branch | PR # | Status | Notes |
|---|---|---|---|---|
| #9950 | `feature/9950-employer-filter` | — | In progress | Task plan in todo.md, Wave 2 running |
| #9930 | `feature/9930-conversation-export` | #163 | Under review | 3 Code Rabbit threads remaining |

---

## Waiting to Merge

| Story | PR # | Waiting for | Owner |
|---|---|---|---|
| #9930 | #163 | Code Rabbit re-analysis (pushed fix 2026-04-05) | YOUR_NAME |

---

## Recently Merged

| Story | PR # | Merged | Branch deleted? |
|---|---|---|---|
| #9901 | #158 | 2026-04-01 | ✅ |
| #9880 | #152 | 2026-03-28 | ✅ |
| #9855 | #147 | 2026-03-21 | ✅ |

---

## Branch cleanup

Run this to delete all local branches that have been merged to master:

```bash
git fetch --prune && git branch --merged master | grep -v master | xargs git branch -d
```
