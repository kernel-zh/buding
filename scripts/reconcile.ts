import { reconcileGeneratedData } from "../lib/matching/generated.ts";

const report = await reconcileGeneratedData(process.cwd());
console.log(`Reconciliation complete: ${report.confirmed} confirmed, ${report.candidates} candidate, ${report.previouslyPresent} previously present, ${report.missing} missing, ${report.manualOverrides} match overrides, ${report.stateOverrides} state overrides, ${report.ignoredPatches} ignored, ${report.expiredMainlineFamilies} expired mainline families removed.`);
