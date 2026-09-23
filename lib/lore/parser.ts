import type { Language, ReviewTrailer, ReviewTrailerType } from "../data/schema";
import type { LoreMessage } from "./types";

const CN_PREFIX = "Documentation/translations/zh_CN/";
const TW_PREFIX = "Documentation/translations/zh_TW/";
const REVIEW_TRAILER = /^(Reviewed-by|Acked-by|Tested-by|Suggested-by|Reported-by):\s*(.+)$/gim;
const REVIEW_TRAILER_TYPES: Record<string, ReviewTrailerType> = {
  "reviewed-by": "Reviewed-by",
  "acked-by": "Acked-by",
  "tested-by": "Tested-by",
  "suggested-by": "Suggested-by",
  "reported-by": "Reported-by",
};

export function normalizeMessageId(value: string): string {
  const result = value.trim();
  if (!/^<[^<>\s]+>$/.test(result)) throw new Error(`Invalid Message-ID: ${value}`);
  return result;
}

export function extractChangedFiles(body: string): string[] {
  const paths = new Set<string>();
  for (const line of body.split(/\r?\n/)) {
    const diff = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (diff) {
      paths.add(diff[2]);
      continue;
    }
    const target = line.match(/^\+\+\+ b\/(.+)$/);
    if (target) paths.add(target[1]);
  }
  return [...paths].sort();
}

export function classifyLanguage(paths: string[], subject = ""): Language | null {
  const hasCn = paths.some((path) => path.startsWith(CN_PREFIX));
  const hasTw = paths.some((path) => path.startsWith(TW_PREFIX));
  if (hasCn && hasTw) return "mixed";
  if (hasCn) return "zh_CN";
  if (hasTw) return "zh_TW";

  const subjectCn = /(?:docs\/zh_CN|zh_CN|Documentation\/translations\/zh_CN)/i.test(subject);
  const subjectTw = /(?:docs\/zh_TW|zh_TW|Documentation\/translations\/zh_TW)/i.test(subject);
  if (subjectCn && subjectTw) return "mixed";
  if (subjectCn) return "zh_CN";
  if (subjectTw) return "zh_TW";
  return null;
}

export function extractReviewTrailers(messages: LoreMessage[]): ReviewTrailer[] {
  const trailers = new Map<string, ReviewTrailer>();
  for (const message of messages) {
    for (const match of message.body.matchAll(REVIEW_TRAILER)) {
      const type = REVIEW_TRAILER_TYPES[match[1].toLocaleLowerCase()];
      const value = match[2].trim();
      if (!value) continue;
      const key = `${type.toLocaleLowerCase()}\0${value.toLocaleLowerCase()}`;
      if (!trailers.has(key)) trailers.set(key, { type, value, messageId: message.messageId });
    }
  }
  return [...trailers.values()];
}

export function deduplicateMessages(messages: LoreMessage[]): LoreMessage[] {
  const result = new Map<string, LoreMessage>();
  for (const message of messages) {
    const id = normalizeMessageId(message.messageId);
    if (!result.has(id)) result.set(id, { ...message, messageId: id });
  }
  return [...result.values()].sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}
