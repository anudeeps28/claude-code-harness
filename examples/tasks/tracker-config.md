# Tracker Config

> Configuration for your project tracker and environment URLs.
> The /pa and /troubleshoot skills read this file to look up API endpoints and tracker details.
> **This is an example** — replace all values with your actual resources and endpoints.

---

## Issue Tracker

**Type:** GitHub

**Project/Board:** your-org/your-project

**Sprint/Iteration naming:** Sprint N (e.g. "Sprint 5")

### GitHub sprint settings

```
sprint_mode = milestone
```

Milestones are named "Sprint 1", "Sprint 2", etc. in the GitHub repo.

---

## Environments

| Environment | API Base URL | Notes |
|-------------|--------------|-------|
| Local | `http://localhost:5000` | Docker required (`docker compose up`) |
| Dev | `https://api-dev.your-project.example.com` | Auto-deployed from `develop` branch |
| Staging | `https://api-staging.your-project.example.com` | Deploy manually before release |
| Production | `https://api.your-project.example.com` | Main branch only via CI |

---

## Key Endpoints

| Name | Path | Notes |
|------|------|-------|
| Query API | `/api/query/ask` | Bearer token required |
| Ingest trigger | `/api/ingest` | Managed Identity in Azure, token in local |
| Health check | `/api/health` | No auth required |

---

## Auth

**Method:** Bearer token (local/dev), Managed Identity (cloud)

**Where to get tokens:** Your identity provider's admin portal → App Registration → Certificates & secrets

---

## Cloud Resources

| Resource | Name | Notes |
|----------|------|-------|
| Container App (API) | `your-containerapp-api` | Branch testing target |
| Container App (Workers) | `your-containerapp-workers` | Branch testing target |
| App Service (API) | `your-appservice-api` | Post-merge production |
| Function App | `your-functionapp` | Post-merge production |
| Search Service | `your-search-service` | Index: `your-index-name` |
| Key Vault | `your-keyvault` | Secrets for local dev |
| Storage Account | `your-storage` | Container: `your-container` |
| Resource Group | `your-resource-group` | All resources above live here |
| Container Registry | `your-registry.azurecr.io` | Docker images |

---

## Notes

- SQL emulator requires Docker Desktop 4.x+ on Windows
- If your architecture has both a Function App and Container App, stop the Function App before deploying to Container App to prevent racing
- Check search service tier limits before creating extra indexes in dev
- Local `.env` file (not committed) holds API keys and connection strings

---

## Smoke Test Queries

> Define your smoke test queries here. The /deploy skill reads this section.

| # | Query | Expected Answer |
|---|-------|-----------------|
| 1 | [your test query] | [expected result] |
| 2 | [your test query] | [expected result] |