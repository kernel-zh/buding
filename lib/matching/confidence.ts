import type { GitCommit, PatchDetail } from "../data/schema.ts";
import { normalizeSeriesSubject } from "../lore/subject.ts";

const MAX_CANDIDATE_DISTANCE_MS = 180 * 24 * 60 * 60 * 1000;

function normalizedPerson(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function sameFiles(left: string[], right: string[]): boolean {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length > 0 && a.length === b.length && a.every((value, index) => value === b[index]);
}

export interface PatchIdentity {
  patch: PatchDetail;
  authorName: string;
  authorEmail: string;
  postedAt: string;
}

export function isCandidate(identity: PatchIdentity, commit: GitCommit): boolean {
  if (!commit.currentlyPresent) return false;
  if (normalizeSeriesSubject(identity.patch.subject) !== normalizeSeriesSubject(commit.subject)) return false;
  const emailMatches = identity.authorEmail.toLocaleLowerCase() === commit.authorEmail.toLocaleLowerCase();
  const nameMatches = normalizedPerson(identity.authorName) === normalizedPerson(commit.authorName);
  if (!emailMatches && !nameMatches) return false;
  if (!sameFiles(identity.patch.changedFiles, commit.changedFiles)) return false;
  return Math.abs(Date.parse(identity.postedAt) - Date.parse(commit.authorDate)) <= MAX_CANDIDATE_DISTANCE_MS;
}
