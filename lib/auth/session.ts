import { createHmac, timingSafeEqual } from "node:crypto";
import type { ApiKeyRole } from "./api-key";

export const API_SESSION_COOKIE = "buding_api_session";
const DEFAULT_SESSION_DAYS = 30;
const DEFAULT_REFRESH_DAYS = 7;

export interface ApiSession { keyId: string; label: string; role: ApiKeyRole; expiresAt: number }

function secret(): string {
  const value = process.env.BUDING_API_SESSION_SECRET?.trim();
  if (!value) throw new Error("BUDING_API_SESSION_SECRET must be configured for API key authentication.");
  return value;
}

function days(name: "BUDING_API_SESSION_DAYS" | "BUDING_API_SESSION_REFRESH_DAYS", fallback: number): number {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1) throw new Error(`${name} must be a positive whole number of days.`);
  return Number(value);
}

function sessionConfiguration(): { lifetimeSeconds: number; refreshSeconds: number } {
  const lifetimeDays = days("BUDING_API_SESSION_DAYS", DEFAULT_SESSION_DAYS);
  const refreshDays = days("BUDING_API_SESSION_REFRESH_DAYS", DEFAULT_REFRESH_DAYS);
  if (refreshDays >= lifetimeDays) throw new Error("BUDING_API_SESSION_REFRESH_DAYS must be less than BUDING_API_SESSION_DAYS.");
  return { lifetimeSeconds: lifetimeDays * 24 * 60 * 60, refreshSeconds: refreshDays * 24 * 60 * 60 };
}

function signature(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSession(input: Omit<ApiSession, "expiresAt">): string {
  const { lifetimeSeconds } = sessionConfiguration();
  const payload = Buffer.from(JSON.stringify({ ...input, expiresAt: Date.now() + lifetimeSeconds * 1000 })).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function readSession(value: string | undefined): ApiSession | null {
  if (!value) return null;
  const [payload, supplied] = value.split(".");
  if (!payload || !supplied) return null;
  const expected = signature(payload);
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  if (expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ApiSession;
    if (!session.keyId || !session.label || !["admin", "operator"].includes(session.role) || !Number.isFinite(session.expiresAt) || session.expiresAt <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function shouldRefreshSession(session: ApiSession): boolean {
  const { refreshSeconds } = sessionConfiguration();
  return session.expiresAt - Date.now() <= refreshSeconds * 1000;
}

export function sessionCookie() {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionConfiguration().lifetimeSeconds,
  };
}
