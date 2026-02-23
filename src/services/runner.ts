export interface CommandResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface RunOptions {
  cwd?: string
}

export interface Runner {
  run: (cmd: string, args?: string[], options?: RunOptions) => Promise<CommandResult>
}

export class SystemRunner implements Runner {
  constructor() {}

  async run(cmd: string, args: string[] = [], options: RunOptions = {}): Promise<CommandResult> {
    const proc = Bun.spawn([cmd, ...args], {
      cwd: options.cwd,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    })

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])

    return {
      stdout,
      stderr,
      exitCode,
    }
  }
}

export function assertCommandSucceeded(result: CommandResult, commandLabel: string): void {
  if (result.exitCode === 0) {
    return
  }

  const message = result.stderr.trim() || result.stdout.trim() || `${commandLabel} failed with exit code ${result.exitCode}`
  throw new Error(message)
}
