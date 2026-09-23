const argument = process.argv.find((value) => value.startsWith("--since="));
const since = argument?.slice("--since=".length) ?? process.env.SYNC_SINCE?.trim();
if (!since) throw new Error("Provide a start date with --since=YYYY-MM-DD or SYNC_SINCE");

process.env.SYNC_SINCE = since;
await import("./sync.ts");

export {};
