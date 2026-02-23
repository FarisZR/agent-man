import { describe, expect, it } from "bun:test"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import type { CommandResult, Runner } from "./runner"
import {
  WorkspaceService,
  expandHome,
  normalizeRepoInput,
  repoDirName,
  sessionSlugFromPath,
} from "./workspace"

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

describe("workspace helpers", () => {
  it("expands home paths", () => {
    expect(expandHome("~")).toBe(os.homedir())
    expect(expandHome("~/agent")).toBe(path.join(os.homedir(), "agent"))
    expect(expandHome("/tmp/agent")).toBe("/tmp/agent")
  })

  it("normalizes repository forms", () => {
    expect(normalizeRepoInput("owner/repo")).toBe("owner/repo")
    expect(normalizeRepoInput("https://github.com/owner/repo")).toBe("owner/repo")
    expect(normalizeRepoInput("https://github.com/owner/repo.git")).toBe("owner/repo")
    expect(normalizeRepoInput("git@github.com:owner/repo.git")).toBe("owner/repo")
    expect(() => normalizeRepoInput("bad value")).toThrow("Invalid repository format")
  })

  it("derives repo and session slugs", () => {
    expect(repoDirName("owner/repo")).toBe("owner-repo")
    expect(sessionSlugFromPath("/tmp/My Repo")).toBe("my-repo")
    expect(sessionSlugFromPath("/tmp/!!!")).toBe("workspace")
  })
})

describe("WorkspaceService", () => {
  it("prepares a new directory under the workspace root", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agent-man-workspace-"))
    const runner = new QueueRunner()
    const service = new WorkspaceService(runner)

    const dir = await service.prepareNewDirectory(tempRoot, "proj-a")
    expect(dir).toBe(path.join(tempRoot, "proj-a"))

    await rm(tempRoot, { recursive: true, force: true })
  })

  it("resolves existing directories and rejects files", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agent-man-existing-"))
    const filePath = path.join(tempRoot, "file.txt")
    await writeFile(filePath, "data")

    const service = new WorkspaceService(new QueueRunner())
    await expect(service.resolveExistingDirectory(tempRoot)).resolves.toBe(tempRoot)
    await expect(service.resolveExistingDirectory(filePath)).rejects.toThrow("Path is not a directory")

    await rm(tempRoot, { recursive: true, force: true })
  })

  it("clones repos using gh", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agent-man-clone-"))

    const runner = new QueueRunner()
    runner.enqueue({ stdout: "", stderr: "", exitCode: 0 })

    const service = new WorkspaceService(runner)
    const result = await service.cloneRepo("owner/repo", tempRoot)

    expect(result.repo).toBe("owner/repo")
    expect(result.targetDir).toBe(path.join(tempRoot, "owner-repo"))
    expect(runner.calls[0]).toEqual({
      cmd: "gh",
      args: ["repo", "clone", "owner/repo", path.join(tempRoot, "owner-repo")],
    })

    await rm(tempRoot, { recursive: true, force: true })
  })

  it("fails cloning when gh command fails", async () => {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), "agent-man-clone-fail-"))

    const runner = new QueueRunner()
    runner.enqueue({ stdout: "", stderr: "clone failed", exitCode: 1 })

    const service = new WorkspaceService(runner)
    await expect(service.cloneRepo("owner/repo", tempRoot)).rejects.toThrow("clone failed")

    await rm(tempRoot, { recursive: true, force: true })
  })
})
