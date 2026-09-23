import assert from "node:assert/strict";
import test from "node:test";
import { lifecycleFromMail } from "../lib/lore/status.ts";
import type { LoreMessage } from "../lib/lore/types.ts";

function message(options: Partial<LoreMessage> & Pick<LoreMessage, "messageId" | "body">): LoreMessage {
  return {
    subject: "Re: [PATCH] docs/zh_CN: test",
    from: { name: "Patch Author", email: "author@example.com" },
    date: "2026-09-06T00:00:00Z",
    references: ["<patch@example.com>"],
    loreUrl: `https://lore.kernel.org/linux-doc/${encodeURIComponent(options.messageId)}/`,
    rawUrl: `https://lore.kernel.org/linux-doc/${encodeURIComponent(options.messageId)}/raw`,
    ...options,
  };
}

test("accepts the latest exact unquoted Patch-status command from the author", () => {
  const messages = [
    message({ messageId: "<withdraw@example.com>", body: "Patch-status: withdrawn", date: "2026-09-06T01:00:00Z" }),
    message({ messageId: "<active@example.com>", body: "> Patch-status: withdrawn\n\nPatch-status: active", date: "2026-09-06T02:00:00Z" }),
  ];
  const result = lifecycleFromMail(messages, "AUTHOR@example.com", new Set(["<patch@example.com>"]));
  assert.equal(result.lifecycle, "active");
  assert.equal(result.event?.messageId, "<active@example.com>");
  assert.equal(result.event?.source, "mail");
});

test("ignores directives from other senders, quoted text, and patch bodies", () => {
  const messages = [
    message({
      messageId: "<reviewer@example.com>",
      body: "Patch-status: withdrawn",
      from: { name: "Reviewer", email: "reviewer@example.com" },
    }),
    message({ messageId: "<quoted@example.com>", body: "> Patch-status: withdrawn" }),
    message({ messageId: "<patch@example.com>", body: "Patch-status: withdrawn" }),
  ];
  assert.deepEqual(
    lifecycleFromMail(messages, "author@example.com", new Set(["<patch@example.com>"])),
    { lifecycle: "active" },
  );
});

test("accepts lifecycle commands from configured maintainers", () => {
  const result = lifecycleFromMail([
    message({
      messageId: "<maintainer@example.com>",
      body: "Patch-status: invalid",
      from: { name: "Jonathan Corbet", email: "corbet@lwn.net" },
    }),
  ], "author@example.com", new Set(["<patch@example.com>"]));
  assert.equal(result.lifecycle, "invalid");
  assert.equal(result.event?.actorEmail, "corbet@lwn.net");
});
