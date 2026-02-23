import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { App, demoController } from "./app/App"
import type { AppExit } from "./app/types"

const WORKSPACE_ROOT = "~/agent-sessions"

let destroyed = false

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

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
})

const root = createRoot(renderer)

function safeDestroy() {
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

function fatalExit(error: unknown) {
  const message = asErrorMessage(error)
  console.error(message)
  safeDestroy()
  process.exit(1)
}

process.on("uncaughtException", fatalExit)
process.on("unhandledRejection", fatalExit)

let resolveExit: (exit: AppExit) => void = () => {}
const exitPromise = new Promise<AppExit>((resolve) => {
  resolveExit = resolve
})

const controller = await demoController()
root.render(<App controller={controller} workspaceRoot={WORKSPACE_ROOT} onExit={resolveExit} />)

const exit = await exitPromise

safeDestroy()

if (exit.reason === "attach" && exit.sessionName) {
  const attachCode = await runAttach(exit.sessionName)
  process.exit(attachCode)
}

if (exit.reason === "fatal_error") {
  console.error(exit.error ?? "fatal error")
}

process.exit(exit.code)
