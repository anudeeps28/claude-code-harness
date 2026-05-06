# Sequence Diagrams

**Project:** [project name]
**Last updated:** YYYY-MM-DD
**Source:** ARCHITECTURE.md component diagram + PRD user flows

---

## Key flows

### [Flow Name] — [one-line description]

**Trigger:** [what initiates this flow]
**Actors:** [user, service, external system]

```mermaid
sequenceDiagram
    actor User
    participant API as API Gateway
    participant SVC as Service
    participant DB as Database

    User->>API: POST /resource
    API->>SVC: validate + process
    SVC->>DB: INSERT
    DB-->>SVC: OK
    SVC-->>API: 201 Created
    API-->>User: response
```

**Notes:**
- [Any important detail about this flow — timeouts, retry behavior, async steps]

---

### [Error / Edge Case Flow]

```mermaid
sequenceDiagram
    actor User
    participant API as API Gateway
    participant SVC as Service

    User->>API: POST /resource (invalid)
    API->>SVC: validate
    SVC-->>API: 400 Validation Error
    API-->>User: error response
```

---

## Regulated data flows

_Flows involving PHI/PII should be documented separately with data classification annotations._

### [Regulated Flow Name]

```mermaid
sequenceDiagram
    participant SVC as Service
    participant DB as Database (encrypted)
    participant Audit as Audit Log

    Note over SVC,DB: PHI data path — encrypted in transit + at rest
    SVC->>DB: WRITE (PHI fields encrypted)
    SVC->>Audit: log access (no PHI in log)
```
