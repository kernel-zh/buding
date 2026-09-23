import type { ParsedSubject } from "./types";

const REPLY_PREFIX = /^(?:(?:re|fwd?):\s*)+/i;

export function parsePatchSubject(subject: string): ParsedSubject {
  const trimmed = subject.trim();
  const isReply = REPLY_PREFIX.test(trimmed);
  const withoutReply = trimmed.replace(REPLY_PREFIX, "").trim();
  const bracket = withoutReply.match(/^\[([^\]]+)\]\s*(.*)$/);
  if (!bracket || !/\bPATCH\b/i.test(bracket[1])) {
    return { isPatch: false, isReply, rfc: false, revision: 1, index: null, total: null, baseSubject: withoutReply };
  }

  const tags = bracket[1];
  const parsedRevision = Number(tags.match(/\bv(\d+)\b/i)?.[1] ?? 1);
  const revision = Number.isSafeInteger(parsedRevision) && parsedRevision > 0 ? parsedRevision : 1;
  const numbering = tags.match(/\b(\d+)\s*\/\s*(\d+)\b/);
  const parsedIndex = numbering ? Number(numbering[1]) : null;
  const parsedTotal = numbering ? Number(numbering[2]) : null;
  const validNumbering = parsedIndex !== null
    && parsedTotal !== null
    && Number.isSafeInteger(parsedIndex)
    && Number.isSafeInteger(parsedTotal)
    && parsedIndex >= 0
    && parsedTotal > 0
    && parsedIndex <= parsedTotal;
  return {
    isPatch: true,
    isReply,
    rfc: /\bRFC\b/i.test(tags),
    revision,
    index: validNumbering ? parsedIndex : null,
    total: validNumbering ? parsedTotal : null,
    baseSubject: bracket[2].replace(/\s+/g, " ").trim(),
  };
}

export function normalizeSeriesSubject(subject: string): string {
  return subject
    .toLocaleLowerCase()
    .replace(/^docs(?:\/zh_(?:cn|tw))?\s*:\s*/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
