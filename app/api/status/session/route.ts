import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { activeApiKey, verifyApiKey } from "@/lib/auth/api-key";
import { API_SESSION_COOKIE, createSession, readSession, sessionCookie, shouldRefreshSession } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let apiKey: unknown;
  try {
    ({ apiKey } = await request.json());
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }
  if (typeof apiKey !== "string" || apiKey.length > 512) return NextResponse.json({ error: "Invalid API key." }, { status: 400 });
  const identity = await verifyApiKey(apiKey);
  if (!identity) return NextResponse.json({ error: "Invalid, expired, or revoked API key." }, { status: 401 });
  const response = NextResponse.json({ actor: identity.label, role: identity.role });
  response.cookies.set(API_SESSION_COOKIE, createSession(identity), sessionCookie());
  return response;
}

export async function GET() {
  const session = readSession((await cookies()).get(API_SESSION_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  const key = await activeApiKey(session.keyId);
  if (!key) return NextResponse.json({ error: "API key has been revoked or expired." }, { status: 401 });
  const response = NextResponse.json({ actor: key.label, role: key.role });
  if (shouldRefreshSession(session)) response.cookies.set(API_SESSION_COOKIE, createSession(key), sessionCookie());
  return response;
}

export async function DELETE() {
  const response = new NextResponse(null, { status: 204 });
  response.cookies.set(API_SESSION_COOKIE, "", { ...sessionCookie(), maxAge: 0 });
  return response;
}
