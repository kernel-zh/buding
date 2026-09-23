import type { GitCommit, Language, PatchDetail, PatchsetDetail, TreeId, TreeSummary } from "../data/schema.ts";
import { TRACKED_TREES } from "../git/config.ts";
import { classifyLanguage } from "../lore/parser.ts";
import { aggregateTree } from "../lore/series.ts";
import { deriveStatus } from "../status/policy.ts";
import { isCandidate } from "./confidence.ts";
import type { MatchOverride, ReconciliationOverrides, StateOverride } from "./overrides.ts";

export type CommitIndexes = Record<TreeId, GitCommit[]>;

export interface ReconciliationReport {
  details: PatchsetDetail[];
  ignoredPatches: number;
  expiredMainlineFamilies: number;
  confirmed: number;
  candidates: number;
  previouslyPresent: number;
  missing: number;
  manualOverrides: number;
  stateOverrides: number;
}

export interface ReconciliationOptions {
  now?: Date;
}

const MAINLINE_RETENTION_MONTHS = 3;

function newest(commits: GitCommit[]): GitCommit | undefined {
  return commits.toSorted((a, b) => Date.parse(b.committerDate) - Date.parse(a.committerDate))[0];
}

function summary(state: TreeSummary["state"], commit?: string): TreeSummary {
  return {
    state,
    matched: state === "confirmed" ? 1 : 0,
    total: 1,
    ...(commit ? { commit } : {}),
  };
}

function resolveOverrideCommit(override: MatchOverride, commits: GitCommit[]): { commit: string; present?: boolean } {
  const matches = commits.filter((commit) => commit.commit.startsWith(override.commit));
  if (matches.length > 1) throw new Error(`Manual override ${override.commit} is ambiguous in ${override.tree}`);
  const indexed = matches[0];
  return indexed ? { commit: indexed.commit, present: indexed.currentlyPresent } : { commit: override.commit };
}

function reconcilePatch(
  patch: PatchDetail,
  detail: PatchsetDetail,
  commits: GitCommit[],
  override?: MatchOverride,
): TreeSummary {
  if (override) {
    const resolved = resolveOverrideCommit(override, commits);
    return summary(resolved.present === false ? "previously-present" : "confirmed", resolved.commit);
  }

  const exact = patch.patchId ? commits.filter((commit) => commit.patchId === patch.patchId) : [];
  const currentExact = newest(exact.filter((commit) => commit.currentlyPresent));
  if (currentExact) return summary("confirmed", currentExact.commit);
  const historicalExact = newest(exact);
  if (historicalExact) return summary("previously-present", historicalExact.commit);

  const candidate = newest(commits.filter((commit) => isCandidate({
    patch,
    authorName: detail.authorName,
    authorEmail: detail.authorEmail,
    postedAt: detail.postedAt,
  }, commit)));
  return candidate ? summary("candidate", candidate.commit) : summary("missing");
}

function languageFor(patches: PatchDetail[]): Language {
  const languages = new Set(patches.map((patch) => classifyLanguage(patch.changedFiles, patch.subject)).filter(Boolean));
  if (languages.size !== 1 || languages.has("mixed")) return "mixed";
  return [...languages][0] as Language;
}

function removeIgnored(details: PatchsetDetail[], ignored: Set<string>): { details: PatchsetDetail[]; count: number } {
  let count = 0;
  const retained = details.flatMap((detail) => {
    const patches = detail.patches.filter((patch) => {
      if (!ignored.has(patch.messageId)) return true;
      count += 1;
      return false;
    });
    if (!patches.length) return [];
    return [{
      ...detail,
      patches,
      patchCount: patches.length,
      language: languageFor(patches),
      messageIds: detail.messageIds.filter((messageId) => !ignored.has(messageId)),
    }];
  });
  const ids = new Set(retained.map((detail) => detail.id));
  const byId = new Map(retained.map((detail) => [detail.id, detail]));
  return {
    count,
    details: retained.map((detail) => {
      const versions = detail.versions.filter((version) => ids.has(version.id));
      const latest = versions
        .map((version) => byId.get(version.id))
        .filter((value): value is PatchsetDetail => Boolean(value))
        .toSorted((a, b) => b.revision - a.revision || Date.parse(b.postedAt) - Date.parse(a.postedAt))[0];
      return { ...detail, versions, latestRevision: !latest || latest.id === detail.id };
    }),
  };
}

function addUtcMonths(value: string, months: number): Date {
  const source = new Date(value);
  const result = new Date(source);
  const day = source.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(
    result.getUTCFullYear(),
    result.getUTCMonth() + 1,
    0,
  )).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function removeExpiredMainlineFamilies(
  details: PatchsetDetail[],
  linusCommits: GitCommit[],
  now: Date,
): { details: PatchsetDetail[]; count: number } {
  if (Number.isNaN(now.getTime())) throw new Error("Reconciliation time must be a valid date");
  const commitsBySha = new Map(linusCommits.map((commit) => [commit.commit, commit]));
  const expiredIds = new Set<string>();
  let count = 0;

  for (const detail of details) {
    if (!detail.latestRevision || detail.trees.linus.state !== "confirmed") continue;
    const firstSeenTimes = detail.patches.map((patch) => {
      const match = patch.trees.linus;
      if (match.state !== "confirmed" || !match.commit) return undefined;
      return commitsBySha.get(match.commit)?.firstSeenAt;
    });
    if (firstSeenTimes.some((value) => !value)) continue;
    const enteredMainlineAt = firstSeenTimes
      .map((value) => value as string)
      .toSorted((left, right) => Date.parse(right) - Date.parse(left))[0];
    if (now < addUtcMonths(enteredMainlineAt, MAINLINE_RETENTION_MONTHS)) continue;

    count += 1;
    for (const version of detail.versions) expiredIds.add(version.id);
  }

  return {
    details: details.filter((detail) => !expiredIds.has(detail.id)),
    count,
  };
}

export function reconcilePatchsets(
  sourceDetails: PatchsetDetail[],
  indexes: CommitIndexes,
  overrides: ReconciliationOverrides,
  options: ReconciliationOptions = {},
): ReconciliationReport {
  const ignored = new Set(overrides.ignore.map((entry) => entry.messageId));
  const filtered = removeIgnored(sourceDetails, ignored);
  const knownMessages = new Set(sourceDetails.flatMap((detail) => detail.patches.map((patch) => patch.messageId)));
  const unknownOverride = overrides.matches.find((entry) => !knownMessages.has(entry.messageId));
  if (unknownOverride) throw new Error(`Override refers to unknown patch ${unknownOverride.messageId}`);
  const knownSeriesMessages = new Set(sourceDetails.flatMap((detail) => detail.messageIds));
  const unknownState = overrides.states.find((entry) => !knownSeriesMessages.has(entry.messageId));
  if (unknownState) throw new Error(`State override refers to unknown patchset message ${unknownState.messageId}`);
  const overrideMap = new Map(overrides.matches.map((entry) => [`${entry.messageId}\0${entry.tree}`, entry]));
  const stateMap = new Map(overrides.states.map((entry) => [entry.messageId, entry]));
  const counts = { confirmed: 0, candidates: 0, previouslyPresent: 0, missing: 0, manualOverrides: 0 };

  const details = filtered.details.map((detail) => {
    const stateOverride = detail.messageIds.map((messageId) => stateMap.get(messageId)).find(Boolean) as StateOverride | undefined;
    const patches = detail.patches.map((patch) => {
      const trees = Object.fromEntries(TRACKED_TREES.map((tree) => {
        const override = overrideMap.get(`${patch.messageId}\0${tree.id}`);
        if (override) counts.manualOverrides += 1;
        const result = reconcilePatch(
          patch,
          detail,
          indexes[tree.id],
          override,
        );
        if (result.state === "confirmed") counts.confirmed += 1;
        else if (result.state === "candidate") counts.candidates += 1;
        else if (result.state === "previously-present") counts.previouslyPresent += 1;
        else counts.missing += 1;
        return [tree.id, result];
      })) as Record<TreeId, TreeSummary>;
      return { ...patch, trees };
    });
    const trees = Object.fromEntries(TRACKED_TREES.map((tree) => [
      tree.id,
      aggregateTree(patches.map((patch) => patch.trees[tree.id])),
    ])) as Record<TreeId, TreeSummary>;
    return {
      ...detail,
      patches,
      trees,
      lifecycle: stateOverride?.state ?? detail.lifecycle,
      ...(stateOverride ? {
        lifecycleEvent: {
          state: stateOverride.state,
          source: "override" as const,
          reason: stateOverride.reason,
          ...(stateOverride.evidence ? { evidence: stateOverride.evidence } : {}),
        },
      } : {}),
      status: deriveStatus(
        trees,
        detail.latestRevision,
      ),
    };
  });

  const retained = removeExpiredMainlineFamilies(details, indexes.linus, options.now ?? new Date());
  return {
    details: retained.details,
    ignoredPatches: filtered.count,
    expiredMainlineFamilies: retained.count,
    stateOverrides: overrides.states.length,
    ...counts,
  };
}
