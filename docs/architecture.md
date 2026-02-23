# agent-man Architecture

## Purpose

`agent-man` is a terminal UI orchestrator for coding agent workflows over SSH.
It manages persistent tmux sessions and launches either OpenCode or Codex in per-workspace sessions.

## Runtime prerequisites

- `bun`
- `tmux`
- `gh`
- `codex`
- `opencode`

## Layers

- `src/index.tsx`: renderer bootstrap, fatal handler wiring, and final process routing.
- `src/app/*`: keyboard-driven state machine and screen rendering.
- `src/services/*`: command execution and domain services.

## Service interfaces

### Runner (`src/services/runner.ts`)

- `run(cmd, args, { cwd }) -> { stdout, stderr, exitCode }`
- deterministic output object used by all services

### Dependency service (`src/services/deps.ts`)

- `checkBinary(name)`
- `checkRequired(agent)`
- `assertRequired(agent)`

Common required binaries: `tmux`, `gh`.
Agent-specific binaries: `opencode` or `codex`.

### Workspace service (`src/services/workspace.ts`)

- home expansion: `~` and `~/...`
- directory resolution and creation
- repo normalization:
- `OWNER/REPO`
- `https://github.com/OWNER/REPO(.git)`
- `git@github.com:OWNER/REPO(.git)`
- clone via `gh repo clone <repo> <targetDir>`

### tmux service (`src/services/tmux.ts`)

- `listSessions()` using:
`tmux list-sessions -F "#{session_name}|#{session_attached}|#{session_activity}|#{@agent_man_agent}|#{@agent_man_workspace}|#{@agent_man_repo}|#{@agent_man_created_at}"`
- `createSession(name, cwd)`
- `setMetadata(name, metadata)`
- `sendCommand(name, argv)`
- `attachSession(name)` (multi-attach behavior, no `-d`)

## Session model

Every managed tmux session uses prefix `agent-man-` and stores metadata:

- `@agent_man_agent`
- `@agent_man_workspace`
- `@agent_man_repo`
- `@agent_man_created_at`

## Exit behavior

- Normal quit: code `0`
- Direct shell handoff: code `40` (handled by `bin/agent-man-entry`)
- Attach path: app tears down OpenTUI renderer, then attaches tmux session
