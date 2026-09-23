import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { GitCommit } from "../lib/data/schema.ts";
import { TRACKED_TREES } from "../lib/git/config.ts";
import { synchronizeGit, type RepositoryFactory } from "../lib/git/sync.ts";

const HEADS = {
  initial: { alex: "a".repeat(40), corbet: "b".repeat(40), linus: "c".repeat(40) },
  rewrite: { alex: "d".repeat(40), corbet: "e".repeat(40), linus: "f".repeat(40) },
  forward: { alex: "1".repeat(40), corbet: "2".repeat(40), linus: "3".repeat(40) },
} as const;

function factoryFor(
  generation: keyof typeof HEADS,
  ancestor: boolean,
  revisions: string[] = [],
): RepositoryFactory {
  return (_cachePath, tree) => {
    const head = HEADS[generation][tree.id];
    return {
      fetch: async () => head,
      hasCommit: async () => true,
      isAncestor: async () => ancestor,
      relevantCommitIds: async (revision) => {
        revisions.push(`${tree.id}:${revision}`);
        return [head];
      },
      readCommits: async (ids) => ids.map((commit) => ({
        tree: tree.id,
        branch: tree.branch,
        commit,
        subject: `${tree.name} translation update`,
        authorName: "Test Author",
        authorEmail: "author@example.com",
        authorDate: "2026-09-05T10:00:00.000Z",
        committerDate: "2026-09-05T10:01:00.000Z",
        patchId: commit,
        changedFiles: ["Documentation/translations/zh_CN/test.rst"],
      })),
    };
  };
}

async function json(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

test("persists indexes and safely handles rewrites and later fast-forwards", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "buding-git-sync-"));
  context.after(() => rm(root, { recursive: true, force: true }));

  const initial = await synchronizeGit({
    root,
    initialSince: "2025-01-01",
    now: new Date("2026-09-05T11:00:00Z"),
    repositoryFactory: factoryFor("initial", true),
  });
  assert.deepEqual(initial.trees.map((tree) => tree.mode), ["initial", "initial", "initial"]);

  const rewritten = await synchronizeGit({
    root,
    initialSince: "2025-01-01",
    now: new Date("2026-09-05T12:00:00Z"),
    repositoryFactory: factoryFor("rewrite", false),
  });
  assert.deepEqual(rewritten.trees.map((tree) => tree.mode), ["rewrite", "rewrite", "rewrite"]);
  const alexAfterRewrite = await json(path.join(root, "data", "indexes", "alex.json")) as GitCommit[];
  assert.equal(alexAfterRewrite.length, 2);
  assert.equal(alexAfterRewrite.find((commit) => commit.commit === HEADS.initial.alex)?.currentlyPresent, false);
  assert.equal(alexAfterRewrite.find((commit) => commit.commit === HEADS.rewrite.alex)?.currentlyPresent, true);

  const ranges: string[] = [];
  const forwarded = await synchronizeGit({
    root,
    initialSince: "2025-01-01",
    now: new Date("2026-09-05T13:00:00Z"),
    repositoryFactory: factoryFor("forward", true, ranges),
  });
  assert.deepEqual(forwarded.trees.map((tree) => tree.mode), ["fast-forward", "fast-forward", "fast-forward"]);
  assert.ok(ranges.includes(`alex:${HEADS.rewrite.alex}..${HEADS.forward.alex}`));
  const metadata = await json(path.join(root, "data", "metadata.json")) as { sources: Record<string, { head: string }> };
  for (const tree of TRACKED_TREES) assert.equal(metadata.sources[tree.id].head, HEADS.forward[tree.id]);
});

test("does not replace committed indexes when one remote fails", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "buding-git-failure-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const indexFile = path.join(root, "data", "indexes", "alex.json");
  await mkdir(path.dirname(indexFile), { recursive: true });
  await writeFile(indexFile, "[]\n");
  const repositoryFactory: RepositoryFactory = (_cachePath, tree) => {
    if (tree.id === "corbet") {
      return {
        fetch: async () => { throw new Error("remote unavailable"); },
        hasCommit: async () => false,
        isAncestor: async () => false,
        relevantCommitIds: async () => [],
        readCommits: async () => [],
      };
    }
    return factoryFor("initial", true)(_cachePath, tree);
  };

  await assert.rejects(synchronizeGit({
    root,
    initialSince: "2025-01-01",
    repositoryFactory,
  }), /remote unavailable/);
  assert.equal(await readFile(indexFile, "utf8"), "[]\n");
  const runState = await json(path.join(root, "data", "internal", "sync-state.json")) as { status: string; source: string };
  assert.equal(runState.status, "error");
  assert.equal(runState.source, "git:corbet");
});
