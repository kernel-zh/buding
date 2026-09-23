const DEFAULT_OVERLAP_MS = 60 * 60 * 1000;

export function parseSyncDate(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} must be a valid date, received: ${value}`);
  return date;
}

export function syncStart(
  lastSuccessfulSync: string | undefined,
  initialSince: string,
  forceInitialSince = false,
  overlapMs = DEFAULT_OVERLAP_MS,
): Date {
  if (forceInitialSince || !lastSuccessfulSync) return parseSyncDate(initialSince, "sync start");
  return new Date(parseSyncDate(lastSuccessfulSync, "last successful sync").getTime() - overlapMs);
}

export function buildLoreQuery(since: Date): string {
  const languageFiles = [
    "dfn:Documentation/translations/zh_CN/*",
    "dfn:Documentation/translations/zh_TW/*",
    's:"Documentation/translations/zh_CN"',
    's:"Documentation/translations/zh_TW"',
    's:"docs/zh_CN"',
    's:"docs/zh_TW"',
    's:"zh_CN"',
    's:"zh_TW"',
  ].join(" OR ");
  return `(${languageFiles}) AND d:${since.toISOString()}..`;
}
