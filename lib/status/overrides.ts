import type { ManualStatusOverride, PatchsetDetail, PatchsetSummary } from "../data/schema";
import { readSupabaseConfig, SupabaseRest } from "../data/supabase.ts";
import { deriveStatus, isManualPatchsetStatus } from "./policy.ts";

interface OverrideRow {
  patchset_id: string;
  status: string;
  reason: string | null;
  actor_label: string;
  set_at: string;
}

let database: SupabaseRest | undefined;

function store(): SupabaseRest {
  database ??= new SupabaseRest(readSupabaseConfig());
  return database;
}

export async function manualStatusOverrides(): Promise<Map<string, ManualStatusOverride>> {
  return store().select<OverrideRow>("buding_patchset_status_overrides").then((rows) => new Map(rows.flatMap((row) => (
    isManualPatchsetStatus(row.status) ? [[row.patchset_id, {
      status: row.status,
      ...(row.reason ? { reason: row.reason } : {}),
      actor: row.actor_label,
      setAt: row.set_at,
    } satisfies ManualStatusOverride] as const] : []
  ))))
    // Deploying application code before the migration should not make public
    // read pages unavailable. Writes remain blocked until it is applied.
    .catch(() => new Map());
}

export function withManualStatus<T extends PatchsetSummary | PatchsetDetail>(patchset: T, overrides: Map<string, ManualStatusOverride>): T {
  const automaticStatus = deriveStatus(patchset.trees, patchset.latestRevision);
  const manualStatus = overrides.get(patchset.id);
  // Keep automatic derivation as the default, while allowing an authenticated
  // maintainer to override it with any supported status.
  return manualStatus
    ? { ...patchset, status: manualStatus.status, manualStatus }
    : { ...patchset, status: automaticStatus };
}
