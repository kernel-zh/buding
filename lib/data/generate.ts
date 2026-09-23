import { randomUUID } from "node:crypto";
import { mkdir, readdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PatchsetDetail, PatchsetSummary, SyncMetadata } from "./schema";
import { validatePatchsetDetail, validatePatchsetSummaries, validateSyncMetadata } from "./validation.ts";

function summaryFromDetail(detail: PatchsetDetail): PatchsetSummary {
  return {
    id: detail.id,
    subject: detail.subject,
    authorName: detail.authorName,
    authorEmail: detail.authorEmail,
    revision: detail.revision,
    postedAt: detail.postedAt,
    language: detail.language,
    patchCount: detail.patchCount,
    status: detail.status,
    ...(detail.manualStatus ? { manualStatus: detail.manualStatus } : {}),
    lifecycle: detail.lifecycle,
    reviewState: detail.reviewState,
    reviewReplies: detail.reviewReplies,
    latestRevision: detail.latestRevision,
    messageIds: detail.messageIds,
    trees: detail.trees,
  };
}

export async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, file);
}

export async function writeGeneratedData(
  root: string,
  rawDetails: PatchsetDetail[],
  rawMetadata: SyncMetadata,
): Promise<{ details: PatchsetDetail[]; summaries: PatchsetSummary[]; staleFilesRemoved: number }> {
  const details = rawDetails.map((detail, index) => validatePatchsetDetail(detail, `generated[${index}]`));
  const summaries = validatePatchsetSummaries(details.map(summaryFromDetail));
  const metadata = validateSyncMetadata(rawMetadata);
  const detailDirectory = path.join(root, "data", "patchsets");
  await mkdir(detailDirectory, { recursive: true });

  await Promise.all(details.map((detail) => writeJsonAtomic(
    path.join(detailDirectory, `${detail.id}.json`),
    detail,
  )));
  await writeJsonAtomic(path.join(root, "data", "patchsets.json"), summaries);
  await writeJsonAtomic(path.join(root, "data", "metadata.json"), metadata);

  const generatedFiles = new Set(details.map((detail) => `${detail.id}.json`));
  const staleFiles = (await readdir(detailDirectory))
    .filter((file) => file.endsWith(".json") && !generatedFiles.has(file));
  await Promise.all(staleFiles.map((file) => unlink(path.join(detailDirectory, file))));

  return { details, summaries, staleFilesRemoved: staleFiles.length };
}
