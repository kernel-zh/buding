import assert from "node:assert/strict";
import test from "node:test";
import type { GitCommit, PatchsetDetail, TreeId, TreeSummary } from "../lib/data/schema.ts";
import { reconcilePatchsets, type CommitIndexes } from "../lib/matching/reconcile.ts";

const missing = (): TreeSummary => ({ state: "missing", matched: 0, total: 1 });
const trees = (): Record<TreeId, TreeSummary> => ({ alex: missing(), corbet: missing(), linus: missing() });

function detail(messageId = "<patch@example.com>"): PatchsetDetail {
  return {
    id: "translation-fix-deadbeef0000-v1",
    subject: "[PATCH] docs/zh_CN: fix translation typo",
    authorName: "Patch Author",
    authorEmail: "author@example.com",
    revision: 1,
    postedAt: "2026-08-01T00:00:00Z",
    language: "zh_CN",
    patchCount: 1,
    status: "proposed",
    lifecycle: "active",
    reviewState: "waiting",
    reviewReplies: 0,
    latestRevision: true,
    messageIds: [messageId],
    trees: trees(),
    rfc: false,
    loreUrl: "https://lore.kernel.org/linux-doc/patch/",
    rawUrl: "https://lore.kernel.org/linux-doc/patch/raw",
    replies: 0,
    versions: [{ revision: 1, id: "translation-fix-deadbeef0000-v1", current: true }],
    patches: [{
      index: 1,
      total: 1,
      subject: "docs/zh_CN: fix translation typo",
      messageId,
      loreUrl: "https://lore.kernel.org/linux-doc/patch/",
      changedFiles: ["Documentation/translations/zh_CN/a.rst"],
      patchId: "a".repeat(40),
      trees: trees(),
    }],
  };
}

function commit(tree: TreeId, options: Partial<GitCommit> = {}): GitCommit {
  return {
    tree,
    branch: tree === "alex" ? "docs-next" : tree === "corbet" ? "docs-mw" : "master",
    commit: options.commit ?? (tree === "alex" ? "1" : tree === "corbet" ? "2" : "3").repeat(40),
    subject: "docs/zh_CN: fix translation typo",
    authorName: "Patch Author",
    authorEmail: "author@example.com",
    authorDate: "2026-08-03T00:00:00Z",
    committerDate: "2026-08-04T00:00:00Z",
    patchId: options.patchId ?? "a".repeat(40),
    changedFiles: ["Documentation/translations/zh_CN/a.rst"],
    firstSeenAt: "2026-08-04T00:00:00Z",
    lastSeenAt: "2026-08-04T00:00:00Z",
    currentlyPresent: options.currentlyPresent ?? true,
    ...options,
  };
}

test("keeps confirmed, historical, and candidate matches distinct per tree", () => {
  const indexes: CommitIndexes = {
    alex: [commit("alex")],
    corbet: [commit("corbet", { currentlyPresent: false })],
    linus: [commit("linus", { patchId: "b".repeat(40) })],
  };
  const result = reconcilePatchsets([detail()], indexes, { matches: [], ignore: [], states: [] });
  const patchTrees = result.details[0].patches[0].trees;

  assert.equal(patchTrees.alex.state, "confirmed");
  assert.equal(patchTrees.corbet.state, "previously-present");
  assert.equal(patchTrees.linus.state, "candidate");
  assert.equal(result.details[0].status, "applied");
  assert.deepEqual(
    { confirmed: result.confirmed, candidates: result.candidates, previouslyPresent: result.previouslyPresent },
    { confirmed: 1, candidates: 1, previouslyPresent: 1 },
  );
});

test("manual overrides confirm edited patches and ignore known noise", () => {
  const source = detail();
  const indexes: CommitIndexes = { alex: [], corbet: [], linus: [] };
  const overridden = reconcilePatchsets([source], indexes, {
    matches: [{ messageId: "<patch@example.com>", tree: "alex", commit: "abcdef1", reason: "edited while applying" }],
    ignore: [],
    states: [],
  });
  assert.equal(overridden.details[0].patches[0].trees.alex.state, "confirmed");
  assert.equal(overridden.details[0].patches[0].trees.alex.commit, "abcdef1");
  assert.equal(overridden.manualOverrides, 1);

  const ignored = reconcilePatchsets([source], indexes, {
    matches: [],
    ignore: [{ messageId: "<patch@example.com>", reason: "not translation work" }],
    states: [],
  });
  assert.equal(ignored.details.length, 0);
  assert.equal(ignored.ignoredPatches, 1);
  const repeated = reconcilePatchsets(ignored.details, indexes, {
    matches: [],
    ignore: [{ messageId: "<patch@example.com>", reason: "not translation work" }],
    states: [],
  });
  assert.equal(repeated.details.length, 0);
  assert.equal(repeated.ignoredPatches, 0);
});

test("candidate matching requires strong metadata agreement", () => {
  const indexes: CommitIndexes = {
    alex: [commit("alex", { patchId: "b".repeat(40), authorEmail: "someone-else@example.com", authorName: "Someone Else" })],
    corbet: [],
    linus: [],
  };
  const result = reconcilePatchsets([detail()], indexes, { matches: [], ignore: [], states: [] });
  assert.equal(result.details[0].patches[0].trees.alex.state, "missing");
});

test("removes an entire series family three calendar months after it reaches Linus", () => {
  const versions = [
    { revision: 1, id: "translation-fix-deadbeef0000-v1", current: false },
    { revision: 2, id: "translation-fix-deadbeef0000-v2", current: true },
  ];
  const v1 = detail("<patch-v1@example.com>");
  v1.latestRevision = false;
  v1.versions = versions;
  const v2 = detail("<patch-v2@example.com>");
  v2.id = "translation-fix-deadbeef0000-v2";
  v2.revision = 2;
  v2.versions = versions;
  const indexes: CommitIndexes = {
    alex: [],
    corbet: [],
    linus: [commit("linus", {
      firstSeenAt: "2026-01-31T12:00:00Z",
      lastSeenAt: "2026-04-30T12:00:00Z",
    })],
  };

  const retained = reconcilePatchsets(
    [v1, v2],
    indexes,
    { matches: [], ignore: [], states: [] },
    { now: new Date("2026-04-30T11:59:59Z") },
  );
  assert.equal(retained.details.length, 2);
  assert.equal(retained.expiredMainlineFamilies, 0);

  const expired = reconcilePatchsets(
    [v1, v2],
    indexes,
    { matches: [], ignore: [], states: [] },
    { now: new Date("2026-04-30T12:00:00Z") },
  );
  assert.equal(expired.details.length, 0);
  assert.equal(expired.expiredMainlineFamilies, 1);
});

test("manual state overrides preserve terminal patchsets", () => {
  const result = reconcilePatchsets(
    [detail()],
    { alex: [], corbet: [], linus: [] },
    {
      matches: [],
      ignore: [],
      states: [{
        messageId: "<patch@example.com>",
        state: "invalid",
        reason: "not applicable to the current tree",
        evidence: "https://lore.kernel.org/linux-doc/reply/",
      }],
    },
  );
  assert.equal(result.details.length, 1);
  assert.equal(result.details[0].lifecycle, "invalid");
  assert.equal(result.details[0].status, "proposed");
  assert.equal(result.details[0].lifecycleEvent?.source, "override");
  assert.equal(result.stateOverrides, 1);
});
