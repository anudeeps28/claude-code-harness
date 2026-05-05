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

## PHI/PII handling
- Never log, cache, or return PHI/PII in error messages (SSNs, DOBs, member IDs, health records)
- Never use PII as cache keys, log correlation IDs, or URL parameters
- Mask or redact PII in non-production environments and test fixtures
- If a code change handles regulated data, verify it flows through a path documented in the architecture's data classification table
- PHI/PII patterns to watch for: `memberId`, `subscriberId`, `ssn`, `dateOfBirth`, `dob`, `socialSecurityNumber`, fields matching `\d{3}-\d{2}-\d{4}`

## If you spot a vulnerability
- Flag it immediately in your output — don't silently fix it
- Describe: what the vulnerability is, where it is (file:line), and how to fix it
- Treat it as a hard block — do not proceed without addressing it
