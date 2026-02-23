# Linux / macOS Alias Setup

Launch `agent-man` from your terminal with a single command.

## One-liner setup (run on Linux or macOS)

```bash
curl -sL https://raw.githubusercontent.com/FarisZR/agent-man/main/scripts/setup-linux-alias | bash
```

The script will ask for:

- **Remote hostname or IP** — your server
- **Remote username** — defaults to current user
- **SSH port** — defaults to `22`
- **Path to SSH private key** — defaults to `~/.ssh/id_ed25519`

It then does everything automatically:

1. Writes an SSH host alias `agentbox` to `~/.ssh/config`
2. Adds an `agent-man` function to your shell config (auto-detects `~/.bashrc`, `~/.zshrc`, or `~/.config/fish/config.fish`)
3. Uses `bash -l` so the remote login profile (and bun's PATH) is loaded

## After setup

Reload your shell to start using the alias:

```bash
source ~/.bashrc   # or ~/.zshrc, etc.
```

Then run:

```bash
agent-man
```

This will SSH into `agentbox` and run `./bin/agent-man-entry` in `~/agent-man`.

## Prerequisites

On local machine:

- SSH client
- Bash, Zsh, or Fish shell

On remote host:

- `agent-man` repo present at `~/agent-man`
- `bun`, `tmux`, `gh`, `opencode` installed

## Troubleshooting

- **SSH fails** — run `ssh agentbox` manually and fix auth or host config (`nano ~/.ssh/config`).
- **`bun: command not found`** — the alias uses `bash -l` to load the login profile; ensure bun's PATH line is in `~/.profile` or `~/.bashrc` on the remote host.
- **Alias not found** — ensure you sourced your shell config after setup (`source ~/.bashrc`).
- **Dependency errors** — install missing binaries on the remote host.
