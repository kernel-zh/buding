import assert from "node:assert/strict";
import test from "node:test";
import { buildLoreQuery, syncStart } from "../lib/lore/query.ts";

test("uses a one-hour overlap after a successful sync", () => {
  assert.equal(
    syncStart("2026-09-05T10:30:00Z", "2025-01-01").toISOString(),
    "2026-09-05T09:30:00.000Z",
  );
});

test("builds a date-bounded Chinese documentation query", () => {
  const query = buildLoreQuery(new Date("2026-09-05T09:30:00Z"));
  assert.match(query, /dfn:Documentation\/translations\/zh_CN\/\*/);
  assert.match(query, /dfn:Documentation\/translations\/zh_TW\/\*/);
  assert.match(query, /s:"docs\/zh_CN"/);
  assert.match(query, /d:2026-09-05T09:30:00\.000Z\.\./);
});
