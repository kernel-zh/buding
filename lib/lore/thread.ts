import { deduplicateMessages } from "./parser.ts";
import type { LoreMessage, LoreThread } from "./types";

export function reconstructThreads(input: LoreMessage[]): LoreThread[] {
  const messages = deduplicateMessages(input);
  const byId = new Map(messages.map((message) => [message.messageId, message]));

  function parentId(message: LoreMessage): string | undefined {
    if (message.inReplyTo && byId.has(message.inReplyTo)) return message.inReplyTo;
    return [...message.references].reverse().find((reference) => byId.has(reference));
  }

  function rootId(message: LoreMessage): string {
    const visited = new Set([message.messageId]);
    let current = message;
    let parent = parentId(current);
    while (parent && !visited.has(parent)) {
      visited.add(parent);
      current = byId.get(parent) as LoreMessage;
      parent = parentId(current);
    }
    return current.messageId;
  }

  const threads = new Map<string, LoreMessage[]>();
  for (const message of messages) {
    const root = rootId(message);
    threads.set(root, [...(threads.get(root) ?? []), message]);
  }

  return [...threads.entries()]
    .map(([rootMessageId, threadMessages]) => ({ rootMessageId, messages: threadMessages }))
    .sort((a, b) => Date.parse(b.messages[0].date) - Date.parse(a.messages[0].date));
}
