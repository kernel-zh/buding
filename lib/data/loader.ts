import type { LoreMessage } from "../lore/types";
import { validateLoreMessages } from "../lore/sync";
import { messageRouteId } from "../messages/routing";
import type { PatchDetail, PatchsetDetail, PatchsetSummary, SyncMetadata, SyncRunState } from "./schema";
import { validatePatchsetDetail, validatePatchsetSummaries, validateSyncMetadata, validateSyncRunState } from "./validation";
import { readSupabaseConfig, SupabaseRest } from "./supabase";
import { manualStatusOverrides, withManualStatus } from "../status/overrides";

export interface PatchMessagePageData {
  message: LoreMessage;
  patch: PatchDetail;
  patchset: PatchsetDetail;
  previous?: PatchDetail;
  next?: PatchDetail;
}

interface PatchsetRow { id: string; summary: unknown; detail?: unknown }
interface StateRow { key: string; data: unknown }
interface LoreRow { message_id: string; data: unknown }

let database: SupabaseRest | undefined;

function store(): SupabaseRest {
  database ??= new SupabaseRest(readSupabaseConfig());
  return database;
}

async function optionalState(key: string): Promise<unknown | undefined> {
  const rows = await store().select<StateRow>("buding_state", { key: `eq.${key}` });
  return rows[0]?.data;
}

async function state(key: string): Promise<unknown> {
  const value = await optionalState(key);
  if (value === undefined) throw new Error(`Supabase state ${key} is missing. Run the synchronization workflow once after applying the migration.`);
  return value;
}

function activePatchsetIds(value: unknown | undefined): Set<string> | undefined {
  if (value === undefined) return undefined;
  return new Set(Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : []);
}

function newestFirst<T extends { postedAt: string; id: string }>(items: T[]): T[] {
  return items.toSorted((left, right) => Date.parse(right.postedAt) - Date.parse(left.postedAt) || left.id.localeCompare(right.id));
}

export async function getPatchsets(): Promise<PatchsetSummary[]> {
  return Promise.all([
    store().select<PatchsetRow>("buding_patchsets"),
    optionalState("patchset-ids"),
    manualStatusOverrides(),
  ]).then(([rows, ids, overrides]) => {
    const activeIds = activePatchsetIds(ids);
    return newestFirst(validatePatchsetSummaries(rows.filter((row) => !activeIds || activeIds.has(row.id)).map((row) => row.summary)).map((patchset) => withManualStatus(patchset, overrides)));
  });
}

export async function getMetadata(): Promise<SyncMetadata> {
  return validateSyncMetadata(await state("metadata"));
}

export async function getSyncRunState(): Promise<SyncRunState> {
  return validateSyncRunState(await state("sync-state"));
}

export async function getPatchset(id: string): Promise<PatchsetDetail | null> {
  if (!/^[a-z0-9-]+$/.test(id)) return null;
  const activeIds = activePatchsetIds(await optionalState("patchset-ids"));
  if (activeIds && !activeIds.has(id)) return null;
  const rows = await store().select<PatchsetRow>("buding_patchsets", { id: `eq.${id}` });
  if (!rows[0]?.detail) return null;
  return withManualStatus(validatePatchsetDetail(rows[0].detail, `buding_patchsets/${id}`), await manualStatusOverrides());
}

export async function getPatchsetDetails(): Promise<PatchsetDetail[]> {
  const [rows, ids, overrides] = await Promise.all([
    store().select<PatchsetRow>("buding_patchsets"),
    optionalState("patchset-ids"),
    manualStatusOverrides(),
  ]);
  const activeIds = activePatchsetIds(ids);
  return newestFirst(rows
    .filter((row) => !activeIds || activeIds.has(row.id))
    .map((row) => withManualStatus(validatePatchsetDetail(row.detail, `buding_patchsets/${row.id}`), overrides)));
}

async function getLoreMessage(messageId: string): Promise<LoreMessage | null> {
  const rows = await store().select<LoreRow>("buding_lore_messages", { message_id: `eq.${messageId}` });
  if (!rows[0]) return null;
  return validateLoreMessages([rows[0].data])[0];
}

export async function getPatchMessageRouteIds(): Promise<string[]> {
  const patchsets = await getPatchsetDetails();
  return patchsets.flatMap((patchset) => patchset.patches.map((patch) => messageRouteId(patch.messageId)));
}

export async function getPatchMessage(routeId: string): Promise<PatchMessagePageData | null> {
  const patchsets = await getPatchsetDetails();
  for (const patchset of patchsets) {
    const patchIndex = patchset.patches.findIndex((patch) => messageRouteId(patch.messageId) === routeId);
    if (patchIndex < 0) continue;
    const patch = patchset.patches[patchIndex];
    const message = await getLoreMessage(patch.messageId);
    if (!message) throw new Error(`Missing lore message ${patch.messageId} in Supabase`);
    return {
      message,
      patch,
      patchset,
      ...(patchset.patches[patchIndex - 1] ? { previous: patchset.patches[patchIndex - 1] } : {}),
      ...(patchset.patches[patchIndex + 1] ? { next: patchset.patches[patchIndex + 1] } : {}),
    };
  }
  return null;
}
