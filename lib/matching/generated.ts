import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeGeneratedData } from "../data/generate.ts";
import type { GitCommit, PatchsetDetail, TreeId } from "../data/schema.ts";
import {
  validateGitCommitIndex,
  validatePatchsetDetail,
  validatePatchsetSummaries,
  validateSyncMetadata,
} from "../data/validation.ts";
import { TRACKED_TREES } from "../git/config.ts";
import { parseOverrides } from "./overrides.ts";
import { reconcilePatchsets, type CommitIndexes, type ReconciliationReport } from "./reconcile.ts";

async function json(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

async function currentDetails(root: string): Promise<PatchsetDetail[]> {
  const summaries = validatePatchsetSummaries(await json(path.join(root, "data", "patchsets.json")));
  return Promise.all(summaries.map(async (summary) => validatePatchsetDetail(
    await json(path.join(root, "data", "patchsets", `${summary.id}.json`)),
    `patchset ${summary.id}`,
  )));
}

export async function reconcileGeneratedData(
  root: string,
  sourceDetails?: PatchsetDetail[],
): Promise<ReconciliationReport> {
  const details = sourceDetails ?? await currentDetails(root);
  const indexes = Object.fromEntries(await Promise.all(TRACKED_TREES.map(async (tree) => [
    tree.id,
    validateGitCommitIndex(await json(path.join(root, "data", "indexes", `${tree.id}.json`)), tree.id),
  ]))) as Record<TreeId, GitCommit[]>;
  const overrides = parseOverrides(await readFile(path.join(root, "data", "overrides.yml"), "utf8"));
  const metadata = validateSyncMetadata(await json(path.join(root, "data", "metadata.json")));
  const report = reconcilePatchsets(details, indexes as CommitIndexes, overrides);
  await writeGeneratedData(root, report.details, metadata);
  return report;
}
