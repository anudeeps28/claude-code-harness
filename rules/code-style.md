---
paths:
  - "src/**"
---

# Code Style Rules

These rules apply when reading or modifying source code files.

## General principles
- Follow the naming conventions defined in `tasks/lessons.md` — every project defines its own
- Be consistent with the existing codebase — match the style of surrounding code
- Prefer async/await patterns over blocking calls when the stack supports it

## What NOT to do
- Don't add docstrings or comments to code you didn't change
- Don't add type annotations beyond what the task requires
- Don't refactor surrounding code — only change what the task asks for
- Don't add error handling for impossible scenarios
- Don't create abstractions for one-time operations
- Don't "improve" code style in files you're only passing through

## Where to find stack-specific conventions
Read `tasks/lessons.md` — it defines the project's language, framework, naming patterns, DI conventions, logging style, and common patterns. If `lessons.md` doesn't cover a convention, match what already exists in the codebase.
