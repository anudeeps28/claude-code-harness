# Debugging Guide

**Project:** [project name]
**Last updated:** YYYY-MM-DD

_This guide grows over time as issues are encountered and resolved. Add entries when you fix a non-obvious problem._

---

## Quick diagnostics

| Symptom | Likely cause | Fix |
|---|---|---|
| [e.g., "500 on POST /resource"] | [e.g., "Database connection pool exhausted"] | [e.g., "Restart the service or increase pool size"] |
| [e.g., "Slow response times"] | [e.g., "Missing index on frequently queried column"] | [e.g., "Add index — see DATABASE_SCHEMA.md"] |

---

## How to debug locally

### Logging

- Log level is controlled by `[env var]` — set to `debug` for verbose output
- Structured logs are in `[format]` — use `[tool]` to filter
- Sensitive data (PHI/PII) is never logged — if you see it, that's a bug

### Breakpoints

- [IDE-specific instructions — e.g., "Use VS Code launch.json with the 'Debug' configuration"]
- [How to attach to a running process]

### Database queries

```bash
# Connect to local database
[connection command]

# Check recent data
[useful query]
```

---

## Common issues

### [Issue Category 1]

**Symptom:** [what the developer sees]

**Root cause:** [why it happens]

**Fix:**
```bash
[commands or code changes]
```

**Prevention:** [what to do to avoid this in the future]

---

### [Issue Category 2]

**Symptom:** [what the developer sees]

**Root cause:** [why it happens]

**Fix:**
```bash
[commands or code changes]
```

---

## Environment-specific issues

### Development

- [Common dev-only issues and fixes]

### Staging

- [Common staging-only issues and fixes]

### Production

- [Common production issues — link to runbooks in DEPLOYMENT.md]
