import type { TreeId, TreeSummary } from "@/lib/data/schema";
import { TRACKED_TREES, treeCommitUrl } from "@/lib/git/config";

const stateLabels: Record<TreeSummary["state"], string> = {
  confirmed: "confirmed",
  partial: "partially confirmed",
  candidate: "candidate match",
  "previously-present": "previously present",
  missing: "not found",
};

export function UpstreamLights({ trees, compact = false }: { trees: Record<TreeId, TreeSummary>; compact?: boolean }) {
  return (
    <div className="lights" role="group" aria-label="Upstream tree status">
      {TRACKED_TREES.map((trackedTree) => {
        const tree = trees[trackedTree.id];
        const description = `${trackedTree.name} ${trackedTree.branch}: ${stateLabels[tree.state]}, ${tree.matched} of ${tree.total} patches`;
        const content = (
          <>
            <span className={`light-dot light-${tree.state}`} aria-hidden="true" />
            <span className="sr-only">{stateLabels[tree.state]}</span>
            {!compact && <span className="light-label">{trackedTree.name}</span>}
            {!compact && <span className="light-count">{tree.matched}/{tree.total}</span>}
          </>
        );
        return tree.commit ? (
          <a className="light-item light-link" href={treeCommitUrl(trackedTree.id, tree.commit)} key={trackedTree.id} title={`${description}; open commit ${tree.commit}`} aria-label={`${description}; open matching commit`} target="_blank" rel="noreferrer">
            {content}
          </a>
        ) : (
          <span className="light-item" key={trackedTree.id} title={description} aria-label={description}>{content}</span>
        );
      })}
    </div>
  );
}
