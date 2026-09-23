import { spawn } from "node:child_process";
import { parseMboxrd } from "./mbox.ts";
import type { LoreMessage, LoreSource } from "./types";

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type CommandRunner = (executable: string, args: string[]) => Promise<CommandResult>;

export const runCommand: CommandRunner = (executable, args) => new Promise((resolve, reject) => {
  const child = spawn(executable, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr.on("data", (chunk: string) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (exitCode) => resolve({ stdout, stderr, exitCode: exitCode ?? 1 }));
});

export class LeiLoreSource implements LoreSource {
  private readonly external: string;
  private readonly runner: CommandRunner;
  private readonly executable: string;

  constructor(
    external = "https://lore.kernel.org/linux-doc/",
    runner: CommandRunner = runCommand,
    executable = "lei",
  ) {
    this.external = external;
    this.runner = runner;
    this.executable = executable;
  }

  async search(query: string): Promise<LoreMessage[]> {
    const args = [
      "q",
      "--no-save",
      "--dedupe=mid",
      "--format=mboxrd",
      "-t",
      "-I",
      this.external,
      query,
    ];
    let result: CommandResult;
    try {
      result = await this.runner(this.executable, args);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to start lei. Install lei/public-inbox before real synchronization. ${detail}`);
    }
    if (result.exitCode !== 0) throw new Error(`lei query failed (${result.exitCode}): ${result.stderr.trim() || "no error output"}`);
    return parseMboxrd(result.stdout, this.external);
  }
}
