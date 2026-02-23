# CLI Flows

## Home screen

Main options:

1. Up to 3 most recent sessions (resume directly)
2. `More sessions (N)` when more than 3 exist
3. New OpenCode Session
4. New Codex Session
5. Direct Shell (no tmux)

Keyboard:

- Up/Down or `k`/`j`: move selection
- Enter: choose action
- `q`: quit app (code `0`)
- `ctrl+c`: immediate quit (code `130`)

## Resume flow

1. Select one of the top 3 sessions from Home and press Enter.
2. For older sessions, open `More sessions (N)` and select from the full list.
3. Press `esc` to return Home.

## New session flow

1. Choose agent type (OpenCode or Codex) from Home.
2. Choose source kind:
- `new_dir`
- `existing_dir`
- `gh_clone`
3. Enter source-specific value.
4. Paste is supported for form inputs (paths/repo URLs).
5. Press Enter to submit and create session.
6. Press `esc` to move backward in the wizard.

## Direct shell flow

Selecting Direct Shell exits the app with code `40`.
`bin/agent-man-entry` maps code `40` to `exec "$SHELL" -l`.
