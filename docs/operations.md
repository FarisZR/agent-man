# Operations

## Runtime dependencies

`agent-man` requires these binaries on the host:

- `tmux`
- `gh`
- `opencode`
- `codex`

Dependency validation runs before creating new sessions.

## Workspace defaults

- default workspace root: `~/agent-sessions`
- session prefix: `agent-man-`

## tmux metadata contract

Each managed session has:

- `@agent_man_agent`
- `@agent_man_workspace`
- `@agent_man_repo`
- `@agent_man_created_at`

Session discovery format:

```bash
tmux list-sessions -F "#{session_name}|#{session_attached}|#{session_activity}|#{@agent_man_agent}|#{@agent_man_workspace}|#{@agent_man_repo}|#{@agent_man_created_at}"
```

## Attach behavior

Attach uses:

```bash
tmux attach-session -t <session_name>
```

No `-d` flag is used, so existing attached clients are not detached.

## Entry wrapper

Use `bin/agent-man-entry` as the SSH/session entry point.

- App exit `0`: normal return
- App exit `40`: wrapper executes `"$SHELL" -l` for direct shell mode
