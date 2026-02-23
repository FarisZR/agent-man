# CLI Flows

## Home screen

Main options:

1. New OpenCode Session
2. New Codex Session
3. Direct Shell (no tmux)
4. Up to 3 most recent sessions (resume directly)
5. `More sessions (N)` when more than 3 exist

Keyboard:

- Up/Down or `k`/`j`: move selection
- Enter: choose action
- `q`: quit app (code `0`)
- `ctrl+c`: immediate quit (code `130`)

## Resume flow

1. Move down past the fixed options to the recent sessions section.
2. Select one of the recent sessions from Home and press Enter.
3. For older sessions, open `More sessions (N)` and select from the full list.
4. Press `esc` to return Home.

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
