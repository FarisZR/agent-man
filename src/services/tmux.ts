import type { AgentKind, SessionMeta } from "../app/types"
import type { Runner } from "./runner"
import { assertCommandSucceeded } from "./runner"

const SESSION_FORMAT =
  "#{session_name}|#{session_attached}|#{session_activity}|#{@agent_man_agent}|#{@agent_man_workspace}|#{@agent_man_repo}|#{@agent_man_created_at}"

export const DEFAULT_SESSION_PREFIX = "agent-man-"

export interface TmuxMetadata {
  agent: AgentKind
  workspace: string
  repo?: string
  createdAt: string
}

export function parseSessionLine(line: string): SessionMeta {
  const [name, attachedRaw, activityRaw, agentRaw, workspaceRaw, repoRaw, createdAtRaw] = line.split("|")

  if (!name) {
    throw new Error(`Invalid tmux session line: ${line}`)
  }

  const attachedCount = Number.parseInt(attachedRaw ?? "0", 10)
  const activityEpoch = Number.parseInt(activityRaw ?? "0", 10)
  const agent = agentRaw === "opencode" || agentRaw === "codex" ? agentRaw : undefined

  return {
    name,
    attached: Number.isFinite(attachedCount) && attachedCount > 0,
    activityEpoch: Number.isFinite(activityEpoch) ? activityEpoch : 0,
    agent,
    workspace: workspaceRaw || undefined,
    repo: repoRaw || undefined,
    createdAt: createdAtRaw || undefined,
  }
}

export function parseSessionList(stdout: string, prefix: string): SessionMeta[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseSessionLine)
    .filter((session) => session.name.startsWith(prefix))
    .sort((a, b) => b.activityEpoch - a.activityEpoch)
}

export function shellEscape(input: string): string {
  if (/^[A-Za-z0-9_./:-]+$/.test(input)) {
    return input
  }
  return `'${input.replace(/'/g, `'"'"'`)}'`
}

export function buildCommand(command: string[]): string {
  return command.map(shellEscape).join(" ")
}

export function buildUniqueSessionName(baseSlug: string, existingNames: Set<string>, prefix: string = DEFAULT_SESSION_PREFIX): string {
  const clean = baseSlug.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "session"
  const base = `${prefix}${clean}`
  if (!existingNames.has(base)) {
    return base
  }

  let index = 2
  while (existingNames.has(`${base}-${index}`)) {
    index += 1
  }

  return `${base}-${index}`
}

export class TmuxService {
  constructor(private readonly runner: Runner, private readonly prefix: string = DEFAULT_SESSION_PREFIX) {}

  async listSessions(): Promise<SessionMeta[]> {
    const result = await this.runner.run("tmux", ["list-sessions", "-F", SESSION_FORMAT])

    if (result.exitCode !== 0) {
      const stderr = result.stderr.trim()
      if (stderr.includes("no server running") || stderr.includes("failed to connect to server")) {
        return []
      }
      assertCommandSucceeded(result, "tmux list-sessions")
    }

    return parseSessionList(result.stdout, this.prefix)
  }

  async hasSession(name: string): Promise<boolean> {
    const sessions = await this.listSessions()
    return sessions.some((session) => session.name === name)
  }

  async createSession(name: string, cwd: string): Promise<void> {
    const result = await this.runner.run("tmux", ["new-session", "-d", "-s", name, "-c", cwd])
    assertCommandSucceeded(result, "tmux new-session")
  }

  async setMetadata(name: string, metadata: TmuxMetadata): Promise<void> {
    const pairs: Array<[string, string]> = [
      ["@agent_man_agent", metadata.agent],
      ["@agent_man_workspace", metadata.workspace],
      ["@agent_man_repo", metadata.repo ?? ""],
      ["@agent_man_created_at", metadata.createdAt],
    ]

    for (const [key, value] of pairs) {
      const result = await this.runner.run("tmux", ["set-option", "-t", name, "-q", key, value])
      assertCommandSucceeded(result, `tmux set-option ${key}`)
    }
  }

  async sendCommand(name: string, command: string[]): Promise<void> {
    const line = buildCommand(command)

    const literal = await this.runner.run("tmux", ["send-keys", "-t", name, "-l", line])
    assertCommandSucceeded(literal, "tmux send-keys")

    const enter = await this.runner.run("tmux", ["send-keys", "-t", name, "Enter"])
    assertCommandSucceeded(enter, "tmux send-keys Enter")
  }

  async attachSession(name: string): Promise<void> {
    const result = await this.runner.run("tmux", ["attach-session", "-t", name])
    assertCommandSucceeded(result, "tmux attach-session")
  }
}
