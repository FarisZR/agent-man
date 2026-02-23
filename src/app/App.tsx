import { useEffect, useMemo, useState } from "react"
import { useKeyboard } from "@opentui/react"
import type { AppController, AppExit, AgentKind, CreateSessionInput, SessionMeta, SourceKind } from "./types"

interface AppProps {
  controller: AppController
  workspaceRoot: string
  onExit: (exit: AppExit) => void
}

export type ScreenState =
  | { kind: "home"; selected: number; status?: string }
  | { kind: "resume"; selected: number; status?: string }
  | { kind: "source"; agent: AgentKind; selected: number; status?: string }
  | { kind: "form"; agent: AgentKind; source: SourceKind; input: string; error?: string }
  | { kind: "busy"; message: string }

export type FormScreenState = Extract<ScreenState, { kind: "form" }>

export const HOME_ACTIONS = [
  "Resume Session",
  "New OpenCode Session",
  "New Codex Session",
  "Direct Shell (no tmux)",
] as const

export const SOURCE_OPTIONS: SourceKind[] = ["new_dir", "existing_dir", "gh_clone"]

export interface KeyboardEventLike {
  name?: string
  sequence?: string
  ctrl?: boolean
  meta?: boolean
}

interface HandleKeyboardInputParams {
  key: KeyboardEventLike
  screen: ScreenState
  sessions: SessionMeta[]
  onExit: (exit: AppExit) => void
  setScreen: (next: ScreenState | ((current: ScreenState) => ScreenState)) => void
  runResume: (sessionName: string) => void
  runCreate: (agent: AgentKind, source: SourceKind, input: string) => void
}

export function isEnterKey(name: string | undefined): boolean {
  return name === "return" || name === "enter"
}

export function isBackspace(name: string | undefined): boolean {
  return name === "backspace" || name === "delete"
}

export function isUp(name: string | undefined): boolean {
  return name === "up" || name === "k"
}

export function isDown(name: string | undefined): boolean {
  return name === "down" || name === "j"
}

export function clampIndex(current: number, delta: number, max: number): number {
  if (max <= 0) {
    return 0
  }

  return Math.max(0, Math.min(max - 1, current + delta))
}

export function sourceLabel(source: SourceKind): string {
  switch (source) {
    case "new_dir":
      return "New directory under workspace root"
    case "existing_dir":
      return "Use an existing directory"
    case "gh_clone":
      return "Clone repository with gh repo clone"
  }
}

export function formPrompt(source: SourceKind): string {
  switch (source) {
    case "new_dir":
      return "Directory name"
    case "existing_dir":
      return "Existing directory path"
    case "gh_clone":
      return "Repository (OWNER/REPO or URL)"
  }
}

export function buildCreateInput(
  agent: AgentKind,
  source: SourceKind,
  input: string,
  workspaceRoot: string,
): CreateSessionInput {
  switch (source) {
    case "new_dir":
      return {
        agent,
        source,
        workspaceRoot,
        newDirName: input,
      }
    case "existing_dir":
      return {
        agent,
        source,
        workspaceRoot,
        existingDirPath: input,
      }
    case "gh_clone":
      return {
        agent,
        source,
        workspaceRoot,
        repoInput: input,
      }
  }
}

export function isPrintable(event: KeyboardEventLike): boolean {
  if (event.ctrl || event.meta) {
    return false
  }

  return Boolean(event.sequence && event.sequence.length === 1 && event.sequence >= " ")
}

export function updateFormScreen(
  current: ScreenState,
  updater: (screen: FormScreenState) => FormScreenState,
): ScreenState {
  if (current.kind !== "form") {
    return current
  }
  return updater(current)
}

export function screenOnEscape(screen: ScreenState): ScreenState {
  switch (screen.kind) {
    case "home":
      return screen
    case "resume":
      return { kind: "home", selected: 0, status: screen.status }
    case "source":
      return { kind: "home", selected: 0, status: screen.status }
    case "form":
      return { kind: "source", agent: screen.agent, selected: 0, status: undefined }
    case "busy":
      return screen
  }
}

export function handleKeyboardInput({
  key,
  screen,
  sessions,
  onExit,
  setScreen,
  runResume,
  runCreate,
}: HandleKeyboardInputParams): void {
  if (key.ctrl && key.name === "c") {
    onExit({ reason: "quit", code: 130 })
    return
  }

  if (key.name === "q") {
    onExit({ reason: "quit", code: 0 })
    return
  }

  if (screen.kind === "busy") {
    return
  }

  if (key.name === "escape" || key.sequence === "\x1b") {
    setScreen(screenOnEscape(screen))
    return
  }

  if (screen.kind === "home") {
    if (isUp(key.name)) {
      setScreen({ ...screen, selected: clampIndex(screen.selected, -1, HOME_ACTIONS.length) })
      return
    }

    if (isDown(key.name)) {
      setScreen({ ...screen, selected: clampIndex(screen.selected, 1, HOME_ACTIONS.length) })
      return
    }

    if (!isEnterKey(key.name)) {
      return
    }

    switch (screen.selected) {
      case 0:
        if (sessions.length === 0) {
          setScreen({ ...screen, status: "No agent-man sessions found." })
          return
        }

        setScreen({ kind: "resume", selected: 0, status: undefined })
        return
      case 1:
        setScreen({ kind: "source", agent: "opencode", selected: 0, status: undefined })
        return
      case 2:
        setScreen({ kind: "source", agent: "codex", selected: 0, status: undefined })
        return
      case 3:
        onExit({ reason: "direct_shell", code: 40 })
        return
    }
  }

  if (screen.kind === "resume") {
    if (isUp(key.name)) {
      setScreen({ ...screen, selected: clampIndex(screen.selected, -1, sessions.length) })
      return
    }

    if (isDown(key.name)) {
      setScreen({ ...screen, selected: clampIndex(screen.selected, 1, sessions.length) })
      return
    }

    const selectedSession = sessions[screen.selected]
    if (isEnterKey(key.name) && selectedSession) {
      runResume(selectedSession.name)
    }
    return
  }

  if (screen.kind === "source") {
    if (isUp(key.name)) {
      setScreen({ ...screen, selected: clampIndex(screen.selected, -1, SOURCE_OPTIONS.length) })
      return
    }

    if (isDown(key.name)) {
      setScreen({ ...screen, selected: clampIndex(screen.selected, 1, SOURCE_OPTIONS.length) })
      return
    }

    if (isEnterKey(key.name)) {
      setScreen({
        kind: "form",
        agent: screen.agent,
        source: SOURCE_OPTIONS[screen.selected] ?? "new_dir",
        input: "",
        error: undefined,
      })
    }
    return
  }

  if (screen.kind === "form") {
    if (isBackspace(key.name)) {
      setScreen((current) => {
        return updateFormScreen(current, (form) => ({ ...form, input: form.input.slice(0, -1), error: undefined }))
      })
      return
    }

    if (isEnterKey(key.name)) {
      runCreate(screen.agent, screen.source, screen.input)
      return
    }

    if (isPrintable(key)) {
      setScreen((current) => {
        return updateFormScreen(current, (form) => ({ ...form, input: `${form.input}${key.sequence}`, error: undefined }))
      })
    }
  }
}

export function App({ controller, workspaceRoot, onExit }: AppProps) {
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [screen, setScreen] = useState<ScreenState>({ kind: "home", selected: 0, status: "Loading sessions..." })

  async function loadSessions(status?: string) {
    try {
      const nextSessions = await controller.loadSessions()
      setSessions(nextSessions)
      setScreen({ kind: "home", selected: 0, status })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setScreen({ kind: "home", selected: 0, status: `Failed to load sessions: ${message}` })
    }
  }

  useEffect(() => {
    void loadSessions()
  }, [])

  const homeLines = useMemo(() => {
    return HOME_ACTIONS.map((action, index) => {
      if (screen.kind === "home" && index === screen.selected) {
        return `> ${action}`
      }
      return `  ${action}`
    })
  }, [screen])

  const resumeLines = useMemo(() => {
    return sessions.map((session, index) => {
      const marker = screen.kind === "resume" && screen.selected === index ? ">" : " "
      const attachState = session.attached ? "attached" : "idle"
      const agent = session.agent ?? "unknown"
      return `${marker} ${session.name} (${agent}, ${attachState})`
    })
  }, [screen, sessions])

  const sourceLines = useMemo(() => {
    return SOURCE_OPTIONS.map((source, index) => {
      const marker = screen.kind === "source" && screen.selected === index ? ">" : " "
      return `${marker} ${sourceLabel(source)}`
    })
  }, [screen])

  async function runResume(sessionName: string) {
    setScreen({ kind: "busy", message: `Preparing resume for ${sessionName}...` })
    try {
      const exit = await controller.resumeSession(sessionName)
      onExit(exit)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setScreen({ kind: "resume", selected: 0, status: message })
    }
  }

  async function runCreate(agent: AgentKind, source: SourceKind, rawInput: string) {
    const value = rawInput.trim()
    if (!value) {
      setScreen({ kind: "form", agent, source, input: rawInput, error: "Input is required." })
      return
    }

    setScreen({ kind: "busy", message: "Creating session..." })

    try {
      const createInput = buildCreateInput(agent, source, value, workspaceRoot)
      const exit = await controller.createSession(createInput)
      onExit(exit)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setScreen({ kind: "form", agent, source, input: rawInput, error: message })
    }
  }

  useKeyboard((key) => {
    handleKeyboardInput({
      key,
      screen,
      sessions,
      onExit,
      setScreen,
      runResume: (sessionName) => {
        void runResume(sessionName)
      },
      runCreate: (agent, source, input) => {
        void runCreate(agent, source, input)
      },
    })
  })

  return (
    <box flexDirection="column" padding={1}>
      <text>agent-man</text>
      <text>Persistent coding-agent sessions with tmux</text>
      <text> </text>

      {screen.kind === "home" && (
        <box flexDirection="column">
          <text>Main actions</text>
          {homeLines.map((line) => (
            <text key={line}>{line}</text>
          ))}
          <text> </text>
          <text>Known sessions: {sessions.length}</text>
          {screen.status && <text>{screen.status}</text>}
        </box>
      )}

      {screen.kind === "resume" && (
        <box flexDirection="column">
          <text>Resume session</text>
          {resumeLines.length > 0 ? resumeLines.map((line) => <text key={line}>{line}</text>) : <text>No sessions found.</text>}
          {screen.status && <text>{screen.status}</text>}
        </box>
      )}

      {screen.kind === "source" && (
        <box flexDirection="column">
          <text>New {screen.agent} session</text>
          {sourceLines.map((line) => (
            <text key={line}>{line}</text>
          ))}
          {screen.status && <text>{screen.status}</text>}
        </box>
      )}

      {screen.kind === "form" && (
        <box flexDirection="column">
          <text>New {screen.agent} session</text>
          <text>{formPrompt(screen.source)}:</text>
          <text>{screen.input || "_"}</text>
          <text>Workspace root: {workspaceRoot}</text>
          {screen.error && <text>{screen.error}</text>}
        </box>
      )}

      {screen.kind === "busy" && (
        <box>
          <text>{screen.message}</text>
        </box>
      )}

      <text> </text>
      <text>Keys: up/down (or j/k), enter select, esc back, q quit, ctrl+c hard exit</text>
    </box>
  )
}
