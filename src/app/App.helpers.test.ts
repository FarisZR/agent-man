import { describe, expect, it } from "bun:test"
import {
  HOME_ACTIONS,
  screenOnEscape,
  handleKeyboardInput,
  updateFormScreen,
  SOURCE_OPTIONS,
  buildCreateInput,
  clampIndex,
  formPrompt,
  isBackspace,
  isDown,
  isEnterKey,
  isPrintable,
  isUp,
  sourceLabel,
} from "./App"

describe("App helper functions", () => {
  it("detects key categories", () => {
    expect(isEnterKey("return")).toBe(true)
    expect(isEnterKey("enter")).toBe(true)
    expect(isEnterKey("space")).toBe(false)

    expect(isBackspace("backspace")).toBe(true)
    expect(isBackspace("delete")).toBe(true)
    expect(isBackspace("x")).toBe(false)

    expect(isUp("up")).toBe(true)
    expect(isUp("k")).toBe(true)
    expect(isUp("j")).toBe(false)

    expect(isDown("down")).toBe(true)
    expect(isDown("j")).toBe(true)
    expect(isDown("k")).toBe(false)
  })

  it("clamps selection indexes", () => {
    expect(clampIndex(3, 1, 4)).toBe(3)
    expect(clampIndex(2, -1, 4)).toBe(1)
    expect(clampIndex(0, -1, 4)).toBe(0)
    expect(clampIndex(0, 1, 0)).toBe(0)
  })

  it("maps source labels and prompts", () => {
    expect(sourceLabel("new_dir")).toContain("New directory")
    expect(sourceLabel("existing_dir")).toContain("existing")
    expect(sourceLabel("gh_clone")).toContain("gh repo clone")

    expect(formPrompt("new_dir")).toBe("Directory name")
    expect(formPrompt("existing_dir")).toBe("Existing directory path")
    expect(formPrompt("gh_clone")).toContain("OWNER/REPO")

    expect(SOURCE_OPTIONS).toEqual(["new_dir", "existing_dir", "gh_clone"])
    expect(HOME_ACTIONS).toHaveLength(4)
  })

  it("builds create-session payloads", () => {
    expect(buildCreateInput("opencode", "new_dir", "proj-a", "/root")).toEqual({
      agent: "opencode",
      source: "new_dir",
      workspaceRoot: "/root",
      newDirName: "proj-a",
    })

    expect(buildCreateInput("codex", "existing_dir", "/tmp/repo", "/root")).toEqual({
      agent: "codex",
      source: "existing_dir",
      workspaceRoot: "/root",
      existingDirPath: "/tmp/repo",
    })

    expect(buildCreateInput("codex", "gh_clone", "owner/repo", "/root")).toEqual({
      agent: "codex",
      source: "gh_clone",
      workspaceRoot: "/root",
      repoInput: "owner/repo",
    })
  })

  it("identifies printable inputs", () => {
    expect(isPrintable({ sequence: "a" })).toBe(true)
    expect(isPrintable({ sequence: " ", ctrl: false, meta: false })).toBe(true)
    expect(isPrintable({ sequence: "ab" })).toBe(false)
    expect(isPrintable({ sequence: "a", ctrl: true })).toBe(false)
    expect(isPrintable({ sequence: "a", meta: true })).toBe(false)
    expect(isPrintable({})).toBe(false)
  })

  it("updates form screen safely", () => {
    const home = { kind: "home", selected: 0 } as const
    expect(updateFormScreen(home, (screen) => ({ ...screen, input: "x" }))).toEqual(home)

    const form = { kind: "form", agent: "codex", source: "gh_clone", input: "a" } as const
    expect(updateFormScreen(form, (screen) => ({ ...screen, input: `${screen.input}b` }))).toEqual({
      kind: "form",
      agent: "codex",
      source: "gh_clone",
      input: "ab",
    })
  })

  it("computes escape transitions", () => {
    expect(screenOnEscape({ kind: "home", selected: 1 })).toEqual({ kind: "home", selected: 1 })
    expect(screenOnEscape({ kind: "resume", selected: 0, status: "x" })).toEqual({
      kind: "home",
      selected: 0,
      status: "x",
    })
    expect(screenOnEscape({ kind: "source", agent: "codex", selected: 2, status: "y" })).toEqual({
      kind: "home",
      selected: 0,
      status: "y",
    })
    expect(screenOnEscape({ kind: "form", agent: "opencode", source: "new_dir", input: "a", error: "b" })).toEqual({
      kind: "source",
      agent: "opencode",
      selected: 0,
      status: undefined,
    })
    expect(screenOnEscape({ kind: "busy", message: "m" })).toEqual({ kind: "busy", message: "m" })
  })

  it("handles escape key in keyboard reducer", () => {
    let currentState: import("./App").ScreenState = { kind: "source", agent: "codex", selected: 1, status: "x" }
    const exits: unknown[] = []

    handleKeyboardInput({
      key: { name: "escape", sequence: "\u001b" },
      screen: currentState,
      sessions: [],
      onExit: (exit) => exits.push(exit),
      setScreen: (next) => {
        currentState = typeof next === "function" ? next(currentState) : next
      },
      runResume: () => {},
      runCreate: () => {},
    })

    expect(exits).toEqual([])
    expect((currentState as { kind: string }).kind).toBe("home")
    expect((currentState as { selected?: number }).selected).toBe(0)
    expect((currentState as { status?: string }).status).toBe("x")
  })
})
