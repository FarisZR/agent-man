# CLI Flows

## Home screen

Main actions:

1. Resume Session
2. New OpenCode Session
3. New Codex Session
4. Direct Shell (no tmux)

Keyboard:

- Up/Down or `k`/`j`: move selection
- Enter: choose action
- `q`: quit app (code `0`)
- `ctrl+c`: immediate quit (code `130`)

## Resume flow

1. Open resume list from Home.
2. Select a session with arrows.
3. Press Enter to continue to attach orchestration.
4. Press `esc` to return Home.

## New session flow

1. Choose agent type (OpenCode or Codex) from Home.
2. Choose source kind:
- `new_dir`
- `existing_dir`
- `gh_clone`
3. Enter source-specific value.
4. Press Enter to submit and create session.
5. Press `esc` to move backward in the wizard.

## Direct shell flow

Selecting Direct Shell exits the app with code `40`.
`bin/agent-man-entry` maps code `40` to `exec "$SHELL" -l`.
