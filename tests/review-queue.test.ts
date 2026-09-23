import assert from "node:assert/strict";
import test from "node:test";
import type { PatchsetDetail, PatchsetReviewState, TreeId, TreeSummary } from "../lib/data/schema.ts";
import { buildReviewQueue } from "../lib/review/queue.ts";

const missing = (): TreeSummary => ({ state: "missing", matched: 0, total: 1 });
const trees = (): Record<TreeId, TreeSummary> => ({ alex: missing(), corbet: missing(), linus: missing() });

function detail(id: string, postedAt: string, reviewState: PatchsetReviewState = "waiting"): PatchsetDetail {
  const messageId = `<${id}@example.com>`;
  return {
    id,
    subject: `[PATCH] docs/zh_CN: ${id}`,
    authorName: "Author",
    authorEmail: "author@example.com",
    revision: 1,
    postedAt,
    language: "zh_CN",
    patchCount: 1,
    status: "proposed",
    lifecycle: "active",
    reviewState,
    reviewReplies: reviewState === "waiting" ? 0 : 2,
    latestRevision: true,
    messageIds: [messageId],
    trees: trees(),
    rfc: false,
    loreUrl: "https://lore.kernel.org/linux-doc/test/",
    rawUrl: "https://lore.kernel.org/linux-doc/test/raw",
    replies: reviewState === "waiting" ? 0 : 2,
    versions: [{ revision: 1, id, current: true }],
    patches: [{
      index: 1,
      total: 1,
      subject: id,
      messageId,
      loreUrl: "https://lore.kernel.org/linux-doc/test/",
      changedFiles: ["Documentation/translations/zh_CN/test.rst"],
      trees: trees(),
    }],
  };
}

test("keeps only active latest pre-Alex series and sorts newest first", () => {
  const discussion = detail("discussion-v1", "2026-03-01T00:00:00Z", "discussion");
  const waiting = detail("waiting-v1", "2026-02-01T00:00:00Z");
  const withdrawn = detail("withdrawn-v1", "2026-03-01T00:00:00Z");
  withdrawn.lifecycle = "withdrawn";
  const queued = detail("queued-v1", "2026-04-01T00:00:00Z");
  queued.trees.alex = { state: "confirmed", matched: 1, total: 1 };

  assert.deepEqual(
    buildReviewQueue([discussion, queued, withdrawn, waiting]).map((item) => item.id),
    ["discussion-v1", "waiting-v1"],
  );
});
