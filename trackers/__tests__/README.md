# Tracker Conformance Tests

Conformance suite for tracker adapters. Both `ado` and `github` adapters in [trackers/](../) must pass every test in [conformance.test.js](conformance.test.js). New adapters (Linear, Jira, …) prove they're ready for use by passing the same suite.

## Running

```
npm run test:trackers
```

Or directly: `node --test trackers/__tests__/conformance.test.js`.

Requires **bash** (Git Bash on Windows is fine) and **jq** on PATH.

## How the mocking works

The suite never touches a real ADO or GitHub API. Instead:

1. [fixtures/bin/az](fixtures/bin/az) and [fixtures/bin/gh](fixtures/bin/gh) are **stub bash scripts** that pattern-match on argv and either return canned JSON from [fixtures/responses/](fixtures/responses/) or simulate failures via `FIXTURE_*` env vars.
2. The test prepends `fixtures/bin/` to PATH before invoking the adapter, so all `az`/`gh` calls resolve to the stubs.
3. The adapter scripts are copied into a temp directory first, with placeholders like `ADO_PROJECT="YOUR_ADO_PROJECT"` sed-replaced (mirroring what the installer does).

## Adding a new adapter (Linear, Jira, …)

1. Create `trackers/<name>/` with all 6 contract scripts (see [trackers/README.md](../README.md) for the contract).
2. Create a stub for the adapter's CLI (e.g. `fixtures/bin/linear`) modelled after [fixtures/bin/gh](fixtures/bin/gh).
3. Add response fixtures under [fixtures/responses/](fixtures/responses/).
4. Add a golden file under [golden/<adapter>/get-issue.happy.md](golden/) for the expected stdout.
5. Add the adapter to the loop in each `describe(...)` block in [conformance.test.js](conformance.test.js).
6. Run `npm run test:trackers` — all 19 cases must pass for your adapter.

## Adding a new test case

The matrix is grouped into 5 `describe` blocks: arg-validation, happy-path-stdout, failure-modes, retry, contract-presence. Add cases to the relevant block and follow the existing naming convention: `<adapter>_<Method>_<Scenario>_<ExpectedOutcome>`.

For new failure modes, extend the stub's `FIXTURE_MODE` case statement.

## What the suite catches

Caught during the initial implementation — proof the harness is doing its job:

- `github/get-issue.sh` and `github/get-issue-children.sh` were missing `set -o pipefail`, so `gh ... | jq ...` swallowed gh's failure exit code.
- `ado/get-issue.sh` and `ado/get-issue-children.sh` captured `with_retry`'s stderr into the response var via `2>&1`, polluting the JSON for jq.
- `lib/retry.sh` was echoing the final error to stdout instead of stderr, violating the contract.

## What it does NOT catch

- Real-world API edge cases (rate limits, partial responses, schema drift).
- Auth flow correctness end-to-end.
- Cross-adapter consistency of richer fields (e.g. priority semantics).

For those, run the adapters against a real test ADO project / test GitHub repo manually before relying on them in production.
