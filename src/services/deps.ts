import type { AgentKind } from "../app/types"
import { agentBinary } from "./agent"
import type { Runner } from "./runner"

export interface DependencyCheckResult {
  name: string
  installed: boolean
}

const COMMON_BINARIES = ["tmux", "gh"] as const

export class DependencyError extends Error {
  missing: string[]

  constructor(missing: string[]) {
    super(`Missing required binaries: ${missing.join(", ")}`)
    this.name = "DependencyError"
    this.missing = missing
  }
}

export class DependencyService {
  constructor(private readonly runner: Runner) {}

  async checkBinary(name: string): Promise<boolean> {
    const result = await this.runner.run("bash", ["-lc", `command -v ${name}`])
    return result.exitCode === 0
  }

  async checkRequired(agent: AgentKind): Promise<DependencyCheckResult[]> {
    const binaries = [...COMMON_BINARIES, agentBinary(agent)]
    const checks: DependencyCheckResult[] = []

    for (const name of binaries) {
      checks.push({
        name,
        installed: await this.checkBinary(name),
      })
    }

    return checks
  }

  async assertRequired(agent: AgentKind): Promise<void> {
    const checks = await this.checkRequired(agent)
    const missing = checks.filter((check) => !check.installed).map((check) => check.name)
    if (missing.length > 0) {
      throw new DependencyError(missing)
    }
  }
}
