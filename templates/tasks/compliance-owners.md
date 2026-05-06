# Compliance Owners

Named owners for regulated-data sign-offs. Skills that touch PHI, PII, or SOC 2 boundaries require sign-off from the relevant owner before marking assumptions validated or architecture decisions accepted.

---

## Roles

| Domain | Role | Owner | Contact |
|---|---|---|---|
| PHI / HIPAA | Privacy Officer | YOUR_PRIVACY_OFFICER | YOUR_PRIVACY_OFFICER_CONTACT |
| PII / GDPR | Privacy Officer | YOUR_PRIVACY_OFFICER | YOUR_PRIVACY_OFFICER_CONTACT |
| SOC 2 / Security | Security Lead | YOUR_SECURITY_LEAD | YOUR_SECURITY_LEAD_CONTACT |
| PCI-DSS | Security Lead | YOUR_SECURITY_LEAD | YOUR_SECURITY_LEAD_CONTACT |

---

## When sign-off is required

- `/decision-brief` — any Dealbreaker assumption touching regulated data cannot be marked "Validated" without the named owner's sign-off
- `/architect` — Section 6 (Security architecture) requires sign-off when regulated data is in scope
- `/architect-critique` — flags missing sign-off as a BLOCK finding

## How to obtain sign-off

1. Share the relevant artifact (Decision Brief or ARCHITECTURE.md) with the named owner
2. The owner reviews the regulated-data handling sections
3. The owner confirms by adding their name + date to the sign-off field
4. Update the artifact to reflect sign-off obtained
