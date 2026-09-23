import { createHash } from "node:crypto";
import { checkedGit, runCommand, type CommandRunner } from "./runner.ts";
import { classifyLanguage, extractChangedFiles } from "../lore/parser.ts";
import { parsePatchSubject } from "../lore/subject.ts";
import type { LoreMessage } from "../lore/types.ts";

const SHA1 = /^[0-9a-f]{40}$/;

function markerFor(messageId: string): string {
  return createHash("sha1").update(messageId).digest("hex");
}

function isPatch(message: LoreMessage): boolean {
  const subject = parsePatchSubject(message.subject);
  return subject.isPatch
    && !subject.isReply
    && subject.index !== 0
    && Boolean(classifyLanguage(extractChangedFiles(message.body), subject.baseSubject));
}

function patchBody(message: LoreMessage, marker: string): string {
  const diff = message.body.search(/^diff --git /m);
  if (diff < 0) throw new Error(`Lore patch has no Git diff: ${message.messageId}`);
  return `${message.body.slice(0, diff)}From ${marker} Mon Sep 17 00:00:00 2001\n${message.body.slice(diff)}`;
}

export async function addStablePatchIds(
  messages: LoreMessage[],
  runner: CommandRunner = runCommand,
): Promise<{ messages: LoreMessage[]; computed: number }> {
  const pending = messages.filter((message) => !message.patchId && isPatch(message));
  if (!pending.length) return { messages, computed: 0 };

  const byMarker = new Map(pending.map((message) => [markerFor(message.messageId), message.messageId]));
  if (byMarker.size !== pending.length) throw new Error("Unable to create unique patch-id markers for lore messages");

  const input = pending.map((message) => [
    `Subject: ${message.subject}`,
    "",
    patchBody(message, markerFor(message.messageId)),
    "",
  ].join("\n")).join("\n");
  const result = await checkedGit(runner, ["patch-id", "--stable"], { input });
  const patchIds = new Map<string, string>();

  for (const line of result.stdout.split(/\r?\n/).filter(Boolean)) {
    const [patchId, marker] = line.trim().split(/\s+/, 2);
    const messageId = marker ? byMarker.get(marker) : undefined;
    if (!SHA1.test(patchId ?? "") || !SHA1.test(marker ?? "")) {
      throw new Error(`Unable to parse stable patch-id output: ${line}`);
    }
    if (!messageId) continue;
    patchIds.set(messageId, patchId);
  }

  const missing = pending.filter((message) => !patchIds.has(message.messageId));
  if (missing.length) {
    throw new Error(`Git did not calculate stable patch-id for ${missing.length} lore patch(es), starting with ${missing[0].messageId}`);
  }

  return {
    messages: messages.map((message) => {
      const patchId = patchIds.get(message.messageId);
      return patchId ? { ...message, patchId } : message;
    }),
    computed: patchIds.size,
  };
}
