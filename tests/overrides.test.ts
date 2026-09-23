import assert from "node:assert/strict";
import test from "node:test";
import { parseOverrides } from "../lib/matching/overrides.ts";

test("parses reviewable match and ignore overrides", () => {
  const result = parseOverrides(`
matches:
  - message_id: "<edited@example.com>"
    tree: alex
    commit: abcdef1234567
    reason: "Patch edited while applying"
ignore:
  - message_id: '<noise@example.com>'
    reason: Not a Chinese translation patch
states:
  - message_id: "<invalid@example.com>"
    state: invalid
    reason: Superseded outside the tracked revision family
    evidence: https://lore.kernel.org/linux-doc/reply/
`);

  assert.deepEqual(result.matches[0], {
    messageId: "<edited@example.com>",
    tree: "alex",
    commit: "abcdef1234567",
    reason: "Patch edited while applying",
  });
  assert.equal(result.ignore[0].messageId, "<noise@example.com>");
  assert.deepEqual(result.states[0], {
    messageId: "<invalid@example.com>",
    state: "invalid",
    reason: "Superseded outside the tracked revision family",
    evidence: "https://lore.kernel.org/linux-doc/reply/",
  });
});

test("rejects ambiguous duplicate overrides", () => {
  assert.throws(() => parseOverrides(`
matches:
  - message_id: "<edited@example.com>"
    tree: alex
    commit: abcdef1
    reason: first
  - message_id: "<edited@example.com>"
    tree: alex
    commit: 1234567
    reason: second
ignore: []
states: []
`), /Duplicate match override/);
});
