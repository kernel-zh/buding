import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { synchronizeLore } from "../lib/lore/sync.ts";
import type { LoreMessage, LoreSource } from "../lib/lore/types.ts";

const patch: LoreMessage = {
  messageId: "<live-patch@example.com>",
  subject: "[PATCH] docs/zh_CN: fix live typo",
  from: { name: "Live Author", email: "author@example.com" },
  date: "2026-09-05T10:00:00Z",
  references: [],
  body: "diff --git a/Documentation/translations/zh_CN/a.rst b/Documentation/translations/zh_CN/a.rst\n+++ b/Documentation/translations/zh_CN/a.rst",
  loreUrl: "https://lore.kernel.org/linux-doc/live-patch%40example.com/",
  rawUrl: "https://lore.kernel.org/linux-doc/live-patch%40example.com/raw",
};

test("writes validated live data and incremental state", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "buding-sync-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const source: LoreSource = { search: async () => [patch, patch] };

  const report = await synchronizeLore({
    root,
    source,
    initialSince: "2025-01-01",
    now: new Date("2026-09-05T11:00:00Z"),
  });
  const metadata = JSON.parse(await readFile(path.join(root, "data", "metadata.json"), "utf8"));
  const cache = JSON.parse(await readFile(path.join(root, "data", "internal", "lore-messages.json"), "utf8"));

  assert.equal(report.retrievedMessages, 1);
  assert.equal(report.series, 1);
  assert.equal(metadata.mode, "live");
  assert.equal(cache.messages.length, 1);
  assert.match(report.query, /d:2025-01-01T00:00:00\.000Z\.\./);
});

test("keeps existing public data when lore retrieval fails", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "buding-sync-failure-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const publicFile = path.join(root, "data", "patchsets.json");
  await mkdir(path.dirname(publicFile), { recursive: true });
  await writeFile(publicFile, "sentinel\n");
  const source: LoreSource = { search: async () => { throw new Error("lore offline"); } };

  await assert.rejects(synchronizeLore({ root, source, initialSince: "2025-01-01" }), /lore offline/);
  assert.equal(await readFile(publicFile, "utf8"), "sentinel\n");
  const runState = JSON.parse(await readFile(path.join(root, "data", "internal", "sync-state.json"), "utf8"));
  assert.equal(runState.status, "error");
});

test("can update the lore cache without replacing public data before the full pipeline succeeds", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "buding-sync-staged-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const publicFile = path.join(root, "data", "patchsets.json");
  await mkdir(path.dirname(publicFile), { recursive: true });
  await writeFile(publicFile, "sentinel\n");
  const source: LoreSource = { search: async () => [patch] };

  await synchronizeLore({
    root,
    source,
    initialSince: "2025-01-01",
    writePublicData: false,
  });

  assert.equal(await readFile(publicFile, "utf8"), "sentinel\n");
  const cache = JSON.parse(await readFile(path.join(root, "data", "internal", "lore-messages.json"), "utf8"));
  assert.equal(cache.messages.length, 1);
  assert.match(cache.messages[0].patchId, /^[0-9a-f]{40}$/);
});
