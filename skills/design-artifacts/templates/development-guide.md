# Development Guide

**Project:** [project name]
**Last updated:** YYYY-MM-DD

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| [Runtime] | >= [version] | [install link] |
| [Package manager] | >= [version] | [install link] |
| [Database] | >= [version] | [install link or Docker image] |

---

## Local setup

```bash
# 1. Clone the repo
git clone [repo-url]
cd [project-name]

# 2. Install dependencies
[install command]

# 3. Set up environment
cp .env.example .env
# Edit .env with your local values

# 4. Set up the database
[database setup command — migrations, seed data]

# 5. Run the project
[run command]

# 6. Verify
# Open [URL] — you should see [expected result]
```

---

## Project structure

```
[project-root]/
├── src/              ← [description]
│   ├── [module]/     ← [description]
│   └── [module]/     ← [description]
├── tests/            ← [description]
├── docs/             ← [description]
└── [config files]    ← [description]
```

---

## Development conventions

### Code style

- [Linter and formatter — e.g., ESLint + Prettier, dotnet format]
- [Naming conventions — e.g., PascalCase for classes, camelCase for variables]
- [File organization — e.g., one class per file, group by feature]

### Git workflow

- Branch from `main` using `feature/<description>` or `fix/<description>`
- Write commit messages as `<type>: <description>` (feat, fix, refactor, test, docs, chore)
- Open a PR for review before merging

### Testing

- Run tests: `[test command]`
- Run specific tests: `[specific test command]`
- Test conventions: see `tasks/lessons.md` for project-specific patterns

---

## Common tasks

### Add a new endpoint

1. [Step 1]
2. [Step 2]
3. [Step 3]

### Add a new database entity

1. [Step 1]
2. [Step 2]
3. [Step 3]

### Run database migrations

```bash
[migration command]
```
