import assert from "node:assert/strict";
import test from "node:test";
import { parsePatchSubject } from "../lib/lore/subject.ts";

const cases = [
  ["[PATCH] docs/zh_CN: fix typo", { revision: 1, index: null, total: null, rfc: false }],
  ["[PATCH 1/2] docs/zh_CN: part one", { revision: 1, index: 1, total: 2, rfc: false }],
  ["[PATCH 0/2] docs/zh_CN: cover", { revision: 1, index: 0, total: 2, rfc: false }],
  ["[PATCH v4 0/7] docs/zh_CN: cover", { revision: 4, index: 0, total: 7, rfc: false }],
  ["[RFC PATCH v2 3/9] docs/zh_TW: part", { revision: 2, index: 3, total: 9, rfc: true }],
] as const;

for (const [subject, expected] of cases) {
  test(`parses ${subject}`, () => {
    const result = parsePatchSubject(subject);
    assert.equal(result.isPatch, true);
    assert.deepEqual(
      { revision: result.revision, index: result.index, total: result.total, rfc: result.rfc },
      expected,
    );
  });
}

test("marks replies without turning them into standalone patchsets", () => {
  const result = parsePatchSubject("Re: [PATCH v3 2/4] docs/zh_CN: update text");
  assert.equal(result.isPatch, true);
  assert.equal(result.isReply, true);
  assert.equal(result.baseSubject, "docs/zh_CN: update text");
});

test("degrades malformed revision and part numbering safely", () => {
  const result = parsePatchSubject("[PATCH v0 7/3] docs/zh_CN: malformed numbering");
  assert.equal(result.isPatch, true);
  assert.equal(result.revision, 1);
  assert.equal(result.index, null);
  assert.equal(result.total, null);
});
