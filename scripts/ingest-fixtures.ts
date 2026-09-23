import path from "node:path";
import { writeGeneratedData } from "../lib/data/generate.ts";
import type { SyncMetadata } from "../lib/data/schema.ts";
import { FixtureLoreSource } from "../lib/lore/fixture-source.ts";
import { buildPatchsets } from "../lib/lore/series.ts";

const root = process.cwd();
const source = new FixtureLoreSource(path.join(root, "fixtures", "lore"));
const dataset = await source.loadDataset();
const details = buildPatchsets(dataset);
const now = new Date(Math.max(...dataset.messages.map((message) => Date.parse(message.date)))).toISOString();
const metadata = {
  mode: "fixture",
  generatedAt: now,
  sources: { lore: { status: "ok", lastSuccessfulSync: now } },
} satisfies SyncMetadata;
const result = await writeGeneratedData(root, details, metadata);

console.log(`Fixture ingestion complete: ${dataset.messages.length} messages, ${result.details.length} series, ${result.details.reduce((sum, detail) => sum + detail.patches.length, 0)} patches, ${result.staleFilesRemoved} stale files removed.`);
