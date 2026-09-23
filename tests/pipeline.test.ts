import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { generateFromLoreCache } from "../lib/data/pipeline.ts";
import type { GitCommit } from "../lib/data/schema.ts";
import { FixtureLoreSource } from "../lib/lore/fixture-source.ts";

async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}

test("generates reconciled JSON from the lore cache idempotently", async (context) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "buding-generate-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  const fixture = await new FixtureLoreSource(path.join(process.cwd(), "fixtures", "lore")).loadDataset();
  const observedAt = "2026-09-05T12:00:00Z";
  const linusCommit: GitCommit = {
    tree: "linus",
    branch: "master",
    commit: "f".repeat(40),
    subject: "docs/zh_TW: fix admin-guide typo",
    authorName: "Yung-Chuan Liao",
    authorEmail: "liao@example.org",
    authorDate: "2026-09-05T10:00:00Z",
    committerDate: observedAt,
    patchId: "5".repeat(40),
    changedFiles: ["Documentation/translations/zh_TW/admin-guide/index.rst"],
    firstSeenAt: observedAt,
    lastSeenAt: observedAt,
    currentlyPresent: true,
  };

  await writeJson(path.join(root, "data", "internal", "lore-messages.json"), { messages: fixture.messages });
  await writeJson(path.join(root, "data", "indexes", "alex.json"), []);
  await writeJson(path.join(root, "data", "indexes", "corbet.json"), []);
  await writeJson(path.join(root, "data", "indexes", "linus.json"), [linusCommit]);
  await writeJson(path.join(root, "data", "metadata.json"), {
    mode: "fixture",
    generatedAt: observedAt,
    sources: { lore: { status: "ok", lastSuccessfulSync: observedAt } },
  });
  await writeFile(path.join(root, "data", "overrides.yml"), "matches: []\nignore: []\n");

  const first = await generateFromLoreCache(root);
  const firstSummary = await readFile(path.join(root, "data", "patchsets.json"), "utf8");
  const second = await generateFromLoreCache(root);
  const secondSummary = await readFile(path.join(root, "data", "patchsets.json"), "utf8");

  assert.equal(first.details.length, 4);
  assert.equal(first.confirmed, 1);
  assert.equal(secondSummary, firstSummary);
  assert.deepEqual(second, first);
  const single = second.details.find((detail) => detail.subject.includes("admin-guide typo"));
  assert.equal(single?.status, "applied");
});
