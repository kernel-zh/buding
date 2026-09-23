import type { SyncMetadata, SyncRunState } from "@/lib/data/schema";
import { formatSyncTime } from "@/lib/data/time";
import { TRACKED_TREES } from "@/lib/git/config";

export function SyncHealth({ metadata, runState }: { metadata: SyncMetadata; runState: SyncRunState }) {
  return (
    <>
      {runState.status === "error" && (
        <div className="sync-alert" role="alert">
          <strong>Last synchronization failed{runState.source ? ` at ${runState.source}` : ""}.</strong>
          <span>{runState.error}</span>
          {runState.lastSuccessfulSync && <span>Last complete run: <time dateTime={runState.lastSuccessfulSync}>{formatSyncTime(runState.lastSuccessfulSync)} CST</time></span>}
        </div>
      )}
      <div className="source-revisions" aria-label="Synchronization source status">
        {metadata.sources.lore && (
          <span className="source-revision">
            <strong>Lore</strong>
            <span className={`source-state source-${metadata.sources.lore.status}`}>{metadata.sources.lore.status}</span>
            {metadata.sources.lore.lastSuccessfulSync && <time dateTime={metadata.sources.lore.lastSuccessfulSync}>{formatSyncTime(metadata.sources.lore.lastSuccessfulSync)} CST</time>}
          </span>
        )}
        {TRACKED_TREES.map((tree) => {
          const source = metadata.sources[tree.id];
          return (
            <span className="source-revision" key={tree.id}>
              <strong>{tree.name}/{tree.branch}</strong>
              <span className={`source-state source-${source?.status ?? "error"}`}>{source?.status ?? "missing"}</span>
              <code>{source?.head?.slice(0, 8) ?? "—"}</code>
              {source?.lastSuccessfulSync && <time dateTime={source.lastSuccessfulSync}>{formatSyncTime(source.lastSuccessfulSync)} CST</time>}
            </span>
          );
        })}
      </div>
    </>
  );
}
