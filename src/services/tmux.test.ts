import { describe, expect, it } from "bun:test"
import type { CommandResult, Runner } from "./runner"
import {
  DEFAULT_SESSION_PREFIX,
  TmuxService,
  buildCommand,
  buildUniqueSessionName,
  parseSessionLine,
  parseSessionList,
  shellEscape,
} from "./tmux"

class QueueRunner implements Runner {
  private queue: CommandResult[] = []
  calls: Array<{ cmd: string; args: string[] }> = []

  enqueue(result: CommandResult) {
    this.queue.push(result)
  }

  async run(cmd: string, args: string[] = []): Promise<CommandResult> {
    this.calls.push({ cmd, args })
    const next = this.queue.shift()
    if (!next) {
      throw new Error("missing queued result")
    }

    return next
  }
}

describe("tmux helpers", () => {
  it("parses session metadata lines", () => {
    const session = parseSessionLine("agent-man-a|1|100|codex|/tmp/a|owner/repo|2026-01-01T00:00:00.000Z")
    expect(session).toEqual({
      name: "agent-man-a",
      attached: true,
      activityEpoch: 100,
      agent: "codex",
      workspace: "/tmp/a",
      repo: "owner/repo",
      createdAt: "2026-01-01T00:00:00.000Z",
    })
  })

  it("throws on invalid session lines", () => {
    expect(() => parseSessionLine("|1|2|3")).toThrow("Invalid tmux session line")
  })

  it("filters and sorts sessions by prefix and activity", () => {
    const output = [
      "agent-man-a|0|10|opencode|/tmp/a||",
      "other|0|99|codex|/tmp/x||",
      "agent-man-b|1|20|codex|/tmp/b||",
    ].join("\n")

    const sessions = parseSessionList(output, DEFAULT_SESSION_PREFIX)
    expect(sessions.map((s) => s.name)).toEqual(["agent-man-b", "agent-man-a"])
  })

  it("escapes shell args and builds command lines", () => {
    expect(shellEscape("safe/path")).toBe("safe/path")
    expect(shellEscape("bad value")).toBe("'bad value'")
    expect(buildCommand(["codex", "--search", "repo with spaces"])).toBe("codex --search 'repo with spaces'")
  })

  it("creates unique session names with suffixes", () => {
    const existing = new Set(["agent-man-work", "agent-man-work-2"])
    expect(buildUniqueSessionName("work", existing)).toBe("agent-man-work-3")
    expect(buildUniqueSessionName("new-work", existing)).toBe("agent-man-new-work")
    expect(buildUniqueSessionName("!!!", new Set())).toBe("agent-man-session")
  })
})

describe("TmuxService", () => {
  it("handles no tmux server as an empty list", async () => {
    const runner = new QueueRunner()
    runner.enqueue({ stdout: "", stderr: "no server running on /tmp/tmux-1000/default", exitCode: 1 })

    const service = new TmuxService(runner)
    await expect(service.listSessions()).resolves.toEqual([])
  })

  it("lists, creates, metadata-writes, and sends command", async () => {
    const runner = new QueueRunner()
    runner.enqueue({ stdout: "agent-man-a|0|10|opencode|/tmp/a||\n", stderr: "", exitCode: 0 })
    runner.enqueue({ stdout: "", stderr: "", exitCode: 0 })
    runner.enqueue({ stdout: "", stderr: "", exitCode: 0 })
    runner.enqueue({ stdout: "", stderr: "", exitCode: 0 })
    runner.enqueue({ stdout: "", stderr: "", exitCode: 0 })
    runner.enqueue({ stdout: "", stderr: "", exitCode: 0 })
    runner.enqueue({ stdout: "", stderr: "", exitCode: 0 })
    runner.enqueue({ stdout: "", stderr: "", exitCode: 0 })

    const service = new TmuxService(runner)

    const sessions = await service.listSessions()
    expect(sessions).toHaveLength(1)

    await service.createSession("agent-man-a", "/tmp/a")
    await service.setMetadata("agent-man-a", {
      agent: "opencode",
      workspace: "/tmp/a",
      repo: "owner/repo",
      createdAt: "2026-02-23T00:00:00.000Z",
    })
    await service.sendCommand("agent-man-a", ["opencode"])

    expect(runner.calls[1]).toEqual({
      cmd: "tmux",
      args: ["new-session", "-d", "-s", "agent-man-a", "-c", "/tmp/a"],
    })
    expect(runner.calls[7]).toEqual({
      cmd: "tmux",
      args: ["send-keys", "-t", "agent-man-a", "Enter"],
    })
  })

  it("reports failed tmux commands", async () => {
    const runner = new QueueRunner()
    runner.enqueue({ stdout: "", stderr: "permission denied", exitCode: 1 })
    const service = new TmuxService(runner)
    await expect(service.createSession("agent-man-x", "/tmp/x")).rejects.toThrow("permission denied")
  })
})
