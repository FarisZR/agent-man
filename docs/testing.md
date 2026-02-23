# Testing

## Test layers

### Unit tests

Current unit coverage targets:

- agent command mapping
- dependency checks and missing-binary errors
- workspace input normalization and path handling
- tmux parsing, command escaping, and session naming

### Integration tests

Current integration coverage targets:

- controller orchestration of deps + workspace + tmux services
- source branching (`new_dir`, `existing_dir`, `gh_clone`)
- resume session validation

### E2E tests

E2E tests use OpenTUI test renderer and mock keyboard input.
Flow coverage is implemented in `src/app/App.e2e.test.tsx`.

Automated flows:

- resume existing session
- create OpenCode session from `new_dir`
- create Codex session from `gh_clone`
- direct shell exit path
- missing dependency error handling
- clone failure error handling

## Running tests

```bash
bun test
bun test --coverage
```
