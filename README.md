# agent-man

Seamless multi-device coding workflows with persistent AI agents.

`agent-man` is a terminal UI for managing persistent coding-agent sessions across multiple devices. Work on your phone while commuting, pick up exactly where you left off on your laptop, and let AI agents continue working in the background—synced across all your devices in real-time.

## The Problem

You're working on code on your phone while commuting home. You get to your laptop and want to continue, but your agent session is gone. Even if it wasn't, you'd lose all context and have to restart. Time wasted, momentum lost.

## The Solution

`agent-man` gives you:

- **Persistent agent sessions** that survive disconnections across any device
- **Real-time session sync** between your phone, laptop, and desktop via tmux
- **Continuous background work** while you switch devices—agents keep running and making progress
- **One-command resume** to jump back into any session from anywhere
- **Multiple concurrent agents** with independent sessions for parallel work

## Core Features

- **Multi-device support**: Work from your phone, laptop, or desktop—sessions stay in sync
- **OpenCode agent** integration for autonomous coding tasks
- **Codex agent** support for advanced search and analysis
- **Multiple simultaneous sessions**: Run different agents on different projects at the same time
- **Tmux-based persistence**: Sessions survive network drops, terminal crashes, and device switches
- **Keyboard-driven TUI**: Fast, efficient navigation without touching the mouse
- **Session management**:
  - Resume any existing session in one keystroke
  - Create new OpenCode or Codex sessions
  - Organize sessions by project and agent type
- **Seamless device switching**: Start work on one device, continue on another—everything syncs automatically

## How It Works

1. Start an agent session on any device (phone, laptop, desktop)
2. Work on your coding task for a bit
3. Close your terminal, switch devices, go offline—your session is safe
4. From any other device, open `agent-man` and resume that exact session
5. Your agent keeps working in the background while you're away or on another device
6. Changes sync in real-time across all devices via tmux

## Typical Workflow

```
Phone (on commute):
  → Launch agent-man
  → Start new OpenCode session on project-x
  → Write some code, ask agent questions
  → Close terminal (session persists)

Laptop (at home):
  → SSH in, launch agent-man
  → Resume project-x session
  → See all the work the agent has done
  → Continue where you left off
  → Agent keeps working in background while you check email
  
Desktop (back at office):
  → Open agent-man
  → Same project-x session
  → All changes from phone + laptop already there
  → Real-time sync via tmux
```

## Technical Foundation

`agent-man` uses OpenTUI React for the interface, Bun for runtime/test tooling, and tmux for durable sessions. This combination gives you a fast, responsive TUI that keeps your sessions alive across any disconnection.

## Implementation Details

Architecture and operational details are documented in:

- `docs/architecture.md`
- `docs/cli-flows.md`
- `docs/operations.md`
- `docs/testing.md`
- `docs/termux-widget.md`

### Session Architecture

- Persistent tmux-backed sessions with prefix `agent-man-`
- Session metadata stored in tmux options:
  - `@agent_man_agent` (which agent: OpenCode or Codex)
  - `@agent_man_workspace` (project directory)
  - `@agent_man_repo` (repository info)
  - `@agent_man_created_at` (when session was created)
- Workspace creation modes: `new_dir`, `existing_dir`, `gh_clone`
- Full automated test coverage with CI gate at 100% for lines/functions/statements/branches

## Requirements

Install these tools on the machine where `agent-man` runs:

- `bun`
- `tmux`
- `gh` (GitHub CLI)
- `opencode`
- `codex`

## Installation

1. Clone the repository:

```bash
git clone <your-repo-url> agent-man
cd agent-man
```

2. Install dependencies:

```bash
bun install
```

3. (Optional) verify local toolchain:

```bash
bun --version
tmux -V
gh --version
codex --version
opencode --version
```

## Run

Development mode:

```bash
bun run dev
```

Normal run:

```bash
bun run start
```

Recommended SSH entrypoint wrapper (supports direct-shell exit path):

```bash
./bin/agent-man-entry
```

## Testing

Run all tests:

```bash
bun run test
```

Run coverage:

```bash
bun run test:coverage
```

Run full CI-equivalent gate (coverage + threshold check):

```bash
bun run ci:test
```

This command must pass before shipping changes.

## Install + Test Quick Check

If you want one command sequence to validate installation end-to-end:

```bash
bun install
bunx tsc --noEmit
bun run ci:test
```

## Operational Notes

- Default workspace root: `~/agent-sessions`
- Attach behavior is multi-attach safe (`tmux attach-session -t ...`, no detach flag)
- Direct shell option exits app with code `40`; `bin/agent-man-entry` converts that to `exec "$SHELL" -l`
