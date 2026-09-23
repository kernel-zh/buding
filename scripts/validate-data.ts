import { validateGeneratedData } from "../lib/data/validate-generated.ts";

const root = process.cwd();
const report = await validateGeneratedData(root);
console.log(`Data validation passed: ${report.summaries} summaries, ${report.details} detail files, and ${report.indexedCommits} indexed Git commits.`);
