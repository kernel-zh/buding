import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { activeApiKey } from "@/lib/auth/api-key";
import { API_SESSION_COOKIE, createSession, readSession, sessionCookie, shouldRefreshSession } from "@/lib/auth/session";
import { getPatchset } from "@/lib/data/loader";
import { readSupabasePublisherConfig, SupabaseRest } from "@/lib/data/supabase";
import { isManualPatchsetStatus } from "@/lib/status/policy";

export const runtime = "nodejs";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "Cross-origin status changes are not allowed." }, { status: 403 });
  const session = readSession((await cookies()).get(API_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  // Check revocation on every mutation, so removing a key takes effect
  // immediately rather than waiting for the browser cookie to expire.
  const activeKey = await activeApiKey(session.keyId);
  if (!activeKey) return NextResponse.json({ error: "API key has been revoked or expired." }, { status: 401 });
  let body: { status?: unknown; reason?: unknown };
  try {
    body = await request.json() as { status?: unknown; reason?: unknown };
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }
  if (!isManualPatchsetStatus(body.status)) return NextResponse.json({ error: "Unknown patch status." }, { status: 400 });
  if (body.reason !== undefined && (typeof body.reason !== "string" || body.reason.length > 1000)) return NextResponse.json({ error: "Reason must be at most 1000 characters." }, { status: 400 });
  const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim() : null;
  const { id } = await params;
  const patchset = /^[a-z0-9-]+$/.test(id) ? await getPatchset(id) : null;
  if (!patchset) return NextResponse.json({ error: "Patchset not found." }, { status: 404 });
  const setAt = new Date().toISOString();
  const database = new SupabaseRest(readSupabasePublisherConfig());
  await database.upsertWithConflict("buding_patchset_status_overrides", "patchset_id", [{
    patchset_id: id,
    status: body.status,
    reason,
    actor_key_id: activeKey.keyId,
    actor_label: activeKey.label,
    set_at: setAt,
  }]);
  await database.upsertWithConflict("buding_patchset_status_events", "id", [{
    id: crypto.randomUUID(),
    patchset_id: id,
    status: body.status,
    reason,
    actor_key_id: activeKey.keyId,
    actor_label: activeKey.label,
    source: "manual",
    created_at: setAt,
  }]);
  const response = NextResponse.json({ status: body.status, reason, actor: activeKey.label, setAt });
  if (shouldRefreshSession(session)) response.cookies.set(API_SESSION_COOKIE, createSession(activeKey), sessionCookie());
  return response;
}
