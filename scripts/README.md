# Scripts

Maintainer tooling for this repository: the dogfood links and the boundary checks that `npm test` runs.

## Interface

**Inputs:** `node scripts/dogfood.js` (`npm run dogfood`) takes no arguments; it reads `.claude/.harness-manifest.json` to find the selected tracker and code-platform adapters. The checks in `lib/boundaries.js` each take the repo root, and some take an options object whose only key is `exempt`; any other key is refused by name. They read `skills/`, `agents/`, `rules/`, `CONTEXT.md` and the code modules' `README.md` files.

**Outputs:** `dogfood.js` turns the `.claude/` entries for skills, agents, hooks, rules and the selected adapters into symlinks to the repo source and prints what it linked. Every check returns a list of problem strings, each naming the file or module at fault; an empty list means the boundary holds. `scripts/__tests__/boundaries.test.js` fails `npm test` on any problem.

**Callable parts:** `dogfood.js` and `dogfood-links.js` (`planLinks`, the link plan). The checks in `lib/boundaries.js`: `checkOwners`, `checkRulesTable`, `checkInterfaces`, `checkCallableParts`, `checkAgentOutputs`, `checkSharedInputs`, `checkSkillUsage`, `checkReadmes`, `checkReadmeCallable`, `checkAdrModules`, `checkAdrCitations`, `checkAcceptedAdrsCited` and `checkContextMap`, plus the helpers and data `agentOwners`, `readInterface`, `callersOf`, `namedFiles`, `buildPointerIndex`, `requiredExports`, `readArchitectureMap`, `moduleIds` and `CODE_MODULES` (the five code modules). That is every export of `lib/boundaries.js`. `checkReadmeCallable` also reports a require, `require.resolve` or `import()` whose argument is not a string literal, as `<file>:<line>: cannot check a non-literal require`. No other module requires a file from here.

**Never breaks:** Pure Node.js stdlib, no runtime dependencies. A check only reads the repo and never edits it. `dogfood.js` converts only the dirs it names and needs a base install first.
