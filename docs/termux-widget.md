# Termux Shortcut Setup

Launch `agent-man` from your Android home screen with a single tap.

## One-liner setup (run in Termux)

```bash
curl -sL https://raw.githubusercontent.com/FarisZR/agent-man/main/bin/setup-termux-shortcut | bash
```

The script will ask for:

- **Remote hostname or IP** — your server
- **Remote username** — defaults to current user
- **SSH port** — defaults to `22`
- **Path to SSH private key** — defaults to `~/.ssh/id_ed25519`

It then does everything automatically:

1. Writes an SSH host alias `agentbox` to `~/.ssh/config`
2. Creates `~/.termux/widget/dynamic_shortcuts/` and `~/.shortcuts/icons/` with correct permissions
3. Writes the `agent-man` shortcut script (uses `bash -l` so remote PATH is fully loaded)
4. Downloads the golden-A icon

## After setup

1. Open the **Termux:Widget** app.
2. Tap **CREATE SHORTCUTS** in the Dynamic shortcuts section.
3. Long-press the Termux:Widget icon on your launcher.
4. Select `agent-man` and place it on your home screen.

Tapping the shortcut will SSH into `agentbox` and run `./bin/agent-man-entry` in `~/agent-man`.

## Prerequisites

On Android:

- Termux (F-Droid or GitHub release — **not** Play Store)
- Termux:Widget (same source as Termux)

On remote host:

- `agent-man` repo present at `~/agent-man`
- `bun`, `tmux`, `gh`, `opencode` installed

## Troubleshooting

- **Shortcut not appearing** — tap **CREATE SHORTCUTS** again in Termux:Widget after running the setup script.
- **SSH fails** — run `ssh agentbox` manually in Termux and fix auth or host config (`nano ~/.ssh/config`).
- **Script fails to start** — ensure the shebang in `~/.termux/widget/dynamic_shortcuts/agent-man` is `#!/data/data/com.termux/files/usr/bin/bash`.
- **`bun: command not found`** — the shortcut script uses `bash -l` to load the login profile; ensure bun's PATH line is in `~/.profile` or `~/.bashrc` on the remote host.
- **Dependency errors** — install missing binaries on the remote host.
