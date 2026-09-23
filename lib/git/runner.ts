import { spawn } from "node:child_process";

export interface CommandOptions {
  cwd?: string;
  input?: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export type CommandRunner = (
  executable: string,
  args: string[],
  options?: CommandOptions,
) => Promise<CommandResult>;

export const runCommand: CommandRunner = (executable, args, options = {}) => new Promise((resolve, reject) => {
  const child = spawn(executable, args, {
    cwd: options.cwd,
    shell: false,
    stdio: [options.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout!.setEncoding("utf8");
  child.stderr!.setEncoding("utf8");
  child.stdout!.on("data", (chunk: string) => { stdout += chunk; });
  child.stderr!.on("data", (chunk: string) => { stderr += chunk; });
  child.on("error", reject);
  child.on("close", (exitCode) => resolve({ stdout, stderr, exitCode: exitCode ?? 1 }));
  if (options.input !== undefined) child.stdin!.end(options.input);
});

export class GitCommandError extends Error {
  readonly args: string[];
  readonly exitCode: number;

  constructor(args: string[], result: CommandResult) {
    super(`git ${args.join(" ")} failed (${result.exitCode}): ${result.stderr.trim() || "no error output"}`);
    this.name = "GitCommandError";
    this.args = args;
    this.exitCode = result.exitCode;
  }
}

export async function checkedGit(
  runner: CommandRunner,
  args: string[],
  options?: CommandOptions,
): Promise<CommandResult> {
  const result = await runner("git", args, options);
  if (result.exitCode !== 0) throw new GitCommandError(args, result);
  return result;
}
