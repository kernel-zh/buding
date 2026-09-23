import { synchronizeGit } from "../lib/git/sync.ts";

const initialSince = process.env.GIT_SYNC_SINCE?.trim()
  || process.env.INITIAL_SYNC_SINCE?.trim()
  || "2025-01-01T00:00:00Z";
const report = await synchronizeGit({
  root: process.cwd(),
  initialSince,
  forceRescan: process.env.GIT_FORCE_RESCAN === "true" || process.env.GIT_FORCE_RESCAN === "1",
});

for (const tree of report.trees) {
  console.log(`${tree.tree}: ${tree.mode}, ${tree.scannedCommits} scanned, ${tree.indexedCommits} indexed, head ${tree.currentHead.slice(0, 12)}.`);
}
