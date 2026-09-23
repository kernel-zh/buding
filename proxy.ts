import { NextResponse, type NextRequest } from "next/server";

function configuredAdminPath(): string | undefined {
  const value = process.env.BUDING_ADMIN_PATH?.trim();
  if (!value) return undefined;
  if (!/^\/[A-Za-z0-9_-]+$/.test(value) || value === "/admin") throw new Error("BUDING_ADMIN_PATH must be a non-default, single path segment beginning with '/'.");
  return value;
}

export function proxy(request: NextRequest) {
  const adminPath = configuredAdminPath();
  if (adminPath && request.nextUrl.pathname === adminPath) {
    const headers = new Headers(request.headers);
    headers.set("x-buding-admin-path", "1");
    return NextResponse.rewrite(new URL("/admin", request.url), { request: { headers } });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/:path*"] };
