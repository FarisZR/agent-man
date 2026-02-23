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

## Core layers

- `src/index.tsx`: lifecycle bootstrap, renderer setup/cleanup, process exit routing.
- `src/app/*`: UI state machine and keyboard-driven screen routing.
- `src/services/*`: shell/tmux/workspace/dependency/agent command orchestration.

## Session model

Every managed tmux session uses the `agent-man-` prefix and stores metadata:

- `@agent_man_agent`
- `@agent_man_workspace`
- `@agent_man_repo`
- `@agent_man_created_at`

## Exit behavior

- Normal quit: code `0`
- Direct shell handoff: code `40` (handled by `bin/agent-man-entry`)
- Attach path: app tears down OpenTUI renderer, then attaches tmux session
