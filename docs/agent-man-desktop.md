# Desktop client shortcut

Run `agent-man` from any Linux or macOS shell by installing a tiny helper script.

## One-liner setup

```bash
curl -sL https://raw.githubusercontent.com/FarisZR/agent-man/main/bin/setup-desktop-agent-man | bash
```

It prompts you for the remote host, user, port, and identity file, then:

1. Appends a `Host agentbox` block to `~/.ssh/config` (skipping if it already exists).
2. Creates `~/.local/bin/agent-man` that SSHes into `agentbox` and runs `./bin/agent-man-entry` inside `~/agent-man` via `bash -l`.
3. Reminds you to add `~/.local/bin` to your `PATH` if it is not already available.

## Usage

After the script completes, either restart your shell or `source ~/.bashrc`/`~/.zshrc` if you added `~/.local/bin` to your `PATH` during the setup. Then just run:

```bash
agent-man
```

The helper forwards the login shell environment so `bun` and other dependencies defined in your remote profile are available.

## Troubleshooting

- If the SSH command still cannot locate `bun`, verify that `bun` is installed on the remote host and that the `bun` path is exported in `~/.profile` or another login script.
- If the helper script fails to write `~/.ssh/config`, ensure the directory exists and is writable.
- To inspect the generated shortcut, open `~/.local/bin/agent-man` and confirm the `bash -lc "cd ~/agent-man && ./bin/agent-man-entry"` line.
