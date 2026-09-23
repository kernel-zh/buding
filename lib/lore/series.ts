import { createHash } from "node:crypto";
import type { Language, PatchsetDetail, PatchsetReviewState, PatchsetStatus, TreeId, TreeSummary } from "../data/schema";
import { classifyLanguage, extractChangedFiles, extractReviewTrailers } from "./parser.ts";
import { normalizeSeriesSubject, parsePatchSubject } from "./subject.ts";
import { reconstructThreads } from "./thread.ts";
import type { FixtureTreeMatch, LoreDataset, LoreMessage } from "./types";
import { lifecycleFromMail } from "./status.ts";
import { deriveStatus } from "../status/policy.ts";

const TREE_IDS: TreeId[] = ["alex", "corbet", "linus"];

function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/^docs(?:\/zh_(?:cn|tw))?\s*:\s*/i, "")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 52) || "patch-series";
}

function emptyTree(total = 1): TreeSummary {
  return { state: "missing", matched: 0, total };
}

function patchTree(match?: FixtureTreeMatch): TreeSummary {
  if (!match) return emptyTree();
  return {
    state: match.state,
    matched: match.state === "confirmed" ? 1 : 0,
    total: 1,
    ...(match.commit ? { commit: match.commit } : {}),
  };
}

export function aggregateTree(trees: TreeSummary[]): TreeSummary {
  const total = trees.length;
  const matched = trees.reduce((sum, tree) => sum + tree.matched, 0);
  const commit = trees.find((tree) => tree.commit)?.commit;
  let state: TreeSummary["state"] = "missing";
  if (matched === total && total > 0) state = "confirmed";
  else if (matched > 0) state = "partial";
  else if (trees.some((tree) => tree.state === "candidate")) state = "candidate";
  else if (trees.some((tree) => tree.state === "previously-present")) state = "previously-present";
  return { state, matched, total, ...(commit ? { commit } : {}) };
}

function seriesLanguage(languages: Language[]): Language {
  const unique = new Set(languages);
  return unique.size > 1 || unique.has("mixed") ? "mixed" : languages[0];
}

function familyKey(message: LoreMessage, baseSubject: string): string {
  return `${message.from.email.toLocaleLowerCase()}\0${normalizeSeriesSubject(baseSubject)}`;
}

function reviewTrailersFor(message: LoreMessage, threadMessages: LoreMessage[]) {
  const trailers = extractReviewTrailers(threadMessages.filter((candidate) => (
    candidate.messageId === message.messageId
    || candidate.inReplyTo === message.messageId
    || candidate.references.includes(message.messageId)
  )));
  return trailers.length ? { trailers } : {};
}

export function buildPatchsets(dataset: LoreDataset): PatchsetDetail[] {
  const drafts = reconstructThreads(dataset.messages).flatMap((thread) => {
    const mailPatches = thread.messages
      .map((message) => ({ message, parsed: parsePatchSubject(message.subject), files: extractChangedFiles(message.body) }))
      .filter(({ parsed }) => parsed.isPatch && !parsed.isReply);
    if (!mailPatches.length) return [];

    const cover = mailPatches.find(({ parsed }) => parsed.index === 0);
    const actualPatches = mailPatches.filter(({ parsed }) => parsed.index !== 0);
    const relevantPatches = actualPatches.filter(({ parsed, files }) => classifyLanguage(files, parsed.baseSubject));
    if (!relevantPatches.length) return [];

    const anchor = cover ?? mailPatches[0];
    const revision = anchor.parsed.revision;
    const family = familyKey(anchor.message, anchor.parsed.baseSubject);
    const digest = createHash("sha256")
      .update(`${family}\0${thread.rootMessageId}`)
      .digest("hex")
      .slice(0, 12);
    const id = `${slugify(anchor.parsed.baseSubject)}-${digest}-v${revision}`;
    const languages = relevantPatches.map(({ parsed, files }) => classifyLanguage(files, parsed.baseSubject) as Language);
    const patchCount = relevantPatches.length;
    const patchDetails = relevantPatches
      .sort((a, b) => (a.parsed.index ?? 1) - (b.parsed.index ?? 1))
      .map(({ message, parsed, files }, position) => ({
        index: parsed.index && parsed.index > 0 ? parsed.index : position + 1,
        total: parsed.total ?? patchCount,
        subject: parsed.baseSubject,
        messageId: message.messageId,
        loreUrl: message.loreUrl,
        changedFiles: files,
        ...(message.patchId ? { patchId: message.patchId } : {}),
        ...reviewTrailersFor(message, thread.messages),
        trees: Object.fromEntries(TREE_IDS.map((tree) => [tree, patchTree(dataset.matches?.[message.messageId]?.[tree])])) as Record<TreeId, TreeSummary>,
      }));
    const trees = Object.fromEntries(TREE_IDS.map((tree) => [tree, aggregateTree(patchDetails.map((patch) => patch.trees[tree]))])) as Record<TreeId, TreeSummary>;
    const replyMessages = thread.messages.filter((message) => parsePatchSubject(message.subject).isReply);
    const replies = replyMessages.length;
    const reviewReplies = replyMessages.filter((message) => (
      message.from.email.toLocaleLowerCase() !== anchor.message.from.email.toLocaleLowerCase()
    )).length;
    const reviewState: PatchsetReviewState = reviewReplies > 0 ? "discussion" : "waiting";
    const lifecycle = lifecycleFromMail(
      thread.messages,
      anchor.message.from.email,
      new Set(mailPatches.map(({ message }) => message.messageId)),
    );

    return [{
      id,
      family,
      subject: anchor.message.subject,
      authorName: anchor.message.from.name,
      authorEmail: anchor.message.from.email,
      revision,
      postedAt: anchor.message.date,
      language: seriesLanguage(languages),
      patchCount,
      status: "proposed" as PatchsetStatus,
      lifecycle: lifecycle.lifecycle,
      reviewState,
      reviewReplies,
      latestRevision: true,
      messageIds: mailPatches.map(({ message }) => message.messageId),
      trees,
      rfc: anchor.parsed.rfc,
      loreUrl: anchor.message.loreUrl,
      rawUrl: anchor.message.rawUrl,
      replies,
      ...(lifecycle.event ? { lifecycleEvent: lifecycle.event } : {}),
      versions: [],
      patches: patchDetails,
    }];
  });

  const byFamily = Map.groupBy(drafts, (draft) => draft.family);
  return drafts
    .map(({ family, ...draft }) => {
      const relatives = byFamily.get(family) ?? [];
      const latest = relatives.toSorted((a, b) =>
        b.revision - a.revision
        || Date.parse(b.postedAt) - Date.parse(a.postedAt)
        || b.id.localeCompare(a.id)
      )[0];
      const isLatest = draft.id === latest.id;
      return {
        ...draft,
        latestRevision: isLatest,
        status: deriveStatus(draft.trees, isLatest),
        versions: relatives
          .toSorted((a, b) => a.revision - b.revision || Date.parse(a.postedAt) - Date.parse(b.postedAt))
          .map((relative) => ({ revision: relative.revision, id: relative.id, current: relative.id === draft.id })),
      } satisfies PatchsetDetail;
    })
    .sort((a, b) => Date.parse(b.postedAt) - Date.parse(a.postedAt));
}

export const buildFixturePatchsets = buildPatchsets;
