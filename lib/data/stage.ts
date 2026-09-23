import type { PatchsetSummary } from "./schema.ts";

export type UpstreamStage = "lore" | "alex" | "corbet" | "linus";

export function furthestConfirmedStage(patchset: PatchsetSummary): UpstreamStage {
  if (patchset.trees.linus.matched > 0) return "linus";
  if (patchset.trees.corbet.matched > 0) return "corbet";
  if (patchset.trees.alex.matched > 0) return "alex";
  return "lore";
}
