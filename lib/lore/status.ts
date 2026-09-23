import type { LifecycleEvent, PatchsetLifecycle } from "../data/schema.ts";
import type { LoreMessage } from "./types.ts";

const DIRECTIVE = /^Patch-status:\s*(active|withdrawn|invalid)\s*$/i;

export const PATCH_STATUS_MAINTAINERS = new Set([
  "alexs@kernel.org",
  "seakeel@gmail.com",
  "si.yanteng@linux.dev",
  "dzm91@hust.edu.cn",
  "corbet@lwn.net",
  "skhan@linuxfoundation.org",
  "rdunlap@infradead.org",
  "wy@wyuan.org",
  "chenyou910331@gmail.com",
]);

export interface MailLifecycleResult {
  lifecycle: PatchsetLifecycle;
  event?: LifecycleEvent;
}

function directiveFromBody(body: string): PatchsetLifecycle | undefined {
  for (const line of body.split(/\r?\n/)) {
    if (/^\s*>/.test(line)) continue;
    const match = line.match(DIRECTIVE);
    if (match) return match[1].toLocaleLowerCase() as PatchsetLifecycle;
  }
  return undefined;
}

export function lifecycleFromMail(
  messages: LoreMessage[],
  authorEmail: string,
  patchMessageIds: Set<string>,
): MailLifecycleResult {
  const normalizedAuthor = authorEmail.toLocaleLowerCase();
  const events = messages.flatMap((message) => {
    if (patchMessageIds.has(message.messageId)) return [];
    const sender = message.from.email.toLocaleLowerCase();
    if (sender !== normalizedAuthor && !PATCH_STATUS_MAINTAINERS.has(sender)) return [];
    const state = directiveFromBody(message.body);
    if (!state) return [];
    return [{ message, state }];
  }).toSorted((left, right) => Date.parse(left.message.date) - Date.parse(right.message.date));

  const latest = events.at(-1);
  if (!latest) return { lifecycle: "active" };
  return {
    lifecycle: latest.state,
    event: {
      state: latest.state,
      source: "mail",
      date: latest.message.date,
      messageId: latest.message.messageId,
      loreUrl: latest.message.loreUrl,
      actorName: latest.message.from.name,
      actorEmail: latest.message.from.email,
    },
  };
}
