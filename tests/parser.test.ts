import assert from "node:assert/strict";
import test from "node:test";
import { classifyLanguage, deduplicateMessages, extractChangedFiles, extractReviewTrailers } from "../lib/lore/parser.ts";
import type { LoreMessage } from "../lib/lore/types.ts";

test("classifies only exact Chinese translation paths", () => {
  assert.equal(classifyLanguage(["Documentation/translations/zh_CN/foo.rst"]), "zh_CN");
  assert.equal(classifyLanguage(["Documentation/translations/zh_TW/foo.rst"]), "zh_TW");
  assert.equal(classifyLanguage([
    "Documentation/translations/zh_CN/foo.rst",
    "Documentation/translations/zh_TW/foo.rst",
  ]), "mixed");
  assert.equal(classifyLanguage(["Documentation/translations/ja_JP/foo.rst"]), null);
  assert.equal(classifyLanguage(["Documentation/translation/zh_CN/foo.rst"]), null);
});

test("uses the subject only as a fallback", () => {
  assert.equal(classifyLanguage([], "docs/zh_CN: fix typo"), "zh_CN");
  assert.equal(classifyLanguage([], "unrelated documentation"), null);
});

test("extracts and deduplicates paths from a Git diff", () => {
  const body = "diff --git a/Documentation/translations/zh_CN/a.rst b/Documentation/translations/zh_CN/a.rst\n+++ b/Documentation/translations/zh_CN/a.rst";
  assert.deepEqual(extractChangedFiles(body), ["Documentation/translations/zh_CN/a.rst"]);
});

test("deduplicates messages by Message-ID", () => {
  const message: LoreMessage = {
    messageId: "<same@example.com>", subject: "[PATCH] docs/zh_CN: test", from: { name: "A", email: "a@example.com" },
    date: "2026-01-01T00:00:00Z", references: [], body: "", loreUrl: "https://example.com", rawUrl: "https://example.com/raw",
  };
  assert.equal(deduplicateMessages([message, { ...message }]).length, 1);
});

test("extracts supported review trailers without using them as Git evidence", () => {
  const message: LoreMessage = {
    messageId: "<review@example.com>", subject: "Re: [PATCH] docs/zh_CN: test", from: { name: "R", email: "r@example.com" },
    date: "2026-01-01T00:00:00Z", references: [], body: "reviewed-by: Reviewer <r@example.com>\nAcked-by: Maintainer <m@example.com>\nSigned-off-by: Ignored <i@example.com>", loreUrl: "https://example.com", rawUrl: "https://example.com/raw",
  };
  assert.deepEqual(extractReviewTrailers([message]), [
    { type: "Reviewed-by", value: "Reviewer <r@example.com>", messageId: "<review@example.com>" },
    { type: "Acked-by", value: "Maintainer <m@example.com>", messageId: "<review@example.com>" },
  ]);
});
