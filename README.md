# agent-man

`agent-man` is a terminal UI for managing persistent coding-agent sessions over SSH.
It uses OpenTUI React for the interface, Bun for runtime/test tooling, and tmux for durable sessions.

## Project Overview

`agent-man` solves a common remote workflow problem: start a coding-agent session once, disconnect safely, and resume later without losing context.

The app provides a keyboard-driven TUI to:

- list existing `agent-man-*` tmux sessions
- resume any existing managed session
- create a new OpenCode session in a workspace
- create a new Codex session with required flags
- exit to direct login shell mode when needed

Architecture and operational details are documented in:

- `docs/architecture.md`
- `docs/cli-flows.md`
- `docs/operations.md`
- `docs/testing.md`
- `docs/termux-widget.md`

## Features

- Persistent tmux-backed sessions with prefix `agent-man-`
- Session metadata stored in tmux options:
  - `@agent_man_agent`
  - `@agent_man_workspace`
  - `@agent_man_repo`
  - `@agent_man_created_at`
- Workspace creation modes:
  - `new_dir`
  - `existing_dir`
  - `gh_clone`
- Agent launch mappings:
  - OpenCode: `opencode`
  - Codex: `codex --dangerously-bypass-approvals-and-sandbox --search`
- Direct shell escape path via exit code `40` (handled by `bin/agent-man-entry`)
- Full automated test coverage with CI gate at 100% for lines/functions/statements/branches

## Requirements

Install these tools on the machine where `agent-man` runs:

- `bun`
- `tmux`
- `gh` (GitHub CLI)
- `opencode`
- `codex`

## Installation

1. Clone the repository:

```bash
git clone <your-repo-url> agent-man
cd agent-man
```

2. Install dependencies:

```bash
bun install
```

3. (Optional) verify local toolchain:

```bash
bun --version
tmux -V
gh --version
codex --version
opencode --version
```

## Run

Development mode:

```bash
bun run dev
```

Normal run:

```bash
bun run start
```

Recommended SSH entrypoint wrapper (supports direct-shell exit path):

```bash
./bin/agent-man-entry
```

## Testing

Run all tests:

```bash
bun run test
```

Run coverage:

```bash
bun run test:coverage
```

Run full CI-equivalent gate (coverage + threshold check):

```bash
bun run ci:test
```

This command must pass before shipping changes.

## Install + Test Quick Check

If you want one command sequence to validate installation end-to-end:

```bash
bun install
bunx tsc --noEmit
bun run ci:test
```

## Operational Notes

- Default workspace root: `~/agent-sessions`
- Attach behavior is multi-attach safe (`tmux attach-session -t ...`, no detach flag)
- Direct shell option exits app with code `40`; `bin/agent-man-entry` converts that to `exec "$SHELL" -l`
