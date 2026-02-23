import { describe, expect, it } from "bun:test"
import {
  MAX_HOME_SESSION_OPTIONS,
  buildHomeOptions,
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
  listExistingDirSuggestions,
  sourceLabel,
  expandHomePath,
  fuzzyDirectoryMatchScore,
} from "./App"

describe("App helper functions", () => {
  it("detects key categories", () => {
    expect(isEnterKey("return")).toBe(true)
    expect(isEnterKey("enter")).toBe(true)
    expect(isEnterKey(undefined, "\r")).toBe(true)
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
    expect(MAX_HOME_SESSION_OPTIONS).toBe(3)
  })

  it("builds home options with fixed actions first and sessions below", () => {
    const options = buildHomeOptions([
      { name: "s1", attached: false, activityEpoch: 3, agent: "codex" },
      { name: "s2", attached: false, activityEpoch: 2, agent: "opencode" },
      { name: "s3", attached: false, activityEpoch: 1, agent: "codex" },
      { name: "s4", attached: false, activityEpoch: 0, agent: "opencode" },
    ])

    expect(options[0]).toEqual({ kind: "new_session", agent: "opencode", label: "New OpenCode Session" })
    expect(options[1]).toEqual({ kind: "new_session", agent: "codex", label: "New Codex Session" })
    expect(options[2]).toEqual({ kind: "direct_shell", label: "Direct Shell (no tmux)" })
    expect(options[3]).toEqual({ kind: "resume_session", sessionName: "s1", label: "Resume: s1 (codex)" })
    expect(options[4]).toEqual({ kind: "resume_session", sessionName: "s2", label: "Resume: s2 (opencode)" })
    expect(options[5]).toEqual({ kind: "resume_session", sessionName: "s3", label: "Resume: s3 (codex)" })
    expect(options[6]).toEqual({ kind: "resume_menu", label: "More sessions (1)" })
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

  it("expands tilde home paths", () => {
    expect(expandHomePath("~", "/home/tester")).toBe("/home/tester")
    expect(expandHomePath("~/open", "/home/tester")).toBe("/home/tester/open")
    expect(expandHomePath("/tmp", "/home/tester")).toBe("/tmp")
  })

  it("lists existing-dir suggestions from home index", async () => {
    const suggestions = await listExistingDirSuggestions("~/open", {
      homeDir: "/home/tester",
      cwd: "/work",
      readDir: async () => [
        { name: "opencode-xyz", isDirectory: () => true },
        { name: "openclaw", isDirectory: () => true },
        { name: "other", isDirectory: () => true },
        { name: "open-file.txt", isDirectory: () => false },
      ],
    })

    expect(suggestions).toEqual(["~/openclaw", "~/opencode-xyz"])
  })

  it("handles existing-dir suggestion edge cases", async () => {
    const slashInput = await listExistingDirSuggestions("~/projects/", {
      homeDir: "/home/tester",
      cwd: "/work",
      readDir: async () => [
        { name: "open-proj", isDirectory: () => true },
      ],
    })
    expect(slashInput).toEqual(["~/projects/open-proj"])

    const absoluteInput = await listExistingDirSuggestions("/tmp/op", {
      homeDir: "/home/tester",
      cwd: "/work",
      readDir: async () => [
        { name: "open-a", isDirectory: () => true },
      ],
    })
    expect(absoluteInput).toEqual(["/tmp/open-a"])

    const outsideHome = await listExistingDirSuggestions("~../../tmp/op", {
      homeDir: "/home/tester",
      cwd: "/work",
      readDir: async () => [
        { name: "open-b", isDirectory: () => true },
      ],
    })
    expect(outsideHome).toEqual(["/work/tmp/open-b"])

    const errored = await listExistingDirSuggestions("~/open", {
      homeDir: "/home/tester",
      cwd: "/work",
      readDir: async () => {
        throw new Error("boom")
      },
    })
    expect(errored).toEqual([])
  })

  it("scores fuzzy directory matches", () => {
    expect(fuzzyDirectoryMatchScore("openclaw", "open")).toBeGreaterThan(0)
    expect(fuzzyDirectoryMatchScore("openclaw", "ocw")).toBeGreaterThan(0)
    expect(fuzzyDirectoryMatchScore("openclaw", "zzz")).toBeNull()
    expect(fuzzyDirectoryMatchScore("openclaw", "")).toBe(0)
  })

  it("applies fuzzy matching for existing-dir suggestions", async () => {
    const suggestions = await listExistingDirSuggestions("~/ocw", {
      homeDir: "/home/tester",
      cwd: "/work",
      readDir: async () => [
        { name: "openclaw", isDirectory: () => true },
        { name: "opencode-xyz", isDirectory: () => true },
      ],
    })

    expect(suggestions).toEqual(["~/openclaw"])
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
      homeOptions: buildHomeOptions([]),
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

  it("handles home up, empty home options, and source up paths", () => {
    let currentState: import("./App").ScreenState = { kind: "home", selected: 1 }
    const exits: unknown[] = []

    const setScreen = (next: import("./App").ScreenState | ((current: import("./App").ScreenState) => import("./App").ScreenState)) => {
      currentState = typeof next === "function" ? next(currentState) : next
    }

    handleKeyboardInput({
      key: { name: "up" },
      screen: currentState,
      sessions: [],
      homeOptions: buildHomeOptions([]),
      onExit: (exit) => exits.push(exit),
      setScreen,
      runResume: () => {},
      runCreate: () => {},
    })
    expect((currentState as { selected?: number }).selected).toBe(0)

    handleKeyboardInput({
      key: { name: "return" },
      screen: currentState,
      sessions: [],
      homeOptions: [],
      onExit: (exit) => exits.push(exit),
      setScreen,
      runResume: () => {},
      runCreate: () => {},
    })
    expect((currentState as { kind: string }).kind).toBe("home")

    currentState = { kind: "source", agent: "codex", selected: 1 }
    handleKeyboardInput({
      key: { name: "up" },
      screen: currentState,
      sessions: [],
      homeOptions: buildHomeOptions([]),
      onExit: (exit) => exits.push(exit),
      setScreen,
      runResume: () => {},
      runCreate: () => {},
    })
    expect((currentState as { selected?: number }).selected).toBe(0)
    expect(exits).toEqual([])
  })
})
