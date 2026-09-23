import type {
  Language,
  GitCommit,
  LifecycleEvent,
  LightState,
  PatchDetail,
  PatchsetDetail,
  PatchsetLifecycle,
  PatchsetReviewState,
  PatchsetStatus,
  PatchsetSummary,
  ReviewTrailer,
  ReviewTrailerType,
  SyncMetadata,
  SyncRunState,
  TreeId,
  TreeSummary,
} from "./schema";
import { deriveStatus } from "../status/policy.ts";

const LANGUAGES = new Set<Language>(["zh_CN", "zh_TW", "mixed"]);
const LIGHT_STATES = new Set<LightState>(["confirmed", "partial", "candidate", "previously-present", "missing"]);
const STATUSES = new Set<PatchsetStatus>([
  "proposed", "needs-revision", "superseded", "approved", "rejected", "applied",
]);
const LEGACY_STATUSES = new Set([
  "waiting-for-review", "in-review", "updated", "withdrawn", "invalid", "queued-alex", "in-docs-mw", "mainline", "partially-applied", "previously-queued",
]);
const LIFECYCLES = new Set<PatchsetLifecycle>(["active", "withdrawn", "invalid"]);
const REVIEW_STATES = new Set<PatchsetReviewState>(["waiting", "discussion"]);
const TREE_IDS: TreeId[] = ["alex", "corbet", "linus"];
const REVIEW_TRAILER_TYPES = new Set<ReviewTrailerType>(["Reviewed-by", "Acked-by", "Tested-by", "Suggested-by", "Reported-by"]);

function fail(path: string, message: string): never {
  throw new Error(`Invalid generated data at ${path}: ${message}`);
}

function object(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(path, "expected an object");
  return value as Record<string, unknown>;
}

function string(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) fail(path, "expected a non-empty string");
  return value;
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return string(value, path);
}

function integer(value: unknown, path: string, minimum = 0): number {
  if (!Number.isInteger(value) || (value as number) < minimum) fail(path, `expected an integer >= ${minimum}`);
  return value as number;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "expected a boolean");
  return value;
}

function isoDate(value: unknown, path: string): string {
  const result = string(value, path);
  if (Number.isNaN(Date.parse(result))) fail(path, "expected an ISO date");
  return result;
}

function safeMailbox(value: unknown, path: string): string {
  const result = string(value, path);
  if (result.length > 320 || /[\s<>\u0000-\u001f\u007f]/.test(result)) {
    fail(path, "expected a safe mailbox identifier");
  }
  return result;
}

function httpsUrl(value: unknown, path: string): string {
  const result = string(value, path);
  let parsed: URL;
  try {
    parsed = new URL(result);
  } catch {
    fail(path, "expected an absolute URL");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
    fail(path, "expected an HTTPS URL without credentials");
  }
  return result;
}

function safePath(value: unknown, path: string): string {
  const result = string(value, path);
  if (result.startsWith("/") || result.split("/").includes("..") || /[\u0000-\u001f\u007f]/.test(result)) {
    fail(path, "expected a safe repository-relative path");
  }
  return result;
}

function safeBranch(value: unknown, path: string): string {
  const result = string(value, path);
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(result) || result.includes("..") || result.includes("//") || result.includes("@{") || /[./]$/.test(result)) {
    fail(path, "expected a safe Git branch name");
  }
  return result;
}

function stringArray(value: unknown, path: string): string[] {
  if (!Array.isArray(value)) fail(path, "expected an array");
  return value.map((item, index) => string(item, `${path}[${index}]`));
}

function treeSummary(value: unknown, path: string): TreeSummary {
  const item = object(value, path);
  const state = string(item.state, `${path}.state`) as LightState;
  if (!LIGHT_STATES.has(state)) fail(`${path}.state`, `unknown state ${state}`);
  const matched = integer(item.matched, `${path}.matched`);
  const total = integer(item.total, `${path}.total`, 1);
  if (matched > total) fail(path, "matched cannot exceed total");
  if (state === "confirmed" && matched !== total) fail(path, "confirmed state requires every patch to match");
  if (state === "missing" && matched !== 0) fail(path, "missing state requires zero matches");
  const commit = optionalString(item.commit, `${path}.commit`);
  if (commit && !/^[0-9a-f]{7,40}$/i.test(commit)) fail(`${path}.commit`, "expected a Git SHA");
  return { state, matched, total, ...(commit ? { commit } : {}) };
}

function trees(value: unknown, path: string): Record<TreeId, TreeSummary> {
  const item = object(value, path);
  return Object.fromEntries(TREE_IDS.map((id) => [id, treeSummary(item[id], `${path}.${id}`)])) as Record<TreeId, TreeSummary>;
}

export function validatePatchsetSummary(value: unknown, path = "patchset"): PatchsetSummary {
  const item = object(value, path);
  const language = string(item.language, `${path}.language`) as Language;
  const rawStatus = string(item.status, `${path}.status`);
  const lifecycle = string(item.lifecycle, `${path}.lifecycle`) as PatchsetLifecycle;
  const reviewState = string(item.reviewState, `${path}.reviewState`) as PatchsetReviewState;
  if (!LANGUAGES.has(language)) fail(`${path}.language`, `unknown language ${language}`);
  if (!LIFECYCLES.has(lifecycle)) fail(`${path}.lifecycle`, `unknown lifecycle ${lifecycle}`);
  if (!REVIEW_STATES.has(reviewState)) fail(`${path}.reviewState`, `unknown review state ${reviewState}`);
  const id = string(item.id, `${path}.id`);
  if (!/^[a-z0-9-]+$/.test(id)) fail(`${path}.id`, "use lowercase letters, numbers, and hyphens only");
  const messageIds = stringArray(item.messageIds, `${path}.messageIds`);
  if (!messageIds.length || messageIds.some((messageId) => !/^<[^<>\s]+>$/.test(messageId))) {
    fail(`${path}.messageIds`, "expected at least one bracketed Message-ID");
  }
  if (new Set(messageIds).size !== messageIds.length) fail(`${path}.messageIds`, "must not contain duplicates");
  const patchsetTrees = trees(item.trees, `${path}.trees`);
  const latestRevision = boolean(item.latestRevision, `${path}.latestRevision`);
  if (!STATUSES.has(rawStatus as PatchsetStatus) && !LEGACY_STATUSES.has(rawStatus)) {
    fail(`${path}.status`, `unknown status ${rawStatus}`);
  }
  // Generated snapshots contain only automatic state. Manual decisions are
  // loaded separately after validation, so stale or legacy snapshots cannot
  // turn review activity into a manual-only status.
  const status = deriveStatus(patchsetTrees, latestRevision);
  return {
    id,
    subject: string(item.subject, `${path}.subject`),
    authorName: string(item.authorName, `${path}.authorName`),
    authorEmail: safeMailbox(item.authorEmail, `${path}.authorEmail`),
    revision: integer(item.revision, `${path}.revision`, 1),
    postedAt: isoDate(item.postedAt, `${path}.postedAt`),
    language,
    patchCount: integer(item.patchCount, `${path}.patchCount`, 1),
    status,
    lifecycle,
    reviewState,
    reviewReplies: integer(item.reviewReplies, `${path}.reviewReplies`),
    latestRevision,
    messageIds,
    trees: patchsetTrees,
  };
}

export function validatePatchsetSummaries(value: unknown): PatchsetSummary[] {
  if (!Array.isArray(value)) fail("patchsets", "expected an array");
  const result = value.map((item, index) => validatePatchsetSummary(item, `patchsets[${index}]`));
  const ids = new Set<string>();
  for (const item of result) {
    if (ids.has(item.id)) fail("patchsets", `duplicate id ${item.id}`);
    ids.add(item.id);
  }
  return result;
}

function patchDetail(value: unknown, path: string): PatchDetail {
  const item = object(value, path);
  const messageId = string(item.messageId, `${path}.messageId`);
  if (!/^<[^<>\s]+>$/.test(messageId)) fail(`${path}.messageId`, "expected a bracketed Message-ID");
  const patchId = optionalString(item.patchId, `${path}.patchId`);
  if (patchId && !/^[0-9a-f]{40}$/i.test(patchId)) fail(`${path}.patchId`, "expected a stable patch-id");
  const trailers = item.trailers === undefined ? undefined : reviewTrailers(item.trailers, `${path}.trailers`);
  return {
    index: integer(item.index, `${path}.index`, 1),
    total: integer(item.total, `${path}.total`, 1),
    subject: string(item.subject, `${path}.subject`),
    messageId,
    loreUrl: httpsUrl(item.loreUrl, `${path}.loreUrl`),
    changedFiles: stringArray(item.changedFiles, `${path}.changedFiles`).map((file, index) => safePath(file, `${path}.changedFiles[${index}]`)),
    ...(patchId ? { patchId } : {}),
    ...(trailers ? { trailers } : {}),
    trees: trees(item.trees, `${path}.trees`),
  };
}

function reviewTrailers(value: unknown, path: string): ReviewTrailer[] {
  if (!Array.isArray(value)) fail(path, "expected an array");
  return value.map((raw, index) => {
    const entry = object(raw, `${path}[${index}]`);
    const type = string(entry.type, `${path}[${index}].type`) as ReviewTrailerType;
    if (!REVIEW_TRAILER_TYPES.has(type)) fail(`${path}[${index}].type`, `unknown review trailer ${type}`);
    const messageId = string(entry.messageId, `${path}[${index}].messageId`);
    if (!/^<[^<>\s]+>$/.test(messageId)) fail(`${path}[${index}].messageId`, "expected a bracketed Message-ID");
    return { type, value: string(entry.value, `${path}[${index}].value`), messageId };
  });
}

export function validatePatchsetDetail(value: unknown, path = "patchset"): PatchsetDetail {
  const summary = validatePatchsetSummary(value, path);
  const item = object(value, path);
  if (!Array.isArray(item.patches)) fail(`${path}.patches`, "expected an array");
  if (!Array.isArray(item.versions)) fail(`${path}.versions`, "expected an array");
  const patches = item.patches.map((patch, index) => patchDetail(patch, `${path}.patches[${index}]`));
  if (patches.length !== summary.patchCount) fail(`${path}.patches`, "length must equal patchCount");
  if (new Set(patches.map((patch) => patch.messageId)).size !== patches.length) fail(`${path}.patches`, "patch Message-IDs must be unique");
  if (patches.some((patch) => patch.index > patch.total)) fail(`${path}.patches`, "patch index cannot exceed total");
  if (patches.some((patch) => !summary.messageIds.includes(patch.messageId))) fail(`${path}.patches`, "every patch Message-ID must appear in messageIds");
  const versions = item.versions.map((version, index) => {
    const entry = object(version, `${path}.versions[${index}]`);
    const id = string(entry.id, `${path}.versions[${index}].id`);
    if (!/^[a-z0-9-]+$/.test(id)) fail(`${path}.versions[${index}].id`, "use lowercase letters, numbers, and hyphens only");
    return {
      revision: integer(entry.revision, `${path}.versions[${index}].revision`, 1),
      id,
      current: boolean(entry.current, `${path}.versions[${index}].current`),
    };
  });
  if (new Set(versions.map((version) => version.id)).size !== versions.length) fail(`${path}.versions`, "version IDs must be unique");
  const current = versions.filter((version) => version.current);
  if (current.length !== 1 || current[0].id !== summary.id || current[0].revision !== summary.revision) {
    fail(`${path}.versions`, "must identify this patchset as the single current version");
  }
  const lifecycleEvent = item.lifecycleEvent === undefined ? undefined : (() => {
    const event = object(item.lifecycleEvent, `${path}.lifecycleEvent`);
    const state = string(event.state, `${path}.lifecycleEvent.state`) as PatchsetLifecycle;
    if (!LIFECYCLES.has(state)) fail(`${path}.lifecycleEvent.state`, `unknown lifecycle ${state}`);
    const rawSource = string(event.source, `${path}.lifecycleEvent.source`);
    if (rawSource !== "mail" && rawSource !== "override") fail(`${path}.lifecycleEvent.source`, "expected mail or override");
    const source = rawSource as LifecycleEvent["source"];
    return {
      state,
      source,
      ...(event.date === undefined ? {} : { date: isoDate(event.date, `${path}.lifecycleEvent.date`) }),
      ...(event.messageId === undefined ? {} : { messageId: string(event.messageId, `${path}.lifecycleEvent.messageId`) }),
      ...(event.loreUrl === undefined ? {} : { loreUrl: httpsUrl(event.loreUrl, `${path}.lifecycleEvent.loreUrl`) }),
      ...(event.actorName === undefined ? {} : { actorName: string(event.actorName, `${path}.lifecycleEvent.actorName`) }),
      ...(event.actorEmail === undefined ? {} : { actorEmail: safeMailbox(event.actorEmail, `${path}.lifecycleEvent.actorEmail`) }),
      ...(event.reason === undefined ? {} : { reason: string(event.reason, `${path}.lifecycleEvent.reason`) }),
      ...(event.evidence === undefined ? {} : { evidence: string(event.evidence, `${path}.lifecycleEvent.evidence`) }),
    };
  })();
  if (lifecycleEvent && lifecycleEvent.state !== summary.lifecycle) {
    fail(`${path}.lifecycleEvent.state`, "must match patchset lifecycle");
  }
  return {
    ...summary,
    rfc: boolean(item.rfc, `${path}.rfc`),
    loreUrl: httpsUrl(item.loreUrl, `${path}.loreUrl`),
    rawUrl: httpsUrl(item.rawUrl, `${path}.rawUrl`),
    replies: integer(item.replies, `${path}.replies`),
    ...(lifecycleEvent ? { lifecycleEvent } : {}),
    versions,
    patches,
  };
}

export function validateSyncMetadata(value: unknown): SyncMetadata {
  const item = object(value, "metadata");
  const mode = string(item.mode, "metadata.mode");
  if (mode !== "fixture" && mode !== "live") fail("metadata.mode", "expected fixture or live");
  const sources = object(item.sources, "metadata.sources");
  const validatedSources = Object.fromEntries(Object.entries(sources).map(([id, source]) => {
    const entry = object(source, `metadata.sources.${id}`);
    const rawStatus = string(entry.status, `metadata.sources.${id}.status`);
    if (rawStatus !== "ok" && rawStatus !== "error") fail(`metadata.sources.${id}.status`, "expected ok or error");
    const status: "ok" | "error" = rawStatus;
    return [id, {
      status,
      ...(entry.head ? { head: string(entry.head, `metadata.sources.${id}.head`) } : {}),
      ...(entry.lastSuccessfulSync ? { lastSuccessfulSync: isoDate(entry.lastSuccessfulSync, `metadata.sources.${id}.lastSuccessfulSync`) } : {}),
    }];
  }));
  return { mode, generatedAt: isoDate(item.generatedAt, "metadata.generatedAt"), sources: validatedSources };
}

export function validateSyncRunState(value: unknown): SyncRunState {
  const item = object(value, "sync state");
  const rawStatus = string(item.status, "sync state.status");
  if (rawStatus !== "ok" && rawStatus !== "error") fail("sync state.status", "expected ok or error");
  const source = optionalString(item.source, "sync state.source");
  const error = optionalString(item.error, "sync state.error");
  if (rawStatus === "error" && !error) fail("sync state.error", "required when status is error");
  return {
    status: rawStatus,
    attemptedAt: isoDate(item.attemptedAt, "sync state.attemptedAt"),
    ...(item.lastSuccessfulSync ? { lastSuccessfulSync: isoDate(item.lastSuccessfulSync, "sync state.lastSuccessfulSync") } : {}),
    ...(source ? { source } : {}),
    ...(error ? { error } : {}),
  };
}

export function validateGitCommit(value: unknown, path = "commit"): GitCommit {
  const item = object(value, path);
  const tree = string(item.tree, `${path}.tree`) as TreeId;
  if (!TREE_IDS.includes(tree)) fail(`${path}.tree`, `unknown tree ${tree}`);
  const commit = string(item.commit, `${path}.commit`);
  if (!/^[0-9a-f]{40}$/i.test(commit)) fail(`${path}.commit`, "expected a full Git SHA-1");
  const patchId = optionalString(item.patchId, `${path}.patchId`);
  if (patchId && !/^[0-9a-f]{40}$/i.test(patchId)) fail(`${path}.patchId`, "expected a stable patch-id");
  return {
    tree,
    branch: safeBranch(item.branch, `${path}.branch`),
    commit,
    subject: string(item.subject, `${path}.subject`),
    authorName: string(item.authorName, `${path}.authorName`),
    authorEmail: safeMailbox(item.authorEmail, `${path}.authorEmail`),
    authorDate: isoDate(item.authorDate, `${path}.authorDate`),
    committerDate: isoDate(item.committerDate, `${path}.committerDate`),
    ...(patchId ? { patchId } : {}),
    changedFiles: stringArray(item.changedFiles, `${path}.changedFiles`).map((file, index) => safePath(file, `${path}.changedFiles[${index}]`)),
    firstSeenAt: isoDate(item.firstSeenAt, `${path}.firstSeenAt`),
    lastSeenAt: isoDate(item.lastSeenAt, `${path}.lastSeenAt`),
    currentlyPresent: boolean(item.currentlyPresent, `${path}.currentlyPresent`),
  };
}

export function validateGitCommitIndex(value: unknown, tree?: TreeId): GitCommit[] {
  if (!Array.isArray(value)) fail("commit index", "expected an array");
  const commits = value.map((item, index) => validateGitCommit(item, `commit index[${index}]`));
  const ids = new Set<string>();
  for (const commit of commits) {
    if (tree && commit.tree !== tree) fail("commit index", `expected only ${tree} commits`);
    if (ids.has(commit.commit)) fail("commit index", `duplicate commit ${commit.commit}`);
    ids.add(commit.commit);
  }
  return commits;
}
