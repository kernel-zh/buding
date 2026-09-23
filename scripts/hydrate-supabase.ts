import path from "node:path";
import { TRACKED_TREES } from "../lib/git/config.ts";
import { writeGeneratedData, writeJsonAtomic } from "../lib/data/generate.ts";
import type { PatchsetDetail, PatchsetSummary, SyncMetadata } from "../lib/data/schema.ts";
import { readSupabasePublisherConfig, SupabaseRest } from "../lib/data/supabase.ts";

interface StateRow { key: string; data: unknown }
interface PatchsetRow { id: string; summary: PatchsetSummary; detail: PatchsetDetail }
interface LoreRow { message_id: string; data: unknown }
interface GitCommitRow { tree: string; commit: string; data: unknown }

const root = process.cwd();
const database = new SupabaseRest(readSupabasePublisherConfig());
const pageSize = 1_000;

async function allRows<T>(table: string, query: Record<string, string> = {}): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await database.select<T>(table, { ...query, limit: String(pageSize), offset: String(offset) });
    result.push(...page);
    if (page.length < pageSize) return result;
  }
}

const states = new Map((await allRows<StateRow>("buding_state")).map((row) => [row.key, row.data]));
const metadata = states.get("metadata");
const syncState = states.get("sync-state");
const loreState = states.get("lore-state");
const gitState = states.get("git-state");

// A new project has no published snapshot yet. Leave the repository seed in
// place so the first synchronization can publish it normally.
if (!metadata || !syncState || !loreState || !gitState) {
  console.log("No complete Supabase snapshot found; using the checked-in seed data.");
  process.exit(0);
}

const [patchsets, messages, commits] = await Promise.all([
  allRows<PatchsetRow>("buding_patchsets", { order: "id.asc" }),
  allRows<LoreRow>("buding_lore_messages", { order: "message_id.asc" }),
  allRows<GitCommitRow>("buding_git_commits", { order: "tree.asc,commit.asc" }),
]);
const activeIds = states.get("patchset-ids");
const activeIdSet = new Set(Array.isArray(activeIds) ? activeIds.filter((id): id is string => typeof id === "string") : []);
const activePatchsets = patchsets.filter((patchset) => activeIdSet.has(patchset.id));

await writeGeneratedData(
  root,
  activePatchsets.map((patchset) => patchset.detail),
  metadata as SyncMetadata,
);
await Promise.all([
  writeJsonAtomic(path.join(root, "data", "internal", "lore-messages.json"), { messages: messages.map((message) => message.data) }),
  writeJsonAtomic(path.join(root, "data", "internal", "lore-state.json"), loreState),
  writeJsonAtomic(path.join(root, "data", "internal", "git-state.json"), gitState),
  writeJsonAtomic(path.join(root, "data", "internal", "sync-state.json"), syncState),
  ...TRACKED_TREES.map((tree) => writeJsonAtomic(
    path.join(root, "data", "indexes", `${tree.id}.json`),
    commits.filter((commit) => commit.tree === tree.id).map((commit) => commit.data),
  )),
]);

console.log(`Hydrated ${activePatchsets.length} patchsets, ${messages.length} lore messages, and Git indexes from Supabase.`);
