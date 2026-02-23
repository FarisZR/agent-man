import path from "node:path"
import os from "node:os"
import { mkdir, stat } from "node:fs/promises"
import type { Runner } from "./runner"
import { assertCommandSucceeded } from "./runner"

const OWNER_REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

export interface CloneResult {
  repo: string
  targetDir: string
}

export function expandHome(inputPath: string): string {
  if (inputPath === "~") {
    return os.homedir()
  }

  if (inputPath.startsWith("~/")) {
    return path.join(os.homedir(), inputPath.slice(2))
  }

  return inputPath
}

export function normalizeRepoInput(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) {
    throw new Error("Repository input is required.")
  }

  if (OWNER_REPO_RE.test(trimmed)) {
    return trimmed
  }

  const httpsMatch = trimmed.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/)
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`
  }

  const sshMatch = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/)
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`
  }

  throw new Error("Invalid repository format. Use OWNER/REPO or a GitHub URL.")
}

export function repoDirName(repo: string): string {
  return repo.replace("/", "-")
}

export function sessionSlugFromPath(workspacePath: string): string {
  const base = path.basename(workspacePath)
  const normalized = base.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "")
  return normalized || "workspace"
}

export class WorkspaceService {
  constructor(private readonly runner: Runner) {}

  resolveWorkspaceRoot(root: string): string {
    return path.resolve(expandHome(root))
  }

  async ensureDirectory(dirPath: string): Promise<void> {
    await mkdir(dirPath, { recursive: true })
  }

  async resolveExistingDirectory(inputPath: string): Promise<string> {
    const resolved = path.resolve(expandHome(inputPath))
    const st = await stat(resolved)
    if (!st.isDirectory()) {
      throw new Error(`Path is not a directory: ${resolved}`)
    }

    return resolved
  }

  async prepareNewDirectory(workspaceRoot: string, dirName: string): Promise<string> {
    const clean = dirName.trim()
    if (!clean) {
      throw new Error("Directory name is required.")
    }

    const root = this.resolveWorkspaceRoot(workspaceRoot)
    await this.ensureDirectory(root)

    const target = path.resolve(root, clean)
    await this.ensureDirectory(target)
    return target
  }

  deriveCloneDirectory(workspaceRoot: string, repo: string): string {
    const root = this.resolveWorkspaceRoot(workspaceRoot)
    return path.resolve(root, repoDirName(repo))
  }

  async cloneRepo(repoInput: string, workspaceRoot: string): Promise<CloneResult> {
    const repo = normalizeRepoInput(repoInput)
    const root = this.resolveWorkspaceRoot(workspaceRoot)
    await this.ensureDirectory(root)

    const targetDir = this.deriveCloneDirectory(root, repo)
    const result = await this.runner.run("gh", ["repo", "clone", repo, targetDir])
    assertCommandSucceeded(result, "gh repo clone")

    return {
      repo,
      targetDir,
    }
  }
}
