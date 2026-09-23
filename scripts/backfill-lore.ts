import { LeiLoreSource } from "../lib/lore/lei-source.ts";
import { synchronizeLore } from "../lib/lore/sync.ts";

const argument = process.argv.find((value) => value.startsWith("--since="));
const since = argument?.slice("--since=".length) ?? process.env.SYNC_SINCE;
if (!since) throw new Error("Provide a start date with --since=YYYY-MM-DD or SYNC_SINCE");

const report = await synchronizeLore({
  root: process.cwd(),
  source: new LeiLoreSource(),
  initialSince: since,
  forceInitialSince: true,
});

console.log(`Lore backfill complete: ${report.retrievedMessages} retrieved, ${report.newMessages} new, ${report.cachedMessages} cached, ${report.series} series, ${report.patches} patches.`);
console.log(`Stable patch IDs computed: ${report.patchIdsComputed}.`);
console.log(`Query: ${report.query}`);
