import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { addStablePatchIds } from "../lib/git/patch-id.ts";
import { checkedGit, runCommand } from "../lib/git/runner.ts";
import type { LoreMessage } from "../lib/lore/types.ts";

function message(id: string, replacement: string): LoreMessage {
  return {
    messageId: `<${id}@example.com>`,
    subject: `[PATCH] docs/zh_CN: replace ${replacement}`,
    from: { name: "Patch Author", email: "author@example.com" },
    date: "2026-09-05T10:00:00Z",
    references: [],
    body: [
      "diff --git a/Documentation/translations/zh_CN/a.rst b/Documentation/translations/zh_CN/a.rst",
      "index 1111111..2222222 100644",
      "--- a/Documentation/translations/zh_CN/a.rst",
      "+++ b/Documentation/translations/zh_CN/a.rst",
      "@@ -1 +1 @@",
      "-old",
      `+${replacement}`,
    ].join("\n"),
    loreUrl: `https://lore.kernel.org/linux-doc/${id}/`,
    rawUrl: `https://lore.kernel.org/linux-doc/${id}/raw`,
  };
}

test("computes stable patch IDs in one batch and preserves cached values", async () => {
  const cached = { ...message("cached", "cached"), patchId: "a".repeat(40) };
  const result = await addStablePatchIds([message("one", "one"), message("two", "two"), cached]);

  assert.equal(result.computed, 2);
  assert.match(result.messages[0].patchId ?? "", /^[0-9a-f]{40}$/);
  assert.match(result.messages[1].patchId ?? "", /^[0-9a-f]{40}$/);
  assert.notEqual(result.messages[0].patchId, result.messages[1].patchId);
  assert.equal(result.messages[2].patchId, "a".repeat(40));
  assert.equal((await addStablePatchIds(result.messages)).computed, 0);
});

test("email and commit forms of the same diff have the same stable patch ID", async (context) => {
  const repository = await mkdtemp(path.join(os.tmpdir(), "buding-email-patch-id-"));
  context.after(() => rm(repository, { recursive: true, force: true }));
  const git = (args: string[], input?: string) => checkedGit(runCommand, args, { cwd: repository, ...(input ? { input } : {}) });
  await git(["init", "--quiet"]);
  await git(["config", "user.name", "Patch Author"]);
  await git(["config", "user.email", "author@example.com"]);
  await writeFile(path.join(repository, "translation.rst"), "old\n");
  await git(["add", "translation.rst"]);
  await git(["commit", "--quiet", "-m", "base"]);
  await writeFile(path.join(repository, "translation.rst"), "new\n");
  await git(["commit", "--quiet", "-am", "docs/zh_CN: fix translation"]);

  const email = await git(["format-patch", "-1", "--stdout"]);
  const commitPatch = await git(["show", "--format=email", "--binary", "--no-ext-diff", "HEAD"]);
  const expected = (await git(["patch-id", "--stable"], commitPatch.stdout)).stdout.split(/\s+/, 1)[0];
  const original = await addStablePatchIds([{
    ...message("original", "unused"),
    subject: "[PATCH] docs/zh_CN: fix translation",
    body: email.stdout,
  }]);
  assert.equal(original.messages[0].patchId, expected);
});
