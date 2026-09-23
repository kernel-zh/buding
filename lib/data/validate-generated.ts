import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { TRACKED_TREES } from "../git/config.ts";
import {
  validateGitCommitIndex,
  validatePatchsetDetail,
  validatePatchsetSummaries,
  validateSyncMetadata,
  validateSyncRunState,
} from "./validation.ts";

async function json(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, "utf8")) as unknown;
}

export interface GeneratedDataValidationReport {
  summaries: number;
  details: number;
  indexedCommits: number;
}

export async function validateGeneratedData(root: string): Promise<GeneratedDataValidationReport> {
  const summaries = validatePatchsetSummaries(await json(path.join(root, "data", "patchsets.json")));
  validateSyncMetadata(await json(path.join(root, "data", "metadata.json")));
  validateSyncRunState(await json(path.join(root, "data", "internal", "sync-state.json")));
  const files = (await readdir(path.join(root, "data", "patchsets"))).filter((file) => file.endsWith(".json"));
  const details = await Promise.all(files.map(async (file) => validatePatchsetDetail(
    await json(path.join(root, "data", "patchsets", file)),
    file,
  )));
  const detailIds = new Set(details.map((detail) => detail.id));
  const summaryIds = new Set(summaries.map((summary) => summary.id));
  const detailsById = new Map(details.map((detail) => [detail.id, detail]));
  for (const summary of summaries) {
    if (!detailIds.has(summary.id)) throw new Error(`Missing detail file for ${summary.id}`);
    const detail = detailsById.get(summary.id)!;
    const expectedSummary = {
      id: detail.id,
      subject: detail.subject,
      authorName: detail.authorName,
      authorEmail: detail.authorEmail,
      revision: detail.revision,
      postedAt: detail.postedAt,
      language: detail.language,
      patchCount: detail.patchCount,
      status: detail.status,
      lifecycle: detail.lifecycle,
      reviewState: detail.reviewState,
      reviewReplies: detail.reviewReplies,
      latestRevision: detail.latestRevision,
      messageIds: detail.messageIds,
      trees: detail.trees,
    };
    if (JSON.stringify(summary) !== JSON.stringify(expectedSummary)) throw new Error(`Summary and detail differ for ${summary.id}`);
  }
  for (const detail of details) {
    if (!summaryIds.has(detail.id)) throw new Error(`Orphan detail file for ${detail.id}`);
    for (const version of detail.versions) {
      if (!detailIds.has(version.id)) throw new Error(`Missing version ${version.id} referenced by ${detail.id}`);
    }
  }
  let indexedCommits = 0;
  for (const tree of TRACKED_TREES) {
    const commits = validateGitCommitIndex(await json(path.join(root, "data", "indexes", `${tree.id}.json`)), tree.id);
    indexedCommits += commits.length;
  }
  return { summaries: summaries.length, details: details.length, indexedCommits };
}
