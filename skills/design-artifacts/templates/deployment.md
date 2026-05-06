# Deployment

**Project:** [project name]
**Last updated:** YYYY-MM-DD
**Source:** ARCHITECTURE.md Section 8 (Disaster recovery) + cloud platform choice

---

## Environments

| Environment | Purpose | URL | Infrastructure |
|---|---|---|---|
| Development | Local dev | `localhost:[port]` | Local / Docker |
| Staging | Pre-production testing | `staging.[domain]` | [cloud/on-prem] |
| Production | Live | `[domain]` | [cloud/on-prem] |

---

## Deployment steps

### Prerequisites

- [ ] [CLI tools required — e.g., az, aws, kubectl, docker]
- [ ] [Auth configured — e.g., az login, aws configure]
- [ ] [Environment variables set — reference .env.example]

### Deploy to staging

```bash
# Step 1: Build
[build command]

# Step 2: Run tests
[test command]

# Step 3: Deploy
[deploy command]

# Step 4: Verify
[smoke test or health check command]
```

### Deploy to production

```bash
# Same steps as staging with production config
[commands]
```

### Rollback procedure

```bash
# Roll back to previous version
[rollback command]
```

---

## Environment configuration

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Connection string for primary database |
| `API_KEY` | Yes | — | [description] |
| `LOG_LEVEL` | No | `info` | Logging verbosity |

_Secrets must be stored in a vault — never in code or config files._

---

## Infrastructure dependencies

| Dependency | Type | Provisioning | Notes |
|---|---|---|---|
| [Database] | Managed service | [Terraform / manual / CLI] | [version, tier] |
| [Cache] | Managed service | [method] | [version, tier] |
| [Queue] | Managed service | [method] | [version, tier] |

---

## Health checks

| Endpoint | Expected | Interval | Alert on |
|---|---|---|---|
| `GET /health` | `200 OK` | 30s | 3 consecutive failures |
| `GET /health/db` | `200 OK` | 60s | 1 failure |
