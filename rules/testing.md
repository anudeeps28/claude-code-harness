---
paths:
  - "tests/**"
  - "test/**"
  - "**/*.test.*"
  - "**/*.spec.*"
  - "**/*Tests*/**"
---

# Testing Rules

These rules apply when reading or modifying test files.

---

## Unit Test Structure
- One test class/module per production class/module being tested
- Use descriptive test names: `MethodName_Scenario_ExpectedResult` or your project's convention
- Arrange/Act/Assert (or Given/When/Then) — keep each section visually separated
- Each test tests ONE behavior — if you need multiple asserts, they should all verify the same behavior

## What to unit test
- Happy path first, then edge cases
- Test behavior, not implementation — assert on outcomes, not internal method calls
- For services: test through the public interface, mock only external dependencies (DB, HTTP, file I/O)
- For controllers/handlers: test status codes, response shapes, and authorization
- Every new public method/endpoint gets at least one test

## What NOT to do in unit tests
- Don't mock internal project classes — only mock external boundaries
- Don't test trivial getters/setters or auto-generated code
- Don't add tests for code you didn't change (unless the task specifically asks)
- Don't use sleep/delay in tests — use async patterns or test clocks
- Don't skip flaky tests — fix them or delete them

---

## Integration Tests

Integration tests verify that components work together through real interactions.

### When to write integration tests
- Feature touches multiple components (service → repository → database)
- Feature interacts with external systems (APIs, message queues, file storage)
- Feature changes data flow between components
- Feature modifies shared state (database schema, cache, configuration)

### How to write integration tests
- Use real dependencies where practical — test databases, emulators, in-memory providers
- Test the full request path: input → processing → output
- Test error paths: what happens when a dependency fails?
- Test data integrity: does the data survive the full round trip?
- Clean up test data — each test starts with a known state

### Integration test naming
- `Feature_Scenario_ExpectedOutcome` for feature-level tests
- `ComponentA_To_ComponentB_Scenario_ExpectedOutcome` for interaction tests
- Example: `DocumentUpload_ValidPdf_ProcessedAndSearchable`
- Example: `OrderService_To_PaymentGateway_InsufficientFunds_ReturnsDeclined`

---

## Acceptance Tests

Acceptance tests verify the feature works as the user expects — derived from acceptance criteria in the test strategy.

### When to write acceptance tests
- Every user-facing feature gets acceptance tests
- Every acceptance criterion in the test strategy must map to at least one test
- API features: test the endpoint with real request/response payloads
- UI features: test the user interaction flow

### How to write acceptance tests
- Write from the user's perspective, not the developer's
- Test the golden path: "User does X → sees Y"
- Test critical edge cases: empty state, error state, boundary values
- Test authorization: right user can access, wrong user cannot
- Use descriptive names that read like requirements:
  - `User_CanUploadDocument_AndSearchByContent`
  - `Admin_CanDeleteUser_RegularUser_CanNot`

---

## Regression Guards

When modifying existing code:

- Run the full test suite — not just tests for the changed code
- If an existing test breaks and it's unrelated to your feature, that's a regression — fix it
- Never delete a passing test to make your feature "work"
- If a test needs to change because behavior intentionally changed, update the test AND document why

---

## Where to find stack-specific conventions
Read `tasks/lessons.md` — it defines the test framework (xUnit, Jest, pytest, etc.), assertion style, mocking libraries, test commands, and any project-specific patterns.
