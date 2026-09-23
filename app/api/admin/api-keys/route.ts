import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createApiKey, isRootAdminKey, type ApiKeyRole } from "@/lib/auth/api-key";
import { API_SESSION_COOKIE, readSession } from "@/lib/auth/session";
import { readSupabasePublisherConfig, SupabaseRest } from "@/lib/data/supabase";

interface ApiKeyRow {
  key_id: string;
  label: string;
  role: ApiKeyRole;
  created_at: string;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
}

export const runtime = "nodejs";

async function requireRoot(): Promise<NextResponse | null> {
  const session = readSession((await cookies()).get(API_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (!isRootAdminKey(session.keyId)) return NextResponse.json({ error: "The administrator root key is required." }, { status: 401 });
  return null;
}

function database(): SupabaseRest {
  return new SupabaseRest(readSupabasePublisherConfig());
}

function unavailable(): NextResponse {
  return NextResponse.json({ error: "API Key management tables are unavailable. Apply supabase/migrations/20260920000000_patch_status_auth.sql, then retry." }, { status: 503 });
}

export async function GET() {
  const error = await requireRoot();
  if (error) return error;
  try {
    const keys = await database().select<ApiKeyRow>("buding_api_keys");
    return NextResponse.json({ keys: keys.toSorted((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at)) });
  } catch {
    return unavailable();
  }
}

export async function POST(request: Request) {
  const error = await requireRoot();
  if (error) return error;
  let body: { label?: unknown; role?: unknown; expiresInDays?: unknown };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }
  if (typeof body.label !== "string" || !body.label.trim() || body.label.length > 120) return NextResponse.json({ error: "A key label of at most 120 characters is required." }, { status: 400 });
  if (body.role !== "admin" && body.role !== "operator") return NextResponse.json({ error: "Unknown key role." }, { status: 400 });
  const expiresInDays = body.expiresInDays === undefined || body.expiresInDays === null || body.expiresInDays === "" ? undefined : Number(body.expiresInDays);
  if (expiresInDays !== undefined && (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 3650)) return NextResponse.json({ error: "Expiration must be between 1 and 3650 days." }, { status: 400 });
  const key = createApiKey();
  const createdAt = new Date().toISOString();
  try {
    await database().upsertWithConflict("buding_api_keys", "key_id", [{
      key_id: key.keyId, verifier: key.verifier, label: body.label.trim(), role: body.role, created_at: createdAt,
      ...(expiresInDays ? { expires_at: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() } : {}),
    }]);
  } catch {
    return unavailable();
  }
  return NextResponse.json({ keyId: key.keyId, apiKey: key.apiKey, label: body.label.trim(), role: body.role }, { status: 201 });
}

export async function DELETE(request: Request) {
  const error = await requireRoot();
  if (error) return error;
  let body: { keyId?: unknown; deleteRecord?: unknown };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }
  const { keyId } = body;
  if (typeof keyId !== "string" || !/^[A-Za-z0-9_-]+$/.test(keyId)) return NextResponse.json({ error: "Invalid key ID." }, { status: 400 });
  try {
    if (body.deleteRecord === true) {
      await database().removeWhere("buding_api_keys", { key_id: `eq.${keyId}`, revoked_at: "not.is.null" });
      return new NextResponse(null, { status: 204 });
    }
    await database().updateWhere("buding_api_keys", { key_id: `eq.${keyId}`, revoked_at: "is.null" }, { revoked_at: new Date().toISOString() });
  } catch {
    return unavailable();
  }
  return new NextResponse(null, { status: 204 });
}

export async function PATCH(request: Request) {
  const error = await requireRoot();
  if (error) return error;
  let body: { keyId?: unknown; label?: unknown; role?: unknown; expiresInDays?: unknown };
  try { body = await request.json() as typeof body; } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }
  if (typeof body.keyId !== "string" || !/^[A-Za-z0-9_-]+$/.test(body.keyId)) return NextResponse.json({ error: "Invalid key ID." }, { status: 400 });
  if (typeof body.label !== "string" || !body.label.trim() || body.label.length > 120) return NextResponse.json({ error: "A key label of at most 120 characters is required." }, { status: 400 });
  if (body.role !== "admin" && body.role !== "operator") return NextResponse.json({ error: "Unknown key role." }, { status: 400 });
  const expiresInDays = body.expiresInDays === undefined ? undefined : body.expiresInDays === null || body.expiresInDays === "" ? null : Number(body.expiresInDays);
  if (expiresInDays !== undefined && expiresInDays !== null && (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 3650)) return NextResponse.json({ error: "Expiration must be between 1 and 3650 days." }, { status: 400 });
  try {
    await database().updateWhere("buding_api_keys", { key_id: `eq.${body.keyId}`, revoked_at: "is.null" }, {
      label: body.label.trim(), role: body.role,
      ...(expiresInDays === undefined ? {} : { expires_at: expiresInDays === null ? null : new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString() }),
    });
  } catch {
    return unavailable();
  }
  return new NextResponse(null, { status: 204 });
}
