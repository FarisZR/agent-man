import { afterEach, describe, expect, it } from "bun:test"
import { createTestRenderer, type MockInput, type TestRenderer } from "@opentui/core/testing"
import { createRoot, type Root } from "@opentui/react"
import { act } from "react"
import { App } from "./App"
import type { AppController, AppExit, CreateSessionInput, SessionMeta } from "./types"

function setActEnvironment(enabled: boolean) {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = enabled
}

interface RenderResult {
  renderer: TestRenderer
  mockInput: MockInput
  exits: AppExit[]
  createInputs: CreateSessionInput[]
  captureCharFrame: () => string
  pressEnter: () => Promise<void>
  pressDown: () => Promise<void>
  pressUp: () => Promise<void>
  pressQ: () => Promise<void>
  pressCtrlC: () => Promise<void>
  pressBackspace: () => Promise<void>
  pressKey: (key: string) => Promise<void>
  typeText: (text: string) => Promise<void>
  pasteText: (text: string) => Promise<void>
  settle: () => Promise<void>
}

const activeRenderers: TestRenderer[] = []

async function renderApp(options: {
  sessions?: SessionMeta[]
  createResult?: AppExit
  createError?: string
  resumeResult?: AppExit
  resumeError?: string
  loadError?: string
  createPending?: boolean
}): Promise<RenderResult> {
  setActEnvironment(true)

  const sessions = options.sessions ?? []
  const exits: AppExit[] = []
  const createInputs: CreateSessionInput[] = []

  const controller: AppController = {
    async loadSessions() {
      if (options.loadError) {
        throw new Error(options.loadError)
      }
      return sessions
    },
    async resumeSession(sessionName: string) {
      if (options.resumeError) {
        throw new Error(options.resumeError)
      }
      return options.resumeResult ?? { reason: "attach", code: 0, sessionName }
    },
    async createSession(input: CreateSessionInput) {
      createInputs.push(input)
      if (options.createPending) {
        return await new Promise<AppExit>(() => {})
      }
      if (options.createError) {
        throw new Error(options.createError)
      }
      return options.createResult ?? { reason: "attach", code: 0, sessionName: "agent-man-new" }
    },
  }

  let root: Root | null = null

  const setup = await createTestRenderer({
    width: 100,
    height: 30,
    onDestroy() {
      if (root) {
        act(() => {
          root?.unmount()
          root = null
        })
      }
      setActEnvironment(false)
    },
  })

  activeRenderers.push(setup.renderer)

  root = createRoot(setup.renderer)
  act(() => {
    root?.render(<App controller={controller} workspaceRoot="/tmp/agent-sessions" onExit={(exit) => exits.push(exit)} />)
  })

  const flush = async (cycles: number = 2) => {
    await act(async () => {
      for (let i = 0; i < cycles; i += 1) {
        await setup.renderOnce()
        await Promise.resolve()
      }
    })
  }

  const runInput = async (fn: () => void | Promise<void>) => {
    await act(async () => {
      await fn()
      await setup.renderOnce()
      await Promise.resolve()
      await setup.renderOnce()
      await Promise.resolve()
    })
  }

  await flush(6)

  return {
    renderer: setup.renderer,
    mockInput: setup.mockInput,
    exits,
    createInputs,
    captureCharFrame: setup.captureCharFrame,
    pressEnter: async () => runInput(() => setup.mockInput.pressEnter()),
    pressDown: async () => runInput(() => setup.mockInput.pressArrow("down")),
    pressUp: async () => runInput(() => setup.mockInput.pressArrow("up")),
    pressQ: async () => runInput(() => setup.mockInput.pressKey("q")),
    pressCtrlC: async () => runInput(() => setup.mockInput.pressCtrlC()),
    pressBackspace: async () => runInput(() => setup.mockInput.pressBackspace()),
    pressKey: async (key: string) => runInput(() => setup.mockInput.pressKey(key)),
    typeText: async (text: string) => runInput(() => setup.mockInput.typeText(text)),
    pasteText: async (text: string) =>
      runInput(() => {
        const emitter = setup.renderer.keyInput as unknown as { emit: (name: string, payload: unknown) => void }
        emitter.emit("paste", { text })
      }),
    settle: async () => flush(4),
  }
}

afterEach(() => {
  setActEnvironment(true)
  while (activeRenderers.length > 0) {
    const renderer = activeRenderers.pop()
    act(() => {
      renderer?.destroy()
    })
  }
  setActEnvironment(false)
})

describe("App e2e flows", () => {
  it("resumes first existing session from home menu below fixed options", async () => {
    const app = await renderApp({
      sessions: [{ name: "agent-man-a", attached: false, activityEpoch: 100, agent: "opencode" }],
    })

    await app.pressDown()
    await app.pressDown()
    await app.pressDown()
    await app.pressEnter()
    expect(app.exits[0]).toEqual({ reason: "attach", code: 0, sessionName: "agent-man-a" })
  })

  it("shows home error when loading sessions fails", async () => {
    const app = await renderApp({ loadError: "load failed" })
    expect(app.captureCharFrame()).toContain("Failed to load sessions: load failed")
  })

  it("exits on q and ctrl+c shortcuts", async () => {
    const appQ = await renderApp({ sessions: [] })
    await appQ.pressQ()
    expect(appQ.exits[0]).toEqual({ reason: "quit", code: 0 })

    const appCtrlC = await renderApp({ sessions: [] })
    await appCtrlC.pressCtrlC()
    expect(appCtrlC.exits[0]).toEqual({ reason: "quit", code: 130 })
  })

  it("shows fixed options first and recent sessions below", async () => {
    const app = await renderApp({
      sessions: [
        { name: "s1", attached: false, activityEpoch: 4, agent: "opencode" },
        { name: "s2", attached: false, activityEpoch: 3, agent: "codex" },
        { name: "s3", attached: false, activityEpoch: 2, agent: "opencode" },
        { name: "s4", attached: false, activityEpoch: 1, agent: "codex" },
      ],
    })

    const frame = app.captureCharFrame()
    expect(frame).toContain("New OpenCode Session")
    expect(frame).toContain("New Codex Session")
    expect(frame).toContain("Direct Shell (no tmux)")
    expect(frame).toContain("Resume: s1")
    expect(frame).toContain("Resume: s2")
    expect(frame).toContain("Resume: s3")
    expect(frame).toContain("More sessions (1)")
  })

  it("opens resume menu from more-sessions option", async () => {
    const app = await renderApp({
      sessions: [
        { name: "s1", attached: false, activityEpoch: 4, agent: "opencode" },
        { name: "s2", attached: false, activityEpoch: 3, agent: "codex" },
        { name: "s3", attached: false, activityEpoch: 2, agent: "opencode" },
        { name: "s4", attached: false, activityEpoch: 1, agent: "codex" },
      ],
    })

    await app.pressDown()
    await app.pressDown()
    await app.pressDown()
    await app.pressDown()
    await app.pressDown()
    await app.pressDown()
    await app.pressDown()
    await app.pressDown()
    await app.pressEnter()
    expect(app.captureCharFrame()).toContain("Resume session")
  })

  it("supports up-down navigation in resume menu and attaches selected session", async () => {
    const app = await renderApp({
      sessions: [
        { name: "s1", attached: false, activityEpoch: 4, agent: "opencode" },
        { name: "s2", attached: false, activityEpoch: 3, agent: "codex" },
        { name: "s3", attached: false, activityEpoch: 2, agent: "opencode" },
        { name: "s4", attached: false, activityEpoch: 1, agent: "codex" },
      ],
    })

    await app.pressDown()
    await app.pressDown()
    await app.pressDown()
    await app.pressDown()
    await app.pressDown()
    await app.pressDown()
    await app.pressEnter()
    await app.pressDown()
    await app.pressUp()
    await app.pressDown()
    await app.pressEnter()

    expect(app.exits[0]).toEqual({ reason: "attach", code: 0, sessionName: "s2" })
  })

  it("opens new opencode wizard directly when no sessions exist", async () => {
    const app = await renderApp({ sessions: [] })
    await app.pressEnter()
    await app.settle()
    expect(app.captureCharFrame()).toContain("New opencode session")
  })

  it("supports source up-navigation from codex selection", async () => {
    const app = await renderApp({ sessions: [] })

    await app.pressDown()
    await app.pressEnter()
    await app.settle()
    expect(app.captureCharFrame()).toContain("New codex session")

    await app.pressUp()
    await app.pressEnter()
    expect(app.captureCharFrame()).toContain("Directory name:")
  })

  it("creates an OpenCode session from new_dir", async () => {
    const app = await renderApp({ sessions: [] })

    await app.pressEnter()
    await app.pressEnter()
    await app.typeText("proj-a")
    await app.pressEnter()

    expect(app.createInputs).toEqual([
      {
        agent: "opencode",
        source: "new_dir",
        workspaceRoot: "/tmp/agent-sessions",
        newDirName: "proj-a",
      },
    ])
    expect(app.exits[0]).toEqual({ reason: "attach", code: 0, sessionName: "agent-man-new" })
  })

  it("creates a Codex session from gh_clone", async () => {
    const app = await renderApp({ sessions: [] })

    await app.pressDown()
    await app.pressEnter()

    await app.pressDown()
    await app.pressDown()
    await app.pressEnter()

    await app.typeText("owner/repo")
    await app.pressEnter()

    expect(app.createInputs).toEqual([
      {
        agent: "codex",
        source: "gh_clone",
        workspaceRoot: "/tmp/agent-sessions",
        repoInput: "owner/repo",
      },
    ])
    expect(app.exits[0]).toEqual({ reason: "attach", code: 0, sessionName: "agent-man-new" })
  })

  it("accepts paste events in form inputs", async () => {
    const app = await renderApp({ sessions: [] })

    await app.pressDown()
    await app.pressEnter()
    await app.pressDown()
    await app.pressDown()
    await app.pressEnter()

    await app.pasteText("owner/repo")
    await app.pressEnter()

    expect(app.createInputs[0]?.repoInput).toBe("owner/repo")
  })

  it("ignores empty paste events", async () => {
    const app = await renderApp({ sessions: [] })

    await app.pressEnter()
    await app.pressEnter()
    await app.pasteText("")
    expect(app.captureCharFrame()).toContain("_")
  })

  it("exits to direct shell", async () => {
    const app = await renderApp({ sessions: [] })

    await app.pressDown()
    await app.pressDown()
    await app.pressEnter()

    expect(app.exits[0]).toEqual({ reason: "direct_shell", code: 40 })
  })

  it("shows failure message when dependencies are missing", async () => {
    const app = await renderApp({ createError: "Missing required binaries: codex" })

    await app.pressDown()
    await app.pressEnter()
    await app.pressEnter()
    await app.typeText("proj-x")
    await app.pressEnter()
    await app.settle()

    expect(app.exits).toEqual([])
    expect(app.captureCharFrame()).toContain("Missing required binaries: codex")
  })

  it("shows resume errors from controller failures", async () => {
    const app = await renderApp({
      sessions: [{ name: "agent-man-a", attached: false, activityEpoch: 100, agent: "opencode" }],
      resumeError: "resume failed",
    })

    await app.pressDown()
    await app.pressDown()
    await app.pressDown()
    await app.pressEnter()
    await app.settle()

    expect(app.exits).toEqual([])
    expect(app.captureCharFrame()).toContain("resume failed")
  })

  it("requires non-empty form input and supports backspace editing", async () => {
    const app = await renderApp({ sessions: [] })

    await app.pressEnter()
    await app.pressEnter()
    await app.pressEnter()
    await app.settle()
    expect(app.captureCharFrame()).toContain("Input is required.")

    await app.typeText("abc")
    await app.pressBackspace()
    await app.pressEnter()
    expect(app.createInputs[0]?.newDirName).toBe("ab")
  })

  it("ignores non-enter keys on home and blocks input while busy", async () => {
    const app = await renderApp({ sessions: [] })
    await app.pressKey("x")
    expect(app.captureCharFrame()).toContain("Sessions and actions")

    const busyApp = await renderApp({ sessions: [], createPending: true })
    await busyApp.pressEnter()
    await busyApp.pressEnter()
    await busyApp.typeText("proj-busy")
    await busyApp.pressEnter()
    await busyApp.settle()
    expect(busyApp.captureCharFrame()).toContain("Creating session...")

    await busyApp.pressDown()
    await busyApp.settle()
    expect(busyApp.captureCharFrame()).toContain("Creating session...")
  })

  it("shows failure message when clone fails", async () => {
    const app = await renderApp({ createError: "clone failed" })

    await app.pressDown()
    await app.pressEnter()
    await app.pressDown()
    await app.pressDown()
    await app.pressEnter()
    await app.typeText("owner/repo")
    await app.pressEnter()
    await app.settle()

    expect(app.exits).toEqual([])
    expect(app.captureCharFrame()).toContain("clone failed")
  })
})
