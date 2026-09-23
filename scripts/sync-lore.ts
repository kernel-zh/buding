import { LeiLoreSource } from "../lib/lore/lei-source.ts";
import { synchronizeLore } from "../lib/lore/sync.ts";

const report = await synchronizeLore({
  root: process.cwd(),
  source: new LeiLoreSource(),
  initialSince: process.env.INITIAL_SYNC_SINCE ?? "2025-01-01T00:00:00Z",
});

console.log(`Lore sync complete: ${report.retrievedMessages} retrieved, ${report.newMessages} new, ${report.cachedMessages} cached, ${report.series} series, ${report.patches} patches.`);
console.log(`Stable patch IDs computed: ${report.patchIdsComputed}.`);
console.log(`Query: ${report.query}`);
