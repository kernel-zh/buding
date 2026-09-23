import type { TreeId, TreeSummary } from "@/lib/data/schema";
import { TRACKED_TREES, treeCommitUrl } from "@/lib/git/config";

const stateLabels: Record<TreeSummary["state"], string> = {
  confirmed: "Confirmed",
  partial: "Partially confirmed",
  candidate: "Candidate match",
  "previously-present": "Previously present",
  missing: "Not found",
};

export function Pipeline({ trees, compact = false }: { trees: Record<TreeId, TreeSummary>; compact?: boolean }) {
  return (
    <div className={`pipeline ${compact ? "pipeline-compact" : ""}`}>
      {TRACKED_TREES.map((stage) => {
        const tree = trees[stage.id];
        const label = `${stage.name} ${stage.branch}: ${tree.state}, ${tree.matched} of ${tree.total} patches`;
        return (
          <div className="pipeline-stage" key={stage.id} role="group" aria-label={label}>
            <span className={`light-dot pipeline-dot light-${tree.state}`} aria-hidden="true" />
            <div className="pipeline-name">{stage.name}</div>
            <span className="pipeline-branch">{stage.branch}</span>
            <span className="pipeline-count">{tree.matched} of {tree.total} confirmed</span>
            <span className={`pipeline-state pipeline-state-${tree.state}`}>{stateLabels[tree.state]}</span>
            {tree.commit && (
              <a className="pipeline-sha" href={treeCommitUrl(stage.id, tree.commit)} target="_blank" rel="noreferrer">
                {tree.commit.slice(0, 8)} ↗
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}
