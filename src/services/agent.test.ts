import { describe, expect, it } from "bun:test"
import { agentBinary, agentCommand, agentLabel } from "./agent"

describe("agent service", () => {
  it("builds the OpenCode command", () => {
    expect(agentCommand("opencode")).toEqual(["opencode"])
    expect(agentBinary("opencode")).toBe("opencode")
    expect(agentLabel("opencode")).toBe("OpenCode")
  })

  it("builds the Codex command with required flags", () => {
    expect(agentCommand("codex")).toEqual(["codex", "--dangerously-bypass-approvals-and-sandbox", "--search"])
    expect(agentBinary("codex")).toBe("codex")
    expect(agentLabel("codex")).toBe("Codex")
  })
})
