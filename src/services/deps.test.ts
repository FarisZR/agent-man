import { describe, expect, it } from "bun:test"
import { DependencyError, DependencyService } from "./deps"
import type { CommandResult, Runner } from "./runner"

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

describe("DependencyService", () => {
  it("checks binaries", async () => {
    const runner = new QueueRunner()
    runner.enqueue({ stdout: "/usr/bin/tmux\n", stderr: "", exitCode: 0 })
    const deps = new DependencyService(runner)

    await expect(deps.checkBinary("tmux")).resolves.toBe(true)
    expect(runner.calls[0]).toEqual({
      cmd: "bash",
      args: ["-lc", "command -v tmux"],
    })
  })

  it("returns checkRequired results per binary", async () => {
    const runner = new QueueRunner()
    runner.enqueue({ stdout: "", stderr: "", exitCode: 0 })
    runner.enqueue({ stdout: "", stderr: "", exitCode: 1 })
    runner.enqueue({ stdout: "", stderr: "", exitCode: 0 })
    const deps = new DependencyService(runner)

    const checks = await deps.checkRequired("opencode")
    expect(checks).toEqual([
      { name: "tmux", installed: true },
      { name: "gh", installed: false },
      { name: "opencode", installed: true },
    ])
  })

  it("throws DependencyError for missing binaries", async () => {
    const runner = new QueueRunner()
    runner.enqueue({ stdout: "", stderr: "", exitCode: 1 })
    runner.enqueue({ stdout: "", stderr: "", exitCode: 0 })
    runner.enqueue({ stdout: "", stderr: "", exitCode: 1 })

    const deps = new DependencyService(runner)

    try {
      await deps.assertRequired("codex")
      throw new Error("expected assertRequired to throw")
    } catch (error) {
      expect(error).toBeInstanceOf(DependencyError)
      expect(error).toBeInstanceOf(Error)
      expect((error as Error).message).toContain("Missing required binaries")
      expect((error as DependencyError).missing).toEqual(["tmux", "codex"])
    }
  })
})
