import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App } from "./app/App"
import { AgentManController } from "./app/controller"
import type { AppExit } from "./app/types"
import { DependencyService } from "./services/deps"
import { SystemRunner } from "./services/runner"
import { TmuxService } from "./services/tmux"
import { WorkspaceService } from "./services/workspace"

const WORKSPACE_ROOT = "~/"
let activeCleanup: (() => void) | null = null

function asErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function runAttach(sessionName: string): Promise<number> {
  const proc = Bun.spawn(["tmux", "attach-session", "-t", sessionName], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })

  const exitCode = await proc.exited
  return exitCode
}

function setActiveCleanup(cleanup: () => void) {
  activeCleanup = cleanup
}

function fatalExit(error: unknown) {
  const message = asErrorMessage(error)
  console.error(message)
  activeCleanup?.()
  process.exit(1)
}

process.on("uncaughtException", fatalExit)
process.on("unhandledRejection", fatalExit)

async function runApp(controller: AgentManController): Promise<AppExit> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
  })
  const root = createRoot(renderer)

  let destroyed = false
  const safeDestroy = () => {
    if (destroyed) {
      return
    }
    destroyed = true

    try {
      root.unmount()
    } catch {
      // Ignore unmount errors during shutdown.
    }

    renderer.destroy()
  }

  setActiveCleanup(safeDestroy)

  let resolveExit: (exit: AppExit) => void = () => {}
  const exitPromise = new Promise<AppExit>((resolve) => {
    resolveExit = resolve
  })

  root.render(<App controller={controller} workspaceRoot={WORKSPACE_ROOT} onExit={resolveExit} />)

  const exit = await exitPromise
  safeDestroy()
  if (activeCleanup === safeDestroy) {
    activeCleanup = null
  }

  return exit
}

const runner = new SystemRunner()
const controller = new AgentManController({
  deps: new DependencyService(runner),
  tmux: new TmuxService(runner),
  workspace: new WorkspaceService(runner),
})

while (true) {
  const exit = await runApp(controller)

  if (exit.reason === "attach" && exit.sessionName) {
    await runAttach(exit.sessionName)
    continue
  }

  if (exit.reason === "fatal_error") {
    console.error(exit.error ?? "fatal error")
    process.exit(1)
  }

  process.exit(exit.code)
}
