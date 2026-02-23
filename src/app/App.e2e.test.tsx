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
  typeText: (text: string) => Promise<void>
  settle: () => Promise<void>
}

const activeRenderers: TestRenderer[] = []

async function renderApp(options: {
  sessions?: SessionMeta[]
  createResult?: AppExit
  createError?: string
  resumeResult?: AppExit
  resumeError?: string
}): Promise<RenderResult> {
  setActEnvironment(true)

  const sessions = options.sessions ?? []
  const exits: AppExit[] = []
  const createInputs: CreateSessionInput[] = []

  const controller: AppController = {
    async loadSessions() {
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
      if (options.createError) {
        throw new Error(options.createError)
      }
      return options.createResult ?? { reason: "attach", code: 0, sessionName: "agent-man-new" }
    },
  }

  let root: Root | null = null

  const setup = await createTestRenderer({
    width: 90,
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

  await flush(3)

  return {
    renderer: setup.renderer,
    mockInput: setup.mockInput,
    exits,
    createInputs,
    captureCharFrame: setup.captureCharFrame,
    pressEnter: async () => runInput(() => setup.mockInput.pressEnter()),
    pressDown: async () => runInput(() => setup.mockInput.pressArrow("down")),
    typeText: async (text: string) => runInput(() => setup.mockInput.typeText(text)),
    settle: async () => flush(4),
  }
}

afterEach(() => {
  while (activeRenderers.length > 0) {
    const renderer = activeRenderers.pop()
    act(() => {
      renderer?.destroy()
    })
  }
  setActEnvironment(false)
})

describe("App e2e flows", () => {
  it("resumes an existing session", async () => {
    const app = await renderApp({
      sessions: [{ name: "agent-man-a", attached: false, activityEpoch: 100, agent: "opencode" }],
    })

    await app.pressEnter()
    await app.pressEnter()

    expect(app.exits).toEqual([{ reason: "attach", code: 0, sessionName: "agent-man-a" }])
  })

  it("creates an OpenCode session from new_dir", async () => {
    const app = await renderApp({ sessions: [] })

    await app.pressDown()
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

  it("exits to direct shell", async () => {
    const app = await renderApp({ sessions: [] })

    await app.pressDown()
    await app.pressDown()
    await app.pressDown()
    await app.pressEnter()

    expect(app.exits[0]).toEqual({ reason: "direct_shell", code: 40 })
  })

  it("shows failure message when dependencies are missing", async () => {
    const app = await renderApp({ createError: "Missing required binaries: codex" })

    await app.pressDown()
    await app.pressDown()
    await app.pressEnter()

    await app.pressEnter()
    await app.typeText("proj-x")
    await app.pressEnter()
    await app.settle()

    expect(app.exits).toEqual([])
    expect(app.captureCharFrame()).toContain("Missing required binaries: codex")
  })

  it("shows failure message when clone fails", async () => {
    const app = await renderApp({ createError: "clone failed" })

    await app.pressDown()
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
