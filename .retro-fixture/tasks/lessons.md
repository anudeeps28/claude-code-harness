# Lessons Learned

## Known Build Fixes

- Missing null check on User.Email — happens often, fix with `?.` operator before `.ToLower()`

## Patterns Code Rabbit Flags

- Async method without ConfigureAwait(false)
