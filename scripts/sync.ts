import { readFile } from "node:fs/promises";
import path from "node:path";
import { generateFromLoreCache } from "../lib/data/pipeline.ts";
import { writeJsonAtomic } from "../lib/data/generate.ts";
import type { SyncRunState } from "../lib/data/schema.ts";
import { validateSyncRunState } from "../lib/data/validation.ts";
import { validateGeneratedData } from "../lib/data/validate-generated.ts";
import { synchronizeGit } from "../lib/git/sync.ts";
import { LeiLoreSource } from "../lib/lore/lei-source.ts";
import { synchronizeLore } from "../lib/lore/sync.ts";

const root = process.cwd();
const requestedSince = process.env.SYNC_SINCE?.trim();
const initialSince = requestedSince || process.env.INITIAL_SYNC_SINCE?.trim() || "2025-01-01T00:00:00Z";
const stateFile = path.join(root, "data", "internal", "sync-state.json");
const attemptedAt = new Date().toISOString();
let stage = "lore";

async function previousState(): Promise<SyncRunState | undefined> {
  try {
    return validateSyncRunState(JSON.parse(await readFile(stateFile, "utf8")) as unknown);
  } catch {
    return undefined;
  }
}

const previous = await previousState();

try {
  const lore = await synchronizeLore({
    root,
    source: new LeiLoreSource(),
    initialSince,
    forceInitialSince: Boolean(requestedSince),
    writePublicData: false,
  });
  console.log(`Lore: ${lore.newMessages} new messages, ${lore.patchIdsComputed} new patch IDs, ${lore.series} series.`);

  stage = "git";
  const git = await synchronizeGit({
    root,
    initialSince: process.env.GIT_SYNC_SINCE?.trim() || initialSince,
    forceRescan: Boolean(requestedSince)
      || process.env.GIT_FORCE_RESCAN === "true"
      || process.env.GIT_FORCE_RESCAN === "1",
  });
  for (const tree of git.trees) {
    console.log(`Git ${tree.tree}: ${tree.mode}, ${tree.scannedCommits} scanned, ${tree.indexedCommits} indexed.`);
  }

  stage = "reconciliation";
  const generated = await generateFromLoreCache(root);
  console.log(`Reconciliation: ${generated.confirmed} confirmed, ${generated.candidates} candidate, ${generated.previouslyPresent} previously present, ${generated.manualOverrides} match overrides, ${generated.stateOverrides} state overrides, ${generated.ignoredPatches} ignored, ${generated.expiredMainlineFamilies} expired mainline families removed.`);

  stage = "validation";
  const validated = await validateGeneratedData(root);
  const completedAt = new Date().toISOString();
  await writeJsonAtomic(stateFile, {
    status: "ok",
    attemptedAt,
    lastSuccessfulSync: completedAt,
  } satisfies SyncRunState);
  console.log(`Sync complete: ${validated.summaries} series, ${validated.indexedCommits} indexed commits, generated data valid.`);
} catch (error) {
  await writeJsonAtomic(stateFile, {
    status: "error",
    attemptedAt,
    ...(previous?.lastSuccessfulSync ? { lastSuccessfulSync: previous.lastSuccessfulSync } : {}),
    source: stage,
    error: error instanceof Error ? error.message : String(error),
  } satisfies SyncRunState);
  throw error;
}
