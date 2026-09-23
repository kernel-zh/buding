import { readFile } from "node:fs/promises";
import path from "node:path";
import { TRACKED_TREES } from "../lib/git/config.ts";
import { validateGitCommitIndex, validatePatchsetDetail, validatePatchsetSummaries, validateSyncMetadata, validateSyncRunState } from "../lib/data/validation.ts";
import { validateLoreMessages } from "../lib/lore/sync.ts";
import { readSupabasePublisherConfig, SupabaseRest } from "../lib/data/supabase.ts";

const root = process.cwd();
const database = new SupabaseRest(readSupabasePublisherConfig());
const batchSize = 100;
interface StateRow { data: unknown }

async function json(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

async function inBatches<T>(items: T[], operation: (batch: T[]) => Promise<void>): Promise<void> {
  for (let offset = 0; offset < items.length; offset += batchSize) await operation(items.slice(offset, offset + batchSize));
}

const summaries = validatePatchsetSummaries(await json(path.join(root, "data", "patchsets.json")));
const details = await Promise.all(summaries.map(async (summary) => validatePatchsetDetail(
  await json(path.join(root, "data", "patchsets", `${summary.id}.json`)), summary.id,
)));
const messages = validateLoreMessages((await json(path.join(root, "data", "internal", "lore-messages.json")) as { messages?: unknown }).messages);
const metadata = validateSyncMetadata(await json(path.join(root, "data", "metadata.json")));
const syncState = validateSyncRunState(await json(path.join(root, "data", "internal", "sync-state.json")));
const loreState = await json(path.join(root, "data", "internal", "lore-state.json"));
const gitState = await json(path.join(root, "data", "internal", "git-state.json"));
const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));
const previousPatchsetIds = await database.select<StateRow>("buding_state", { key: "eq.patchset-ids" })
  .then((rows) => Array.isArray(rows[0]?.data) ? rows[0].data.filter((id): id is string => typeof id === "string") : []);

await inBatches(details, (batch) => database.upsert("buding_patchsets", batch.map((detail) => ({
  id: detail.id,
  summary: summaryById.get(detail.id),
  detail,
  updated_at: new Date().toISOString(),
}))));
await inBatches(messages, (batch) => database.upsert("buding_lore_messages", batch.map((message) => ({
  message_id: message.messageId,
  data: message,
  updated_at: new Date().toISOString(),
}))));
for (const tree of TRACKED_TREES) {
  const commits = validateGitCommitIndex(await json(path.join(root, "data", "indexes", `${tree.id}.json`)), tree.id);
  await inBatches(commits, (batch) => database.upsert("buding_git_commits", batch.map((commit) => ({
    tree: tree.id,
    commit: commit.commit,
    data: commit,
    updated_at: new Date().toISOString(),
  }))));
}
// Publish the active-set marker first. Readers use it as the atomic switch to
// the freshly uploaded patchset set; it also makes a partially failed upload
// continue serving the prior data rather than returning an empty dashboard.
await database.upsertState("patchset-ids", details.map((detail) => detail.id));
await Promise.all([
  database.upsertState("metadata", metadata),
  database.upsertState("sync-state", syncState),
  database.upsertState("lore-state", loreState),
  database.upsertState("git-state", gitState),
  database.upsertState("published-at", { value: new Date().toISOString() }),
]);
await Promise.all(previousPatchsetIds
  .filter((id) => !summaryById.has(id))
  .map((id) => database.removeWhere("buding_patchsets", { id: `eq.${id}` })));

console.log(`Published ${details.length} patchsets, ${messages.length} lore messages, and Git indexes to Supabase.`);
