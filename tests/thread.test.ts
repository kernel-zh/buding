import assert from "node:assert/strict";
import test from "node:test";
import { reconstructThreads } from "../lib/lore/thread.ts";
import type { LoreMessage } from "../lib/lore/types.ts";

const base = { from: { name: "A", email: "a@example.com" }, date: "2026-01-01T00:00:00Z", body: "", loreUrl: "https://example.com", rawUrl: "https://example.com/raw" };
const messages: LoreMessage[] = [
  { ...base, messageId: "<cover@example.com>", subject: "[PATCH 0/2] cover", references: [] },
  { ...base, messageId: "<one@example.com>", subject: "[PATCH 1/2] one", references: ["<cover@example.com>"], inReplyTo: "<cover@example.com>" },
  { ...base, messageId: "<reply@example.com>", subject: "Re: [PATCH 1/2] one", references: ["<cover@example.com>", "<one@example.com>"], inReplyTo: "<one@example.com>" },
];

test("reconstructs a cover, child patch, and review reply into one thread", () => {
  const threads = reconstructThreads(messages);
  assert.equal(threads.length, 1);
  assert.equal(threads[0].rootMessageId, "<cover@example.com>");
  assert.deepEqual(threads[0].messages.map((message) => message.messageId), ["<cover@example.com>", "<one@example.com>", "<reply@example.com>"]);
});
