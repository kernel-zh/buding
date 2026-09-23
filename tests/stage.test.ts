import assert from "node:assert/strict";
import test from "node:test";
import type { PatchsetSummary, TreeId, TreeSummary } from "../lib/data/schema.ts";
import { furthestConfirmedStage } from "../lib/data/stage.ts";

function tree(matched = 0): TreeSummary {
  return { state: matched ? "partial" : "missing", matched, total: 2 };
}

function patchset(trees: Record<TreeId, TreeSummary>): PatchsetSummary {
  return {
    id: "series-v1",
    subject: "[PATCH] docs/zh_CN: test",
    authorName: "Author",
    authorEmail: "author@example.com",
    revision: 1,
    postedAt: "2026-09-05T00:00:00Z",
    language: "zh_CN",
    patchCount: 2,
    status: "proposed",
    lifecycle: "active",
    reviewState: "waiting",
    reviewReplies: 0,
    latestRevision: true,
    messageIds: ["<patch@example.com>"],
    trees,
  };
}

test("places partial series at the furthest tree with confirmed patches", () => {
  assert.equal(furthestConfirmedStage(patchset({ alex: tree(1), corbet: tree(), linus: tree() })), "alex");
  assert.equal(furthestConfirmedStage(patchset({ alex: tree(2), corbet: tree(1), linus: tree() })), "corbet");
  assert.equal(furthestConfirmedStage(patchset({ alex: tree(2), corbet: tree(2), linus: tree(1) })), "linus");
});

test("keeps candidate-only series on lore because it has no confirmation", () => {
  const candidate = { state: "candidate", matched: 0, total: 1 } as const;
  assert.equal(furthestConfirmedStage(patchset({ alex: candidate, corbet: candidate, linus: candidate })), "lore");
});
