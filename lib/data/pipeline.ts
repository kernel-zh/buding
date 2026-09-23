import { readFile } from "node:fs/promises";
import path from "node:path";
import { buildPatchsets } from "../lore/series.ts";
import { validateLoreMessages } from "../lore/sync.ts";
import { reconcileGeneratedData } from "../matching/generated.ts";
import type { ReconciliationReport } from "../matching/reconcile.ts";

export async function generateFromLoreCache(root: string): Promise<ReconciliationReport> {
  const file = path.join(root, "data", "internal", "lore-messages.json");
  const cache = JSON.parse(await readFile(file, "utf8")) as { messages?: unknown };
  const messages = validateLoreMessages(cache.messages);
  return reconcileGeneratedData(root, buildPatchsets({ messages }));
}
