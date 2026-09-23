import type { Language, PatchsetDetail, PatchsetReviewState, TreeId, TreeSummary } from "../data/schema.ts";

const REVIEW_TRAILERS = new Set(["Reviewed-by", "Acked-by"]);

export interface ReviewQueueItem {
  id: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  postedAt: string;
  revision: number;
  language: Language;
  patchCount: number;
  reviewState: PatchsetReviewState;
  reviewReplies: number;
  reviewedPatches: number;
  openMessageId: string;
  trees: Record<TreeId, TreeSummary>;
}

export function buildReviewQueue(patchsets: PatchsetDetail[]): ReviewQueueItem[] {
  return patchsets
    .filter((patchset) => (
      patchset.latestRevision
      && patchset.lifecycle === "active"
      && patchset.trees.alex.state !== "confirmed"
      && patchset.trees.corbet.state !== "confirmed"
      && patchset.trees.linus.state !== "confirmed"
    ))
    .map((patchset) => {
      const reviewedPatches = patchset.patches.filter((patch) => (
        patch.trailers?.some((trailer) => REVIEW_TRAILERS.has(trailer.type))
      ));
      const reviewedIds = new Set(reviewedPatches.map((patch) => patch.messageId));
      const openPatch = patchset.patches.find((patch) => !reviewedIds.has(patch.messageId)) ?? patchset.patches[0];
      return {
        id: patchset.id,
        subject: patchset.subject,
        authorName: patchset.authorName,
        authorEmail: patchset.authorEmail,
        postedAt: patchset.postedAt,
        revision: patchset.revision,
        language: patchset.language,
        patchCount: patchset.patchCount,
        reviewState: patchset.reviewState,
        reviewReplies: patchset.reviewReplies,
        reviewedPatches: reviewedPatches.length,
        openMessageId: openPatch.messageId,
        trees: patchset.trees,
      };
    })
    .toSorted((left, right) => Date.parse(right.postedAt) - Date.parse(left.postedAt));
}
