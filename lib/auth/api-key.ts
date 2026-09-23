import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readSupabasePublisherConfig, SupabaseRest } from "../data/supabase.ts";

export type ApiKeyRole = "admin" | "operator";

const API_KEY_PATTERN = /^bdg_live_([A-Za-z0-9_-]{12})_[A-Za-z0-9_-]{43}$/;

interface ApiKeyRow {
  key_id: string;
  verifier: string;
  label: string;
  role: ApiKeyRole;
  expires_at: string | null;
  revoked_at: string | null;
}

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be configured for patch status authentication.`);
  return value;
}

function verifier(apiKey: string): string {
  return createHmac("sha256", requiredEnvironment("BUDING_API_KEY_PEPPER")).update(apiKey).digest("hex");
}

function rootKey(): string | undefined {
  return process.env.BUDING_ADMIN_KEY?.trim() || undefined;
}

function matches(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function rootKeyId(): string | undefined {
  const key = rootKey();
  return key ? `root_${createHash("sha256").update(key).digest("hex").slice(0, 24)}` : undefined;
}

function keys(): SupabaseRest {
  return new SupabaseRest(readSupabasePublisherConfig());
}

export function createApiKey(): { keyId: string; apiKey: string; verifier: string } {
  const keyId = randomBytes(9).toString("base64url");
  const apiKey = `bdg_live_${keyId}_${randomBytes(32).toString("base64url")}`;
  return { keyId, apiKey, verifier: verifier(apiKey) };
}

export async function verifyApiKey(apiKey: string): Promise<{ keyId: string; label: string; role: ApiKeyRole } | null> {
  const configuredRootKey = rootKey();
  const configuredRootKeyId = rootKeyId();
  if (configuredRootKey && configuredRootKeyId && matches(apiKey, configuredRootKey)) {
    return { keyId: configuredRootKeyId, label: "Root administrator", role: "admin" };
  }
  // Base64URL itself may contain underscores, so splitting on every
  // underscore rejects otherwise valid keys. Both encoded fields have fixed
  // lengths (9 bytes -> 12 characters, 32 bytes -> 43 characters), which lets
  // us parse existing keys without changing their format or stored verifier.
  const keyId = API_KEY_PATTERN.exec(apiKey)?.[1];
  if (!keyId) return null;
  const [row] = await keys().select<ApiKeyRow>("buding_api_keys", { key_id: `eq.${keyId}` });
  if (!row || row.revoked_at || (row.expires_at && Date.parse(row.expires_at) <= Date.now())) return null;
  const expected = Buffer.from(row.verifier, "hex");
  const actual = Buffer.from(verifier(apiKey), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  await keys().updateWhere("buding_api_keys", { key_id: `eq.${row.key_id}` }, { last_used_at: new Date().toISOString() });
  return { keyId: row.key_id, label: row.label, role: row.role };
}

export async function activeApiKey(keyId: string): Promise<{ keyId: string; label: string; role: ApiKeyRole } | null> {
  if (isRootAdminKey(keyId)) return { keyId, label: "Root administrator", role: "admin" };
  const [row] = await keys().select<ApiKeyRow>("buding_api_keys", { key_id: `eq.${keyId}` });
  if (!row || row.revoked_at || (row.expires_at && Date.parse(row.expires_at) <= Date.now())) return null;
  return { keyId: row.key_id, label: row.label, role: row.role };
}

export function isRootAdminKey(keyId: string): boolean {
  const configuredRootKeyId = rootKeyId();
  return Boolean(configuredRootKeyId && matches(keyId, configuredRootKeyId));
}
