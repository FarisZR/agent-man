import { describe, expect, it } from "bun:test"
import { SystemRunner, assertCommandSucceeded } from "./runner"
import os from "node:os"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"

describe("runner", () => {
  it("executes commands and captures output", async () => {
    const runner = new SystemRunner()
    const result = await runner.run("bash", ["-lc", "echo stdout-text; echo stderr-text >&2"]) 

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("stdout-text")
    expect(result.stderr).toContain("stderr-text")
  })

  it("supports cwd option", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "agent-man-runner-"))
    const runner = new SystemRunner()
    const result = await runner.run("bash", ["-lc", "pwd"], { cwd: tempDir })

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe(tempDir)

    await rm(tempDir, { recursive: true, force: true })
  })

  it("throws when command is not found", async () => {
    const runner = new SystemRunner()
    await expect(runner.run("this-command-does-not-exist-xyz")).rejects.toBeInstanceOf(Error)
  })

  it("throws when assertCommandSucceeded receives a failure", () => {
    expect(() =>
      assertCommandSucceeded(
        {
          stdout: "",
          stderr: "boom",
          exitCode: 1,
        },
        "cmd",
      ),
    ).toThrow("boom")
  })

  it("falls back to command label when stderr/stdout are empty", () => {
    expect(() =>
      assertCommandSucceeded(
        {
          stdout: "",
          stderr: "",
          exitCode: 2,
        },
        "fallback cmd",
      ),
    ).toThrow("fallback cmd failed with exit code 2")
  })

  it("does not throw on success", () => {
    expect(() =>
      assertCommandSucceeded(
        {
          stdout: "ok",
          stderr: "",
          exitCode: 0,
        },
        "cmd",
      ),
    ).not.toThrow()
  })
})
