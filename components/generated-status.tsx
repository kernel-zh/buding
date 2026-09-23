import type { SyncRunState } from "@/lib/data/schema";
import { formatSyncTime } from "@/lib/data/time";

export function GeneratedStatus({
  generatedAt,
  status,
  commitSha,
  commitUrl,
  label = "Generated",
  className = "",
}: {
  generatedAt: string;
  status?: SyncRunState["status"];
  commitSha?: string;
  commitUrl?: string;
  label?: string;
  className?: string;
}) {
  const shortCommit = commitSha?.slice(0, 8);

  return (
    <span className={`generated-status ${className}`.trim()}>
      <span>{label}</span>
      <time dateTime={generatedAt}>{formatSyncTime(generatedAt)} CST</time>
      {status && <strong className={status === "error" ? "sync-error-text" : ""}>{status}</strong>}
      {shortCommit && <>
        <span aria-hidden="true">·</span>
        <span>built from</span>
        {commitUrl
          ? <a className="build-commit" href={commitUrl} target="_blank" rel="noreferrer" title={`Built from commit ${commitSha}`}><code>{shortCommit}</code></a>
          : <code className="build-commit" title={`Built from commit ${commitSha}`}>{shortCommit}</code>}
      </>}
    </span>
  );
}
