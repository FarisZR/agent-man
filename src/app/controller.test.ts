import { describe, expect, it } from "bun:test"
import { AgentManController } from "./controller"
import type { AgentKind, SessionMeta } from "./types"

class FakeDeps {
  checks: AgentKind[] = []

  async assertRequired(agent: AgentKind) {
    this.checks.push(agent)
  }
}

class FakeWorkspace {
  newDirCalls: Array<{ root: string; dirName: string }> = []
  existingCalls: string[] = []
  cloneCalls: Array<{ repoInput: string; workspaceRoot: string }> = []

  async prepareNewDirectory(root: string, dirName: string): Promise<string> {
    this.newDirCalls.push({ root, dirName })
    return `${root}/${dirName}`
  }

  async resolveExistingDirectory(dirPath: string): Promise<string> {
    this.existingCalls.push(dirPath)
    return dirPath
  }

  async cloneRepo(repoInput: string, workspaceRoot: string): Promise<{ repo: string; targetDir: string }> {
    this.cloneCalls.push({ repoInput, workspaceRoot })
    return {
      repo: "owner/repo",
      targetDir: `${workspaceRoot}/owner-repo`,
    }
  }
}

class FakeTmux {
  sessions: SessionMeta[] = []
  created: Array<{ name: string; cwd: string }> = []
  metadata: Array<{ name: string; metadata: { agent: AgentKind; workspace: string; repo?: string; createdAt: string } }> = []
  sent: Array<{ name: string; command: string[] }> = []

  async listSessions(): Promise<SessionMeta[]> {
    return this.sessions
  }

  async hasSession(name: string): Promise<boolean> {
    return this.sessions.some((session) => session.name === name)
  }

  async createSession(name: string, cwd: string): Promise<void> {
    this.created.push({ name, cwd })
    this.sessions.push({ name, attached: false, activityEpoch: 0 })
  }

  async setMetadata(
    name: string,
    metadata: { agent: AgentKind; workspace: string; repo?: string; createdAt: string },
  ): Promise<void> {
    this.metadata.push({ name, metadata })
  }

  async sendCommand(name: string, command: string[]): Promise<void> {
    this.sent.push({ name, command })
  }
}

function createController() {
  const deps = new FakeDeps()
  const workspace = new FakeWorkspace()
  const tmux = new FakeTmux()

  const controller = new AgentManController({
    deps,
    workspace,
    tmux,
  })

  return { controller, deps, workspace, tmux }
}

describe("AgentManController", () => {
  it("loads sessions", async () => {
    const { controller, tmux } = createController()
    tmux.sessions = [{ name: "agent-man-a", attached: false, activityEpoch: 100 }]
    await expect(controller.loadSessions()).resolves.toEqual(tmux.sessions)
  })

  it("resumes existing sessions and rejects unknown ones", async () => {
    const { controller, tmux } = createController()
    tmux.sessions = [{ name: "agent-man-a", attached: false, activityEpoch: 100 }]

    await expect(controller.resumeSession("agent-man-a")).resolves.toEqual({
      reason: "attach",
      code: 0,
      sessionName: "agent-man-a",
    })

    await expect(controller.resumeSession("missing")).rejects.toThrow("Session not found")
  })

  it("creates opencode sessions from new directory source", async () => {
    const { controller, deps, workspace, tmux } = createController()

    const result = await controller.createSession({
      agent: "opencode",
      source: "new_dir",
      workspaceRoot: "/tmp/agent-sessions",
      newDirName: "proj-a",
    })

    expect(deps.checks).toEqual(["opencode"])
    expect(workspace.newDirCalls).toEqual([{ root: "/tmp/agent-sessions", dirName: "proj-a" }])
    expect(tmux.created).toHaveLength(1)
    const created = tmux.created[0]
    if (!created) {
      throw new Error("expected created session")
    }
    expect(tmux.sent[0]).toEqual({ name: created.name, command: ["exec", "opencode"] })
    expect(result.reason).toBe("attach")
    expect(result.sessionName).toBe(created.name)
  })

  it("creates codex sessions from existing directory source", async () => {
    const { controller, deps, workspace, tmux } = createController()

    const result = await controller.createSession({
      agent: "codex",
      source: "existing_dir",
      workspaceRoot: "/unused",
      existingDirPath: "/work/repo",
    })

    expect(deps.checks).toEqual(["codex"])
    expect(workspace.existingCalls).toEqual(["/work/repo"])
    const created = tmux.created[0]
    if (!created) {
      throw new Error("expected created session")
    }
    expect(tmux.sent[0]).toEqual({
      name: created.name,
      command: ["exec", "codex", "--dangerously-bypass-approvals-and-sandbox", "--search"],
    })
    expect(result.reason).toBe("attach")
  })

  it("creates sessions from gh clone source and stores repo metadata", async () => {
    const { controller, workspace, tmux } = createController()

    await controller.createSession({
      agent: "codex",
      source: "gh_clone",
      workspaceRoot: "/tmp/agent-sessions",
      repoInput: "owner/repo",
    })

    expect(workspace.cloneCalls).toEqual([{ repoInput: "owner/repo", workspaceRoot: "/tmp/agent-sessions" }])
    expect(tmux.metadata[0]?.metadata.repo).toBe("owner/repo")
  })

  it("rejects unsupported source values", async () => {
    const { controller } = createController()

    await expect(
      controller.createSession({
        agent: "codex",
        source: "invalid_source" as never,
        workspaceRoot: "/tmp/agent-sessions",
      }),
    ).rejects.toThrow("Unsupported source")
  })

  it("creates unique session names when collisions exist", async () => {
    const { controller, tmux } = createController()
    tmux.sessions = [
      { name: "agent-man-opencode-proj-a", attached: false, activityEpoch: 100 },
      { name: "agent-man-opencode-proj-a-2", attached: false, activityEpoch: 90 },
    ]

    const result = await controller.createSession({
      agent: "opencode",
      source: "new_dir",
      workspaceRoot: "/tmp/agent-sessions",
      newDirName: "proj-a",
    })

    expect(result.sessionName).toBe("agent-man-opencode-proj-a-3")
  })
})
