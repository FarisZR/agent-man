import type { AppController, AppExit, CreateSessionInput, SessionMeta } from "./types"
import { agentCommand } from "../services/agent"
import { DependencyService } from "../services/deps"
import { TmuxService, buildUniqueSessionName } from "../services/tmux"
import { WorkspaceService, sessionSlugFromPath } from "../services/workspace"

export interface AppServices {
  deps: DependencyService
  tmux: TmuxService
  workspace: WorkspaceService
}

export class AgentManController implements AppController {
  constructor(private readonly services: AppServices) {}

  async loadSessions(): Promise<SessionMeta[]> {
    return this.services.tmux.listSessions()
  }

  async resumeSession(sessionName: string): Promise<AppExit> {
    const exists = await this.services.tmux.hasSession(sessionName)
    if (!exists) {
      throw new Error(`Session not found: ${sessionName}`)
    }

    return {
      reason: "attach",
      code: 0,
      sessionName,
    }
  }

  async createSession(input: CreateSessionInput): Promise<AppExit> {
    await this.services.deps.assertRequired(input.agent)

    let workspacePath: string
    let repo: string | undefined

    switch (input.source) {
      case "new_dir":
        workspacePath = await this.services.workspace.prepareNewDirectory(input.workspaceRoot, input.newDirName ?? "")
        break
      case "existing_dir":
        workspacePath = await this.services.workspace.resolveExistingDirectory(input.existingDirPath ?? "")
        break
      case "gh_clone": {
        const clone = await this.services.workspace.cloneRepo(input.repoInput ?? "", input.workspaceRoot)
        workspacePath = clone.targetDir
        repo = clone.repo
        break
      }
      default:
        throw new Error(`Unsupported source: ${String(input.source)}`)
    }

    const existingNames = new Set((await this.services.tmux.listSessions()).map((session) => session.name))
    const slug = `${input.agent}-${sessionSlugFromPath(workspacePath)}`
    const sessionName = buildUniqueSessionName(slug, existingNames)
    const createdAt = new Date().toISOString()

    await this.services.tmux.createSession(sessionName, workspacePath)
    await this.services.tmux.setMetadata(sessionName, {
      agent: input.agent,
      workspace: workspacePath,
      repo,
      createdAt,
    })
    await this.services.tmux.sendCommand(sessionName, agentCommand(input.agent))

    return {
      reason: "attach",
      code: 0,
      sessionName,
    }
  }
}
