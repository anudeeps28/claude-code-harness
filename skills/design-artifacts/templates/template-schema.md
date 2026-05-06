# Template Schema

**Project:** [project name]
**Last updated:** YYYY-MM-DD

_This doc is optional — generate it only when the project uses templates, schemas, or configurable document formats that agents need to understand._

---

## Templates

### [Template Name]

**Purpose:** [what this template is used for]
**Location:** `[file path]`
**Format:** [JSON / YAML / Markdown / HTML]

**Schema:**

| Field | Type | Required | Description |
|---|---|---|---|
| [field] | [type] | Yes/No | [description] |

**Example:**

```json
{
  "field": "value"
}
```

**Used by:** [which service/component reads this template]

---

## Configuration schemas

### [Config Name]

**Purpose:** [what this config controls]
**Location:** `[file path]`

| Key | Type | Default | Description |
|---|---|---|---|
| [key] | [type] | [default] | [description] |

---

## Validation rules

| Template/Schema | Validation | Error on violation |
|---|---|---|
| [name] | [rule — e.g., "all required fields present"] | [what happens — e.g., "400 Bad Request"] |
