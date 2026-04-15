---
paths:
  - "**/*.cs"
  - "**/*.ts"
  - "**/*.js"
  - "**/*.py"
---

# Security Rules

These rules apply when reading or modifying any code file.

## Never do these
- Never hardcode secrets, API keys, connection strings, or passwords
- Never concatenate user input into SQL strings — always use parameterized queries
- Never trust client-side input — validate at the API boundary
- Never log sensitive data (passwords, tokens, PII, full SSNs)
- Never disable SSL/TLS verification
- Never commit `.env`, `local.settings.json`, or `appsettings.Development.json`

## Always do these
- Use parameterized queries or ORM methods for all database access
- Validate and sanitize all user input at the API boundary (controllers, handlers, endpoints)
- Protect authenticated routes with your framework's auth middleware or decorators
- Store secrets in a vault or environment variables — reference by name, not value
- Use HTTPS for all external API calls

## If you spot a vulnerability
- Flag it immediately in your output — don't silently fix it
- Describe: what the vulnerability is, where it is (file:line), and how to fix it
- Treat it as a hard block — do not proceed without addressing it
