import type { ManualPatchsetStatus, PatchsetStatus, TreeId, TreeSummary } from "../data/schema.ts";

const TREE_IDS: TreeId[] = ["alex", "corbet", "linus"];

export const MANUAL_PATCHSET_STATUSES: readonly ManualPatchsetStatus[] = [
  "proposed",
  "needs-revision",
  "superseded",
  "approved",
  "rejected",
  "applied",
];

const MANUAL_STATUS_SET = new Set<string>(MANUAL_PATCHSET_STATUSES);

export function isManualPatchsetStatus(value: unknown): value is ManualPatchsetStatus {
  return typeof value === "string" && MANUAL_STATUS_SET.has(value);
}

export function deriveStatus(
  trees: Record<TreeId, TreeSummary>,
  latestRevision: boolean,
): PatchsetStatus {
  if (!latestRevision) return "superseded";
  if (TREE_IDS.some((id) => trees[id].state === "confirmed")) return "applied";
  return "proposed";
}
