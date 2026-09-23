import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import type { GitCommit } from "../data/schema";
import type { TrackedTree } from "./config.ts";
import { RELEVANT_PATHS } from "./config.ts";
import { checkedGit, runCommand, type CommandResult, type CommandRunner } from "./runner.ts";

export type GitCommitData = Omit<GitCommit, "firstSeenAt" | "lastSeenAt" | "currentlyPresent">;

async function pathExists(value: string): Promise<boolean> {
  try {
    await stat(value);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function lines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export class GitRepository {
  private readonly cachePath: string;
  private readonly tree: TrackedTree;
  private readonly runner: CommandRunner;

  constructor(cachePath: string, tree: TrackedTree, runner: CommandRunner = runCommand) {
    this.cachePath = cachePath;
    this.tree = tree;
    this.runner = runner;
  }

  private async raw(args: string[], input?: string): Promise<CommandResult> {
    return this.runner("git", ["-C", this.cachePath, ...args], input === undefined ? undefined : { input });
  }

  private async git(args: string[], input?: string): Promise<CommandResult> {
    return checkedGit(
      this.runner,
      ["-C", this.cachePath, ...args],
      input === undefined ? undefined : { input },
    );
  }

  async fetch(shallowSince: string): Promise<string> {
    const exists = await pathExists(this.cachePath);
    if (!exists) {
      await mkdir(path.dirname(this.cachePath), { recursive: true });
      await checkedGit(this.runner, [
        "clone",
        "--bare",
        "--single-branch",
        "--branch", this.tree.branch,
        "--filter=blob:none",
        `--shallow-since=${shallowSince}`,
        this.tree.repository,
        this.cachePath,
      ]);
    } else {
      const bare = await this.git(["rev-parse", "--is-bare-repository"]);
      if (bare.stdout.trim() !== "true") throw new Error(`${this.cachePath} is not a bare Git repository`);
    }
    const remote = await this.raw(["remote", "get-url", "origin"]);
    if (remote.exitCode === 0) await this.git(["remote", "set-url", "origin", this.tree.repository]);
    else await this.git(["remote", "add", "origin", this.tree.repository]);

    const targetRef = `refs/remotes/origin/${this.tree.branch}`;
    const hasTarget = (await this.raw(["show-ref", "--verify", "--quiet", targetRef])).exitCode === 0;
    const fetchArgs = ["fetch", "--no-tags", "--prune", "--filter=blob:none"];
    if (!hasTarget) fetchArgs.push(`--shallow-since=${shallowSince}`);
    fetchArgs.push("origin", `+refs/heads/${this.tree.branch}:${targetRef}`);
    await this.git(fetchArgs);
    return (await this.git(["rev-parse", "--verify", targetRef])).stdout.trim();
  }

  async hasCommit(commit: string): Promise<boolean> {
    return (await this.raw(["cat-file", "-e", `${commit}^{commit}`])).exitCode === 0;
  }

  async isAncestor(ancestor: string, descendant: string): Promise<boolean> {
    const result = await this.raw(["merge-base", "--is-ancestor", ancestor, descendant]);
    if (result.exitCode === 0) return true;
    if (result.exitCode === 1) return false;
    throw new Error(`Unable to compare ${ancestor} and ${descendant}: ${result.stderr.trim()}`);
  }

  async relevantCommitIds(revision: string, since?: string): Promise<string[]> {
    const args = ["rev-list", "--reverse"];
    if (since) args.push(`--since=${since}`);
    args.push(revision, "--", ...RELEVANT_PATHS);
    return lines((await this.git(args)).stdout);
  }

  private async stablePatchIds(commits: string[]): Promise<Map<string, string>> {
    if (!commits.length) return new Map();
    const mail = await this.git(["show", "--format=email", "--binary", "--no-ext-diff", ...commits]);
    const result = await this.git(["patch-id", "--stable"], mail.stdout);
    return new Map(lines(result.stdout).map((line) => {
      const [patchId, commit] = line.split(/\s+/, 2);
      return [commit, patchId];
    }));
  }

  async readCommits(commits: string[]): Promise<GitCommitData[]> {
    const patchIds = await this.stablePatchIds(commits);
    const result: GitCommitData[] = [];
    for (const commit of commits) {
      const metadata = await this.git(["show", "-s", "--format=%H%x00%s%x00%an%x00%ae%x00%aI%x00%cI", commit]);
      const [sha, subject, authorName, authorEmail, authorDate, committerDate] = metadata.stdout.replace(/\r?\n$/, "").split("\0");
      if (!sha || !subject || !authorName || !authorEmail || !authorDate || !committerDate) {
        throw new Error(`Unable to parse commit metadata for ${commit}`);
      }
      const changedFiles = lines((await this.git([
        "diff-tree", "--root", "--no-commit-id", "--name-only", "-r", commit,
      ])).stdout);
      const patchId = patchIds.get(sha);
      result.push({
        tree: this.tree.id,
        branch: this.tree.branch,
        commit: sha,
        subject,
        authorName,
        authorEmail,
        authorDate,
        committerDate,
        ...(patchId ? { patchId } : {}),
        changedFiles,
      });
    }
    return result;
  }
}
