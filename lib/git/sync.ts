import { readFile } from "node:fs/promises";
import path from "node:path";
import type { GitCommit, SyncMetadata, TreeId } from "../data/schema";
import { validateGitCommitIndex, validateSyncMetadata } from "../data/validation.ts";
import { writeJsonAtomic } from "../data/generate.ts";
import { TRACKED_TREES, type TrackedTree } from "./config.ts";
import { GitRepository, type GitCommitData } from "./repository.ts";

export type GitSyncMode = "initial" | "unchanged" | "fast-forward" | "rewrite";

interface TreeGitState {
  lastHead?: string;
  lastSuccessfulSync?: string;
  lastMode?: GitSyncMode;
}

type GitSyncState = Partial<Record<TreeId, TreeGitState>>;

export interface RepositoryAdapter {
  fetch(shallowSince: string): Promise<string>;
  hasCommit(commit: string): Promise<boolean>;
  isAncestor(ancestor: string, descendant: string): Promise<boolean>;
  relevantCommitIds(revision: string, since?: string): Promise<string[]>;
  readCommits(commits: string[]): Promise<GitCommitData[]>;
}

export type RepositoryFactory = (cachePath: string, tree: TrackedTree) => RepositoryAdapter;

export interface GitSyncOptions {
  root: string;
  initialSince: string;
  forceRescan?: boolean;
  now?: Date;
  repositoryFactory?: RepositoryFactory;
}

export interface TreeSyncReport {
  tree: TreeId;
  mode: GitSyncMode;
  previousHead?: string;
  currentHead: string;
  scannedCommits: number;
  indexedCommits: number;
}

export interface GitSyncReport {
  synchronizedAt: string;
  trees: TreeSyncReport[];
}

async function readOptionalJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw new Error(`Unable to read ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function validSha(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{40}$/i.test(value);
}

function validateState(value: unknown): GitSyncState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Git state must be an object");
  const result: GitSyncState = {};
  for (const tree of TRACKED_TREES) {
    const raw = (value as Record<string, unknown>)[tree.id];
    if (raw === undefined) continue;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`Invalid Git state for ${tree.id}`);
    const entry = raw as Record<string, unknown>;
    if (entry.lastHead !== undefined && !validSha(entry.lastHead)) throw new Error(`Invalid last head for ${tree.id}`);
    if (entry.lastSuccessfulSync !== undefined && (typeof entry.lastSuccessfulSync !== "string" || Number.isNaN(Date.parse(entry.lastSuccessfulSync)))) {
      throw new Error(`Invalid last successful sync for ${tree.id}`);
    }
    const allowedModes: GitSyncMode[] = ["initial", "unchanged", "fast-forward", "rewrite"];
    if (entry.lastMode !== undefined && !allowedModes.includes(entry.lastMode as GitSyncMode)) throw new Error(`Invalid sync mode for ${tree.id}`);
    result[tree.id] = {
      ...(entry.lastHead ? { lastHead: entry.lastHead as string } : {}),
      ...(entry.lastSuccessfulSync ? { lastSuccessfulSync: entry.lastSuccessfulSync as string } : {}),
      ...(entry.lastMode ? { lastMode: entry.lastMode as GitSyncMode } : {}),
    };
  }
  return result;
}

function shallowStart(initialSince: string): string {
  const start = new Date(initialSince);
  if (Number.isNaN(start.getTime())) throw new Error(`GIT_SYNC_SINCE must be a valid date, received: ${initialSince}`);
  return new Date(start.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

function mergeIndex(
  existing: GitCommit[],
  scanned: GitCommitData[],
  mode: GitSyncMode,
  synchronizedAt: string,
): GitCommit[] {
  const commits = new Map(existing.map((commit) => [commit.commit, { ...commit }]));
  for (const commit of commits.values()) {
    if (mode === "initial" || mode === "rewrite") {
      commit.currentlyPresent = false;
    } else if (commit.currentlyPresent) {
      commit.lastSeenAt = synchronizedAt;
    }
  }
  for (const commit of scanned) {
    const previous = commits.get(commit.commit);
    commits.set(commit.commit, {
      ...commit,
      firstSeenAt: previous?.firstSeenAt ?? synchronizedAt,
      lastSeenAt: synchronizedAt,
      currentlyPresent: true,
    });
  }
  return [...commits.values()].sort((a, b) => Date.parse(b.committerDate) - Date.parse(a.committerDate));
}

async function determineRange(
  repository: RepositoryAdapter,
  previousHead: string | undefined,
  currentHead: string,
  initialSince: string,
  forceRescan = false,
): Promise<{ mode: GitSyncMode; revision: string; since?: string }> {
  if (forceRescan) return { mode: previousHead ? "rewrite" : "initial", revision: currentHead, since: initialSince };
  if (!previousHead) return { mode: "initial", revision: currentHead, since: initialSince };
  if (previousHead === currentHead) return { mode: "unchanged", revision: currentHead };
  if (await repository.hasCommit(previousHead) && await repository.isAncestor(previousHead, currentHead)) {
    return { mode: "fast-forward", revision: `${previousHead}..${currentHead}` };
  }
  return { mode: "rewrite", revision: currentHead, since: initialSince };
}

export async function synchronizeGit(options: GitSyncOptions): Promise<GitSyncReport> {
  const synchronizedAt = (options.now ?? new Date()).toISOString();
  const stateFile = path.join(options.root, "data", "internal", "git-state.json");
  const runStateFile = path.join(options.root, "data", "internal", "sync-state.json");
  const metadataFile = path.join(options.root, "data", "metadata.json");
  const state = validateState(await readOptionalJson<unknown>(stateFile, {}));
  const metadata = validateSyncMetadata(await readOptionalJson<unknown>(metadataFile, {
    mode: "live",
    generatedAt: synchronizedAt,
    sources: {},
  }));
  const repositoryFactory = options.repositoryFactory
    ?? ((cachePath: string, tree: TrackedTree) => new GitRepository(cachePath, tree));
  const nextState: GitSyncState = { ...state };
  const nextMetadata: SyncMetadata = {
    ...metadata,
    generatedAt: synchronizedAt,
    sources: { ...metadata.sources },
  };
  const pendingIndexes = new Map<TreeId, GitCommit[]>();
  const reports: TreeSyncReport[] = [];
  const fetchSince = shallowStart(options.initialSince);
  let activeTree: TreeId | undefined;

  try {
    for (const tree of TRACKED_TREES) {
      activeTree = tree.id;
      const indexFile = path.join(options.root, "data", "indexes", `${tree.id}.json`);
      const existing = validateGitCommitIndex(await readOptionalJson<unknown>(indexFile, []), tree.id);
      const repository = repositoryFactory(path.join(options.root, ".cache", "git", `${tree.id}.git`), tree);
      const currentHead = await repository.fetch(fetchSince);
      if (!validSha(currentHead)) throw new Error(`Invalid ${tree.id} head returned by Git: ${currentHead}`);
      const previousHead = state[tree.id]?.lastHead;
      const range = await determineRange(repository, previousHead, currentHead, options.initialSince, options.forceRescan);
      const ids = range.mode === "unchanged"
        ? []
        : await repository.relevantCommitIds(range.revision, range.since);
      const scanned = await repository.readCommits(ids);
      const merged = validateGitCommitIndex(mergeIndex(existing, scanned, range.mode, synchronizedAt), tree.id);

      pendingIndexes.set(tree.id, merged);
      nextState[tree.id] = { lastHead: currentHead, lastSuccessfulSync: synchronizedAt, lastMode: range.mode };
      nextMetadata.sources[tree.id] = { status: "ok", head: currentHead, lastSuccessfulSync: synchronizedAt };
      reports.push({
        tree: tree.id,
        mode: range.mode,
        ...(previousHead ? { previousHead } : {}),
        currentHead,
        scannedCommits: scanned.length,
        indexedCommits: merged.length,
      });
    }

    for (const tree of TRACKED_TREES) {
      await writeJsonAtomic(
        path.join(options.root, "data", "indexes", `${tree.id}.json`),
        pendingIndexes.get(tree.id) ?? [],
      );
    }
    await writeJsonAtomic(stateFile, nextState);
    await writeJsonAtomic(metadataFile, validateSyncMetadata(nextMetadata));
    return { synchronizedAt, trees: reports };
  } catch (error) {
    const previous = await readOptionalJson<Record<string, unknown>>(runStateFile, {});
    await writeJsonAtomic(runStateFile, {
      status: "error",
      attemptedAt: synchronizedAt,
      source: activeTree ? `git:${activeTree}` : "git",
      ...(typeof previous.lastSuccessfulSync === "string" ? { lastSuccessfulSync: previous.lastSuccessfulSync } : {}),
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
