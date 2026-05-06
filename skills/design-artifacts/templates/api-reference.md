# API Reference

**Project:** [project name]
**Last updated:** YYYY-MM-DD
**Base URL:** `https://api.example.com/v1`

---

## Authentication

| Method | Header | Notes |
|---|---|---|
| Bearer token | `Authorization: Bearer <token>` | Obtained via [auth endpoint / OAuth flow] |

---

## Endpoints

### [Module / Resource Name]

#### `GET /resource`

**Description:** [what this endpoint does]

**Auth:** Required / Public

**Query parameters:**

| Param | Type | Required | Default | Description |
|---|---|---|---|---|
| page | int | No | 1 | Page number |
| limit | int | No | 20 | Items per page (max 100) |

**Response:** `200 OK`

```json
{
  "data": [],
  "pagination": { "page": 1, "limit": 20, "total": 0 }
}
```

**Error responses:**

| Status | Condition |
|---|---|
| 401 | Missing or invalid auth token |
| 403 | Insufficient permissions |

---

#### `POST /resource`

**Description:** [what this endpoint does]

**Auth:** Required

**Request body:**

```json
{
  "field": "value"
}
```

**Response:** `201 Created`

```json
{
  "id": "uuid",
  "field": "value",
  "created_at": "ISO-8601"
}
```

---

## Error format

All errors follow this shape:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable description",
    "details": []
  }
}
```
