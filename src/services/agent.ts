import type { AgentKind } from "../app/types"

export function agentCommand(agent: AgentKind): string[] {
  if (agent === "opencode") {
    return ["opencode"]
  }

  return ["codex", "--dangerously-bypass-approvals-and-sandbox", "--search"]
}

export function agentBinary(agent: AgentKind): string {
  return agent === "opencode" ? "opencode" : "codex"
}

export function agentLabel(agent: AgentKind): string {
  return agent === "opencode" ? "OpenCode" : "Codex"
}
