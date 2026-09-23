import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { withManualStatus } from "../lib/status/overrides.ts";
import type { PatchsetSummary } from "../lib/data/schema.ts";
import { createSession, readSession, shouldRefreshSession } from "../lib/auth/session.ts";
import { createApiKey, verifyApiKey } from "../lib/auth/api-key.ts";
import { isManualPatchsetStatus } from "../lib/status/policy.ts";

const patchset: PatchsetSummary = {
  id: "translation-fix-123456789abc-v1", subject: "[PATCH] docs/zh_CN: fix typo", authorName: "Author", authorEmail: "author@example.com",
  revision: 1, postedAt: "2026-09-20T00:00:00Z", language: "zh_CN", patchCount: 1, status: "proposed", lifecycle: "active",
  reviewState: "waiting", reviewReplies: 0, latestRevision: true, messageIds: ["<patch@example.com>"],
  trees: {
    alex: { state: "missing", matched: 0, total: 1 }, corbet: { state: "missing", matched: 0, total: 1 }, linus: { state: "missing", matched: 0, total: 1 },
  },
};

test("manual status overrides the automatically derived status", () => {
  const result = withManualStatus(patchset, new Map([[patchset.id, {
    status: "needs-revision", reason: "Please address the review.", actor: "Maintainer", setAt: "2026-09-20T01:00:00Z",
  }]]));
  assert.equal(result.status, "needs-revision");
  assert.equal(result.manualStatus?.actor, "Maintainer");
});

test("a manual status overrides the automatic status on an old revision", () => {
  const oldRevision = { ...patchset, latestRevision: false };
  const result = withManualStatus(oldRevision, new Map([[patchset.id, {
    status: "approved", actor: "Maintainer", setAt: "2026-09-20T01:00:00Z",
  }]]));
  assert.equal(result.status, "approved");
  assert.equal(result.manualStatus?.status, "approved");
});

test("a manual status overrides an automatically applied status", () => {
  const applied = {
    ...patchset,
    trees: { ...patchset.trees, alex: { state: "confirmed" as const, matched: 1, total: 1 } },
  };
  const result = withManualStatus(applied, new Map([[patchset.id, {
    status: "rejected", actor: "Maintainer", setAt: "2026-09-20T01:00:00Z",
  }]]));
  assert.equal(result.status, "rejected");
  assert.equal(result.manualStatus?.status, "rejected");
});

test("automatic status derivation remains the default without an override", () => {
  const oldRevision = withManualStatus({ ...patchset, latestRevision: false }, new Map());
  const applied = withManualStatus({
    ...patchset,
    trees: { ...patchset.trees, alex: { state: "confirmed" as const, matched: 1, total: 1 } },
  }, new Map());
  assert.equal(oldRevision.status, "superseded");
  assert.equal(applied.status, "applied");
});

test("all patch statuses are accepted as manual statuses", () => {
  const statuses = ["proposed", "needs-revision", "superseded", "approved", "rejected", "applied"] as const;
  assert.deepEqual(
    statuses.filter(isManualPatchsetStatus),
    statuses,
  );

  for (const status of statuses) {
    const result = withManualStatus(patchset, new Map([[patchset.id, {
      status, actor: "Maintainer", setAt: "2026-09-20T01:00:00Z",
    }]]));
    assert.equal(result.status, status);
  }
});

test("status session is signed and rejects a modified cookie", () => {
  process.env.BUDING_API_SESSION_SECRET = "test-session-secret";
  process.env.BUDING_API_SESSION_DAYS = "30";
  process.env.BUDING_API_SESSION_REFRESH_DAYS = "7";
  const value = createSession({ keyId: "key-1", label: "Maintainer", role: "operator" });
  assert.equal(readSession(value)?.keyId, "key-1");
  assert.equal(readSession(`${value}x`), null);
});

test("status session refreshes only inside the configured renewal window", () => {
  process.env.BUDING_API_SESSION_DAYS = "30";
  process.env.BUDING_API_SESSION_REFRESH_DAYS = "7";
  const common = { keyId: "key-1", label: "Maintainer", role: "operator" as const };
  assert.equal(shouldRefreshSession({ ...common, expiresAt: Date.now() + 6 * 24 * 60 * 60 * 1000 }), true);
  assert.equal(shouldRefreshSession({ ...common, expiresAt: Date.now() + 8 * 24 * 60 * 60 * 1000 }), false);
});

test("generated API keys retain their fixed-width Base64URL format", () => {
  process.env.BUDING_API_KEY_PEPPER = "test-api-key-pepper";
  for (let index = 0; index < 256; index += 1) {
    assert.match(createApiKey().apiKey, /^bdg_live_[A-Za-z0-9_-]{12}_[A-Za-z0-9_-]{43}$/);
  }
});

test("malformed ordinary API keys are rejected before a database lookup", async () => {
  const originalFetch = globalThis.fetch;
  const originalRootKey = process.env.BUDING_ADMIN_KEY;
  let requested = false;
  delete process.env.BUDING_ADMIN_KEY;
  globalThis.fetch = (async () => {
    requested = true;
    throw new Error("Malformed keys must not reach Supabase.");
  }) as typeof fetch;

  try {
    const malformed = [
      "bdg_live_short_secret",
      `bdg_live_${"a".repeat(13)}_${"b".repeat(43)}`,
      `bdg_live_${"a".repeat(12)}_${"b".repeat(42)}`,
      `bdg_live_${"a".repeat(12)}_${"b".repeat(43)}_extra`,
      `bdg_live_${"a".repeat(11)}!_${"b".repeat(43)}`,
    ];
    for (const apiKey of malformed) assert.equal(await verifyApiKey(apiKey), null);
    assert.equal(requested, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalRootKey === undefined) delete process.env.BUDING_ADMIN_KEY;
    else process.env.BUDING_ADMIN_KEY = originalRootKey;
  }
});

test("ordinary API keys authenticate when their encoded fields contain underscores", async () => {
  const keyId = "abc_def-1234";
  const secret = `${"a".repeat(20)}_${"b".repeat(22)}`;
  const apiKey = `bdg_live_${keyId}_${secret}`;
  const pepper = "test-api-key-pepper";
  const verifier = createHmac("sha256", pepper).update(apiKey).digest("hex");
  const originalFetch = globalThis.fetch;
  const originalEnvironment = {
    pepper: process.env.BUDING_API_KEY_PEPPER,
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SECRET_KEY,
  };
  const requests: Array<{ url: string; method: string }> = [];

  process.env.BUDING_API_KEY_PEPPER = pepper;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ url, method });
    if (method === "PATCH") return new Response(null, { status: 204 });
    return new Response(JSON.stringify([{
      key_id: keyId,
      verifier,
      label: "Maintainer",
      role: "operator",
      expires_at: null,
      revoked_at: null,
    }]), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;

  try {
    assert.deepEqual(await verifyApiKey(apiKey), { keyId, label: "Maintainer", role: "operator" });
    assert.equal(requests.length, 2);
    assert.match(requests[0].url, /key_id=eq\.abc_def-1234/);
    assert.equal(requests[1].method, "PATCH");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnvironment.pepper === undefined) delete process.env.BUDING_API_KEY_PEPPER;
    else process.env.BUDING_API_KEY_PEPPER = originalEnvironment.pepper;
    if (originalEnvironment.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = originalEnvironment.url;
    if (originalEnvironment.key === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = originalEnvironment.key;
  }
});

test("the environment root key authenticates without a database record", async () => {
  process.env.BUDING_ADMIN_KEY = "test-root-key";
  const identity = await verifyApiKey("test-root-key");
  assert.equal(identity?.role, "admin");
  assert.match(identity?.keyId ?? "", /^root_/);
});
