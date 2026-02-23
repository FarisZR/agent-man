export type AgentKind = "opencode" | "codex"
export type SourceKind = "new_dir" | "existing_dir" | "gh_clone"

export interface SessionMeta {
  name: string
  attached: boolean
  activityEpoch: number
  agent?: AgentKind
  workspace?: string
  repo?: string
  createdAt?: string
}

export interface CreateSessionInput {
  agent: AgentKind
  source: SourceKind
  workspaceRoot: string
  newDirName?: string
  existingDirPath?: string
  repoInput?: string
}

export type AppExitReason = "quit" | "attach" | "direct_shell" | "fatal_error"

export interface AppExit {
  reason: AppExitReason
  code: number
  sessionName?: string
  error?: string
}

export interface AppController {
  loadSessions: () => Promise<SessionMeta[]>
  resumeSession: (sessionName: string) => Promise<AppExit>
  createSession: (input: CreateSessionInput) => Promise<AppExit>
}
