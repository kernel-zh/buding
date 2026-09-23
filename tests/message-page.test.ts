import assert from "node:assert/strict";
import test from "node:test";
import { patchLineKind } from "../lib/messages/content.ts";
import { messagePath, messageRouteId } from "../lib/messages/routing.ts";

test("builds a stable local route from a bracketed Message-ID", () => {
  const messageId = "<20260905154900.1272-1-author@example.com>";
  assert.equal(messageRouteId(messageId), "20260905154900.1272-1-author_40example.com");
  assert.equal(messagePath(messageId), "/messages/20260905154900.1272-1-author_40example.com");
});

test("classifies patch lines for diff highlighting", () => {
  assert.equal(patchLineKind("diff --git a/a b/a"), "header");
  assert.equal(patchLineKind("@@ -1 +1 @@"), "header");
  assert.equal(patchLineKind("+++ b/a"), "header");
  assert.equal(patchLineKind("+added"), "added");
  assert.equal(patchLineKind("-removed"), "removed");
  assert.equal(patchLineKind("-- "), "context");
  assert.equal(patchLineKind("context"), "context");
});
