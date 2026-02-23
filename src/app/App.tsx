import { readdir } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { useEffect, useMemo, useRef, useState } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
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

export const MAX_HOME_SESSION_OPTIONS = 3

export type HomeOption =
  | { kind: "resume_session"; sessionName: string; label: string }
  | { kind: "resume_menu"; label: string }
  | { kind: "new_session"; agent: AgentKind; label: string }
  | { kind: "direct_shell"; label: string }

export const SOURCE_OPTIONS: SourceKind[] = ["new_dir", "existing_dir", "gh_clone"]

export interface KeyboardEventLike {
  name?: string
  sequence?: string
  ctrl?: boolean
  meta?: boolean
}

export interface DirectoryEntryLike {
  name: string
  isDirectory: () => boolean
}

interface ExistingDirSuggestionOptions {
  homeDir?: string
  cwd?: string
  limit?: number
  readDir?: (path: string) => Promise<DirectoryEntryLike[]>
}

interface HandleKeyboardInputParams {
  key: KeyboardEventLike
  screen: ScreenState
  sessions: SessionMeta[]
  homeOptions: HomeOption[]
  onExit: (exit: AppExit) => void
  setScreen: (next: ScreenState | ((current: ScreenState) => ScreenState)) => void
  runResume: (sessionName: string) => void
  runCreate: (agent: AgentKind, source: SourceKind, input: string) => void
}

export function isEnterKey(name: string | undefined, sequence?: string): boolean {
  return name === "return" || name === "enter" || sequence === "\r" || sequence === "\n"
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

export function expandHomePath(value: string, home: string = homedir()): string {
  if (value === "~") {
    return home
  }

  if (value.startsWith("~/")) {
    return join(home, value.slice(2))
  }

  return value
}

function collapseHomePath(value: string, home: string): string {
  if (value.startsWith(`${home}/`)) {
    return `~/${value.slice(home.length + 1)}`
  }

  return value
}

function parseExistingDirInput(input: string, home: string, cwd: string): { lookupDir: string; prefix: string; useTilde: boolean } {
  const trimmed = input.trim()
  const useTilde = trimmed.startsWith("~")

  if (!trimmed) {
    return { lookupDir: home, prefix: "", useTilde: true }
  }

  const expanded = expandHomePath(trimmed, home)
  const absolute = resolve(cwd, expanded)

  if (trimmed.endsWith("/")) {
    return { lookupDir: absolute, prefix: "", useTilde }
  }

  return {
    lookupDir: dirname(absolute),
    prefix: absolute.slice(dirname(absolute).length + 1),
    useTilde,
  }
}

export function fuzzyDirectoryMatchScore(name: string, query: string): number | null {
  const queryLower = query.trim().toLowerCase()
  if (!queryLower) {
    return 0
  }

  const nameLower = name.toLowerCase()
  if (nameLower.startsWith(queryLower)) {
    return 1000 - nameLower.length
  }

  let queryIndex = 0
  let firstMatch = -1
  let lastMatch = -1
  let gapPenalty = 0

  for (let index = 0; index < nameLower.length && queryIndex < queryLower.length; index += 1) {
    if (nameLower[index] !== queryLower[queryIndex]) {
      continue
    }

    if (firstMatch === -1) {
      firstMatch = index
    }

    if (lastMatch >= 0) {
      gapPenalty += index - lastMatch - 1
    }

    lastMatch = index
    queryIndex += 1
  }

  if (queryIndex < queryLower.length) {
    return null
  }

  return 500 - firstMatch * 2 - gapPenalty - (nameLower.length - queryLower.length)
}

export async function listExistingDirSuggestions(
  input: string,
  options: ExistingDirSuggestionOptions = {},
): Promise<string[]> {
  const home = options.homeDir ?? homedir()
  const cwd = options.cwd ?? process.cwd()
  const limit = options.limit ?? 8
  const readDir = options.readDir ?? (async (path: string) => await readdir(path, { withFileTypes: true }))
  const { lookupDir, prefix, useTilde } = parseExistingDirInput(input, home, cwd)

  try {
    const entries = await readDir(lookupDir)
    const names = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .map((name) => ({ name, score: fuzzyDirectoryMatchScore(name, prefix) }))
      .filter((entry) => entry.score !== null)
      .sort((a, b) => {
        if (a.score !== b.score) {
          return (b.score ?? 0) - (a.score ?? 0)
        }

        return a.name.localeCompare(b.name)
      })
      .map((entry) => entry.name)
      .slice(0, limit)

    return names.map((name) => {
      const full = join(lookupDir, name)
      if (useTilde) {
        return collapseHomePath(full, home)
      }
      return full
    })
  } catch {
    return []
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

export function buildHomeOptions(sessions: SessionMeta[], maxSessionOptions: number = MAX_HOME_SESSION_OPTIONS): HomeOption[] {
  const sessionOptions = sessions.slice(0, maxSessionOptions).map((session) => {
    const agent = session.agent ?? "unknown"
    return {
      kind: "resume_session" as const,
      sessionName: session.name,
      label: `Resume: ${session.name} (${agent})`,
    }
  })

  const options: HomeOption[] = [
    { kind: "new_session", agent: "opencode", label: "New OpenCode Session" },
    { kind: "new_session", agent: "codex", label: "New Codex Session" },
    { kind: "direct_shell", label: "Direct Shell (no tmux)" },
    ...sessionOptions,
  ]

  if (sessions.length > maxSessionOptions) {
    options.push({
      kind: "resume_menu",
      label: `More sessions (${sessions.length - maxSessionOptions})`,
    })
  }

  return options
}

export function handleKeyboardInput({
  key,
  screen,
  sessions,
  homeOptions,
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
      setScreen((current) => {
        if (current.kind !== "home") return current
        return { ...current, selected: clampIndex(current.selected, -1, homeOptions.length) }
      })
      return
    }

    if (isDown(key.name)) {
      setScreen((current) => {
        if (current.kind !== "home") return current
        return { ...current, selected: clampIndex(current.selected, 1, homeOptions.length) }
      })
      return
    }

    if (!isEnterKey(key.name, key.sequence)) {
      return
    }

    const selectedOption = homeOptions[screen.selected]
    if (!selectedOption) {
      return
    }

    switch (selectedOption.kind) {
      case "resume_session":
        runResume(selectedOption.sessionName)
        return
      case "resume_menu":
        setScreen({ kind: "resume", selected: 0, status: undefined })
        return
      case "new_session":
        setScreen({ kind: "source", agent: selectedOption.agent, selected: 0, status: undefined })
        return
      case "direct_shell":
        onExit({ reason: "direct_shell", code: 40 })
        return
    }
  }

  if (screen.kind === "resume") {
    if (isUp(key.name)) {
      setScreen((current) => {
        if (current.kind !== "resume") return current
        return { ...current, selected: clampIndex(current.selected, -1, sessions.length) }
      })
      return
    }

    if (isDown(key.name)) {
      setScreen((current) => {
        if (current.kind !== "resume") return current
        return { ...current, selected: clampIndex(current.selected, 1, sessions.length) }
      })
      return
    }

    const selectedSession = sessions[screen.selected]
    if (isEnterKey(key.name, key.sequence) && selectedSession) {
      runResume(selectedSession.name)
    }
    return
  }

  if (screen.kind === "source") {
    if (isUp(key.name)) {
      setScreen((current) => {
        if (current.kind !== "source") return current
        return { ...current, selected: clampIndex(current.selected, -1, SOURCE_OPTIONS.length) }
      })
      return
    }

    if (isDown(key.name)) {
      setScreen((current) => {
        if (current.kind !== "source") return current
        return { ...current, selected: clampIndex(current.selected, 1, SOURCE_OPTIONS.length) }
      })
      return
    }

    if (isEnterKey(key.name, key.sequence)) {
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

    if (isEnterKey(key.name, key.sequence)) {
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

// ── Theme ──────────────────────────────────────────────────────────────────

const theme = {
  gold: "#D4A017",
  goldDim: "#B8860B",
  text: "#CCCCCC",
  textBright: "#FFFFFF",
  muted: "#888888",
  mutedDim: "#666666",
  border: "#555555",
  red: "#CC3333",
  green: "#2E8B57",
  selectedFg: "#D4A017",
} as const

function useSpinner(): string {
  return ""
}

// ── Render helpers ─────────────────────────────────────────────────────────

function MenuOption({
  label,
  selected,
}: {
  label: string
  selected: boolean
}) {
  if (selected) {
    return (
      <box flexDirection="row" width="100%">
        <text fg={theme.gold}>
          <b>{"  ▸ "}{label}</b>
        </text>
      </box>
    )
  }
  return (
    <box flexDirection="row" width="100%">
      <text fg={theme.text}>{"    "}{label}</text>
    </box>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <text fg={theme.muted}>
      <b>{"  "}{title}</b>
    </text>
  )
}

function KeyHint({ keyName, description }: { keyName: string; description: string }) {
  return (
    <text>
      <span fg={theme.gold}>
        <b>{keyName}</b>
      </span>
      <span fg={theme.mutedDim}>{" " + description}</span>
    </text>
  )
}

// ── App ────────────────────────────────────────────────────────────────────

export function App({ controller, workspaceRoot, onExit }: AppProps) {
  const renderer = useRenderer()
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [screen, setScreen] = useState<ScreenState>({ kind: "home", selected: 0, status: "Loading sessions..." })
  const [existingDirSuggestions, setExistingDirSuggestions] = useState<string[]>([])
  const [existingDirSuggestionIndex, setExistingDirSuggestionIndex] = useState(0)
  const screenRef = useRef(screen)
  const sessionsRef = useRef(sessions)
  const existingDirSuggestionsRef = useRef(existingDirSuggestions)
  const existingDirSuggestionIndexRef = useRef(existingDirSuggestionIndex)
  screenRef.current = screen
  sessionsRef.current = sessions
  existingDirSuggestionsRef.current = existingDirSuggestions
  existingDirSuggestionIndexRef.current = existingDirSuggestionIndex

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

  const homeOptions = useMemo(() => buildHomeOptions(sessions), [sessions])

  const homeLines = useMemo(() => {
    const options = buildHomeOptions(sessions)
    return options.map((option, index) => {
      if (screen.kind === "home" && index === screen.selected) {
        return `> ${option.label}`
      }
      return `  ${option.label}`
    })
  }, [screen, sessions])

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

  const spinner = useSpinner()

  async function runResume(sessionName: string) {
    setScreen({ kind: "busy", message: `Preparing resume for ${sessionName}...` })
    try {
      const exit = await controller.resumeSession(sessionName)
      onExit(exit)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setScreen({ kind: "home", selected: 0, status: message })
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

  useEffect(() => {
    const onPaste = (event: { text?: string }) => {
      const pastedText = event.text ?? ""
      if (!pastedText) {
        return
      }

      setScreen((current) => {
        return updateFormScreen(current, (form) => ({ ...form, input: `${form.input}${pastedText}`, error: undefined }))
      })
    }

    renderer.keyInput.on("paste", onPaste)
    return () => {
      renderer.keyInput.off("paste", onPaste)
    }
  }, [renderer])

  useEffect(() => {
    if (screen.kind !== "form" || screen.source !== "existing_dir") {
      setExistingDirSuggestions((current) => (current.length > 0 ? [] : current))
      setExistingDirSuggestionIndex((current) => (current === 0 ? current : 0))
      return
    }

    void listExistingDirSuggestions(screen.input).then((next) => {
      setExistingDirSuggestions(next)
      setExistingDirSuggestionIndex(0)
    })
  }, [screen.kind, screen.kind === "form" ? screen.source : undefined, screen.kind === "form" ? screen.input : undefined])

  useKeyboard((key) => {
    const currentScreen = screenRef.current
    const currentSessions = sessionsRef.current
    const currentExistingDirSuggestions = existingDirSuggestionsRef.current
    const currentExistingDirSuggestionIndex = existingDirSuggestionIndexRef.current
    const selectedExistingDirSuggestion = currentExistingDirSuggestions[currentExistingDirSuggestionIndex]

    if (currentScreen.kind === "form" && currentScreen.source === "existing_dir") {
      if (isDown(key.name) && currentExistingDirSuggestions.length > 0) {
        setExistingDirSuggestionIndex((current) => clampIndex(current, 1, currentExistingDirSuggestions.length))
        return
      }

      if (isUp(key.name) && currentExistingDirSuggestions.length > 0) {
        setExistingDirSuggestionIndex((current) => clampIndex(current, -1, currentExistingDirSuggestions.length))
        return
      }

      if (
        (key.name === "tab" || isEnterKey(key.name, key.sequence))
        && selectedExistingDirSuggestion
        && currentScreen.input !== selectedExistingDirSuggestion
      ) {
        setScreen((current) => {
          return updateFormScreen(current, (form) => ({ ...form, input: selectedExistingDirSuggestion, error: undefined }))
        })
        return
      }
    }

    const homeOptions = buildHomeOptions(currentSessions)
    handleKeyboardInput({
      key,
      screen: currentScreen,
      sessions: currentSessions,
      homeOptions,
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
      {/* ── Logo ─────────────────────────────────────────────── */}
      <ascii-font text="AGENT-MAN" font="block" color={[theme.gold, theme.goldDim]} />
      <text fg={theme.muted}>
        {"  "}Persistent coding-agent sessions with tmux
      </text>
      <text> </text>

      {/* ── Home screen ──────────────────────────────────────── */}
      {screen.kind === "home" && (
        <box flexDirection="column" gap={0}>
          <box
            flexDirection="column"
            border={true}
            borderStyle="heavy"
            borderColor={theme.border}
            paddingX={1}
            paddingY={0}
          >
            <SectionHeader title="Sessions and actions" />
            <text> </text>
            {homeOptions.map((option, index) => {
              const selected = index === screen.selected
              return (
                <MenuOption
                  key={option.label}
                  label={option.label}
                  selected={selected}
                />
              )
            })}
            <text> </text>
          </box>

          <text> </text>
          <text fg={theme.muted}>
            {"  "}Known sessions:{" "}
            <span fg={theme.gold}>
              <b>{String(sessions.length)}</b>
            </span>
          </text>
          {screen.status && (
            <text fg={screen.status.startsWith("Failed") ? theme.red : theme.gold}>
              {"  "}{screen.status}
            </text>
          )}
        </box>
      )}

      {/* ── Resume screen ────────────────────────────────────── */}
      {screen.kind === "resume" && (
        <box
          flexDirection="column"
          border={true}
          borderStyle="heavy"
          borderColor={theme.border}
          paddingX={1}
          paddingY={0}
        >
          <SectionHeader title="Resume session" />
          <text> </text>
          {resumeLines.length > 0 ? (
            sessions.map((session, index) => {
              const selected = screen.selected === index
              const attachState = session.attached ? "attached" : "idle"
              const agent = session.agent ?? "unknown"
              const label = `${session.name} (${agent}, ${attachState})`
              return (
                <MenuOption
                  key={session.name}
                  label={label}
                  selected={selected}
                />
              )
            })
          ) : (
            <text fg={theme.muted}>{"    No sessions found."}</text>
          )}
          <text> </text>
          {screen.status && (
            <text fg={theme.gold}>{"  "}{screen.status}</text>
          )}
        </box>
      )}

      {/* ── Source selection screen ───────────────────────────── */}
      {screen.kind === "source" && (
        <box
          flexDirection="column"
          border={true}
          borderStyle="heavy"
          borderColor={theme.border}
          paddingX={1}
          paddingY={0}
        >
          <SectionHeader
            title={`New ${screen.agent} session`}
          />
          <text> </text>
          {SOURCE_OPTIONS.map((source, index) => {
            const selected = screen.selected === index
            return (
              <MenuOption
                key={source}
                label={sourceLabel(source)}
                selected={selected}
              />
            )
          })}
          <text> </text>
          {screen.status && (
            <text fg={theme.gold}>{"  "}{screen.status}</text>
          )}
        </box>
      )}

      {/* ── Form screen ──────────────────────────────────────── */}
      {screen.kind === "form" && (
        <box
          flexDirection="column"
          border={true}
          borderStyle="heavy"
          borderColor={screen.error ? theme.red : theme.border}
          paddingX={1}
          paddingY={0}
        >
          <SectionHeader
            title={`New ${screen.agent} session`}
          />
          <text> </text>
          <text fg={theme.text}>
            {"  "}{formPrompt(screen.source)}:
          </text>
          <box flexDirection="row" marginLeft={2}>
            <text fg={theme.gold}>{"  ▸ "}</text>
            <text fg={theme.textBright}>
              <b>{screen.input || ""}</b>
            </text>
            <text fg={theme.gold}>{"_"}</text>
          </box>
          <text> </text>
          <text fg={theme.mutedDim}>
            {"  "}Workspace root:{" "}
            <span fg={theme.muted}>{workspaceRoot}</span>
          </text>
          {screen.source === "existing_dir" && existingDirSuggestions.length > 0 && (
            <box flexDirection="column" marginTop={1}>
              <text fg={theme.muted}>{"  Matches:"}</text>
              {existingDirSuggestions.map((suggestion, index) => (
                <text key={suggestion} fg={index === existingDirSuggestionIndex ? theme.gold : theme.text}>
                  {index === existingDirSuggestionIndex ? "  ▸ " : "    "}
                  {suggestion}
                </text>
              ))}
              <text fg={theme.mutedDim}>{"  tab/enter to autocomplete"}</text>
            </box>
          )}
          {screen.error && (
            <text fg={theme.red}>
              {"  "}{screen.error}
            </text>
          )}
          <text> </text>
        </box>
      )}

      {/* ── Busy screen ──────────────────────────────────────── */}
      {screen.kind === "busy" && (
        <box
          flexDirection="column"
          border={true}
          borderStyle="heavy"
          borderColor={theme.gold}
          paddingX={1}
          paddingY={0}
        >
          <text> </text>
          <box flexDirection="row" marginLeft={2}>
            <text fg={theme.gold}>
              <b>{spinner} </b>
            </text>
            <text fg={theme.text}>{screen.message}</text>
          </box>
          <text> </text>
        </box>
      )}

      {/* ── Footer ───────────────────────────────────────────── */}
      <text> </text>
      <box flexDirection="row" gap={2} marginLeft={1}>
        <KeyHint keyName={"↑↓"} description="navigate" />
        <KeyHint keyName={"⏎"} description="select" />
        <KeyHint keyName="esc" description="back" />
        <KeyHint keyName="q" description="quit" />
        <KeyHint keyName="^C" description="hard exit" />
      </box>
    </box>
  )
}
