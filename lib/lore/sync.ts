import { readFile } from "node:fs/promises";
import path from "node:path";
import { writeGeneratedData, writeJsonAtomic } from "../data/generate.ts";
import { validateSyncMetadata } from "../data/validation.ts";
import { addStablePatchIds } from "../git/patch-id.ts";
import type { CommandRunner } from "../git/runner.ts";
import { deduplicateMessages } from "./parser.ts";
import { buildLoreQuery, syncStart } from "./query.ts";
import { buildPatchsets } from "./series.ts";
import type { LoreMessage, LoreSource } from "./types";
import { canonicalLoreMessageUrls } from "./url.ts";

interface LoreSyncState {
  lastSuccessfulSync?: string;
}

interface LoreMessageCache {
  messages: LoreMessage[];
}

export interface LoreSyncOptions {
  root: string;
  source: LoreSource;
  initialSince: string;
  forceInitialSince?: boolean;
  now?: Date;
  commandRunner?: CommandRunner;
  writePublicData?: boolean;
}

export interface LoreSyncReport {
  query: string;
  retrievedMessages: number;
  newMessages: number;
  cachedMessages: number;
  patchIdsComputed: number;
  series: number;
  patches: number;
  staleFilesRemoved: number;
  synchronizedAt: string;
}

async function readOptionalJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw new Error(`Unable to read ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function validateLoreMessages(value: unknown): LoreMessage[] {
  if (!Array.isArray(value)) throw new Error("Lore message cache must contain a messages array");
  return value.map((raw, index) => {
    if (!raw || typeof raw !== "object") throw new Error(`Invalid cached lore message at index ${index}`);
    const message = raw as Partial<LoreMessage>;
    const requiredStrings: Array<keyof LoreMessage> = ["messageId", "subject", "date", "body", "loreUrl", "rawUrl"];
    if (requiredStrings.some((key) => typeof message[key] !== "string")) {
      throw new Error(`Invalid cached lore message fields at index ${index}`);
    }
    if (!message.from || typeof message.from.name !== "string" || typeof message.from.email !== "string") {
      throw new Error(`Invalid cached lore sender at index ${index}`);
    }
    if (!Array.isArray(message.references) || message.references.some((reference) => typeof reference !== "string")) {
      throw new Error(`Invalid cached lore references at index ${index}`);
    }
    if (Number.isNaN(Date.parse(message.date as string))) throw new Error(`Invalid cached lore date at index ${index}`);
    if (message.patchId !== undefined && (typeof message.patchId !== "string" || !/^[0-9a-f]{40}$/i.test(message.patchId))) {
      throw new Error(`Invalid cached stable patch-id at index ${index}`);
    }
    return {
      ...message,
      ...canonicalLoreMessageUrls(
        message.messageId as string,
        message.loreUrl as string,
        message.rawUrl as string,
      ),
    } as LoreMessage;
  });
}

export async function synchronizeLore(options: LoreSyncOptions): Promise<LoreSyncReport> {
  const internalDirectory = path.join(options.root, "data", "internal");
  const stateFile = path.join(internalDirectory, "lore-state.json");
  const cacheFile = path.join(internalDirectory, "lore-messages.json");
  const runStateFile = path.join(internalDirectory, "sync-state.json");
  const metadataFile = path.join(options.root, "data", "metadata.json");
  const synchronizedAt = (options.now ?? new Date()).toISOString();

  try {
    const state = await readOptionalJson<LoreSyncState>(stateFile, {});
    const cache = await readOptionalJson<LoreMessageCache>(cacheFile, { messages: [] });
    const existingMetadata = validateSyncMetadata(await readOptionalJson<unknown>(metadataFile, {
      mode: "live",
      generatedAt: synchronizedAt,
      sources: {},
    }));
    const cachedMessages = validateLoreMessages(cache.messages);
    const start = syncStart(
      state.lastSuccessfulSync,
      options.initialSince,
      options.forceInitialSince,
    );
    const query = buildLoreQuery(start);
    const retrieved = deduplicateMessages(await options.source.search(query));
    const knownIds = new Set(cachedMessages.map((message) => message.messageId));
    const merged = deduplicateMessages([...cachedMessages, ...retrieved]);
    const patchIds = await addStablePatchIds(merged, options.commandRunner);
    const mergedMessages = patchIds.messages;
    const details = buildPatchsets({ messages: mergedMessages });
    const nextMetadata = {
      mode: "live",
      generatedAt: synchronizedAt,
      sources: {
        ...existingMetadata.sources,
        lore: { status: "ok", lastSuccessfulSync: synchronizedAt },
      },
    } as const;
    const result = options.writePublicData === false
      ? { staleFilesRemoved: 0 }
      : await writeGeneratedData(options.root, details, nextMetadata);

    await writeJsonAtomic(cacheFile, { messages: mergedMessages });
    await writeJsonAtomic(stateFile, { lastSuccessfulSync: synchronizedAt });
    if (options.writePublicData === false) await writeJsonAtomic(metadataFile, nextMetadata);
    await writeJsonAtomic(runStateFile, {
      status: "ok",
      attemptedAt: synchronizedAt,
      lastSuccessfulSync: synchronizedAt,
    });

    return {
      query,
      retrievedMessages: retrieved.length,
      newMessages: retrieved.filter((message) => !knownIds.has(message.messageId)).length,
      cachedMessages: mergedMessages.length,
      patchIdsComputed: patchIds.computed,
      series: details.length,
      patches: details.reduce((sum, detail) => sum + detail.patches.length, 0),
      staleFilesRemoved: result.staleFilesRemoved,
      synchronizedAt,
    };
  } catch (error) {
    await writeJsonAtomic(runStateFile, {
      status: "error",
      attemptedAt: synchronizedAt,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
