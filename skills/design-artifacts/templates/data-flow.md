# Data Flow

**Project:** [project name]
**Last updated:** YYYY-MM-DD
**Source:** ARCHITECTURE.md Section 4 (Data architecture)

---

## System data flow

```mermaid
flowchart LR
    Input[User Input] --> API[API Layer]
    API --> Auth[Auth Check]
    Auth --> Process[Business Logic]
    Process --> DB[(Database)]
    Process --> Queue[Message Queue]
    Queue --> Worker[Background Worker]
    Worker --> DB
    Worker --> Notify[Notification Service]
    DB --> Cache[Cache Layer]
    Cache --> API
```

_Replace with your actual data flow. Annotate regulated data paths._

---

## Data lifecycle

| Stage | Where | Retention | Encryption | Access control |
|---|---|---|---|---|
| Ingestion | API layer | N/A | TLS in transit | Auth required |
| Processing | Service layer | In-memory only | N/A | Service identity |
| Storage (hot) | Primary database | [retention] | At rest: [method] | Role-based |
| Storage (warm) | Archive storage | [retention] | At rest: [method] | Restricted |
| Storage (cold) | Compliance archive | [retention] | At rest: [method] | Audit-only |

---

## Regulated data paths

_Every path where PHI/PII flows must be documented here._

| Data type | Classification | Source | Destination | Protection | Audit |
|---|---|---|---|---|---|
| [e.g. SSN] | PHI | User input | Database | Encrypted field, TLS | Access logged |
| [e.g. Email] | PII | Registration | Database + Email service | TLS | Access logged |

### Regulated data flow diagram

```mermaid
flowchart LR
    subgraph "PHI Boundary"
        Input[User Input<br/>PHI fields] --> Encrypt[Field-level<br/>encryption]
        Encrypt --> DB[(Encrypted<br/>storage)]
        DB --> Decrypt[Decrypt on<br/>authorized read]
        Decrypt --> Display[Authorized<br/>display]
    end
    Input --> Audit[Audit log<br/>no PHI]
    Decrypt --> Audit
```

---

## External data integrations

| Integration | Direction | Data exchanged | Protocol | Auth | Regulated? |
|---|---|---|---|---|---|
| [External API] | Outbound | [data type] | HTTPS | API key | Yes / No |
