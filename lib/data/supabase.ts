/** Minimal PostgREST client used by both the Next.js server and sync scripts.
 * Keeping this dependency-free makes the worker usable with Node's built-in
 * fetch and prevents a client-side service key from ever being bundled. */
export interface SupabaseConfig {
  url: string;
  key: string;
}

function configValue(...names: string[]): string | undefined {
  return names.map((name) => process.env[name]?.trim()).find(Boolean);
}

export function readSupabaseConfig(): SupabaseConfig {
  // Public page reads use the browser-safe URL/key pair exclusively. This
  // prevents an obsolete publishing URL in a server environment from routing
  // public reads to a different Supabase project.
  const url = configValue("NEXT_PUBLIC_SUPABASE_URL");
  // Public reads must never accidentally use the service key merely because a
  // Vercel Function also has it in its environment. Writes use the separate
  // publisher configuration below.
  const key = configValue("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!url || !key) {
    throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY for reads, and SUPABASE_SECRET_KEY for publishing.");
  }
  return { url: url.replace(/\/$/, ""), key };
}

export function readSupabasePublisherConfig(): SupabaseConfig {
  const url = configValue("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
  const key = configValue("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase publishing requires SUPABASE_URL and SUPABASE_SECRET_KEY.");
  return { url: url.replace(/\/$/, ""), key };
}

export class SupabaseRest {
  private readonly config: SupabaseConfig;

  constructor(config: SupabaseConfig) {
    this.config = config;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.config.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: this.config.key,
        // Modern sb_publishable_/sb_secret_ API keys are not JWTs. Supplying
        // one as a Bearer token asks downstream services to parse it as JWT;
        // apikey is the portable, documented header for both modern and
        // legacy Supabase API keys.
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      cache: "no-store",
    });
    const body = await response.text();
    if (!response.ok) throw new Error(`Supabase ${init.method ?? "GET"} ${path} failed (${response.status}): ${body}`);
    // PostgREST returns an empty 201/200 body when Prefer: return=minimal is
    // used; it is not limited to HTTP 204.
    if (!body) return undefined as T;
    return JSON.parse(body) as T;
  }

  select<T>(table: string, query: Record<string, string> = {}): Promise<T[]> {
    return this.request<T[]>(`${table}?${new URLSearchParams({ select: "*", ...query })}`);
  }

  async upsert(table: string, rows: unknown[]): Promise<void> {
    await this.upsertWithConflict(table, table === "buding_git_commits" ? "tree,commit" : table === "buding_lore_messages" ? "message_id" : "id", rows);
  }

  async upsertWithConflict(table: string, conflict: string, rows: unknown[]): Promise<void> {
    if (!rows.length) return;
    await this.request<void>(`${table}?on_conflict=${encodeURIComponent(conflict)}`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows),
    });
  }

  async updateWhere(table: string, query: Record<string, string>, value: unknown): Promise<void> {
    await this.request<void>(`${table}?${new URLSearchParams(query)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(value),
    });
  }

  async upsertState(key: string, data: unknown): Promise<void> {
    await this.request<void>("buding_state?on_conflict=key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify([{ key, data }]),
    });
  }

  async removeWhere(table: string, query: Record<string, string>): Promise<void> {
    await this.request<void>(`${table}?${new URLSearchParams(query)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
  }
}
