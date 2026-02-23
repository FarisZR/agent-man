# Termux Widget Setup

This document shows how to launch `agent-man` from an Android Termux widget and attach over SSH to a fixed host alias.

## Prerequisites

On Android:

- Termux
- Termux:Widget plugin

On remote host:

- `agent-man` repo present
- `bun`, `tmux`, `gh`, `codex`, `opencode` installed

## 1. Configure SSH host alias (Android)

Create or edit `~/.ssh/config` in Termux:

```sshconfig
Host agentbox
  HostName your.server.example.com
  User your_user
  Port 22
  IdentityFile ~/.ssh/id_ed25519
  ServerAliveInterval 30
  ServerAliveCountMax 3
```

## 2. Create widget script (Android)

Create script under `~/.shortcuts/agent-man`:

```bash
#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

ssh -t agentbox 'cd ~/agent-man && ./bin/agent-man-entry'
```

Make it executable:

```bash
chmod +x ~/.shortcuts/agent-man
```

## 3. Add widget

1. Long press home screen.
2. Add a **Termux:Widget** widget.
3. Select the `agent-man` script.

Tapping the widget will:

1. SSH into host alias `agentbox`.
2. Run `./bin/agent-man-entry` in `~/agent-man`.
3. Launch direct shell mode when app exits with code `40`.

## 4. Troubleshooting

- If the widget does not appear, verify `~/.shortcuts/` exists and script is executable.
- If SSH fails, run `ssh agentbox` manually in Termux and fix auth/host config.
- If app exits with dependency errors, install missing binaries on the remote host.
