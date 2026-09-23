import { cookies, headers } from "next/headers";
import { notFound } from "next/navigation";
import { ApiKeyManager } from "@/components/api-key-manager";
import { isRootAdminKey } from "@/lib/auth/api-key";
import { API_SESSION_COOKIE, readSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if ((await headers()).get("x-buding-admin-path") !== "1") notFound();
  const session = readSession((await cookies()).get(API_SESSION_COOKIE)?.value);
  if (!session || !isRootAdminKey(session.keyId)) {
    return <section className="shell content-section"><div className="auth-error"><h1>401 Unauthorized</h1><p>This page requires the administrator root API Key. Enter it through the global API Key menu, then reload this page.</p></div></section>;
  }
  return <section className="shell content-section"><div className="page-heading"><div><h1>API Key administration</h1><p>Requires the administrator root key entered through the global API Key menu.</p></div></div><ApiKeyManager /></section>;
}
