import { PatchsetTable } from "@/components/patchset-table";
import { GeneratedStatus } from "@/components/generated-status";
import { SyncHealth } from "@/components/sync-health";
import { getMetadata, getPatchsets, getSyncRunState } from "@/lib/data/loader";

export default async function HomePage() {
  const [patchsets, metadata, syncRunState] = await Promise.all([getPatchsets(), getMetadata(), getSyncRunState()]);
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  const repositoryOwner = process.env.VERCEL_GIT_REPO_OWNER?.trim();
  const repositoryName = process.env.VERCEL_GIT_REPO_SLUG?.trim();
  const validCommitSha = commitSha && /^[0-9a-f]{40}$/i.test(commitSha) ? commitSha : undefined;
  const commitUrl = validCommitSha && repositoryOwner && repositoryName
    ? `https://github.com/${encodeURIComponent(repositoryOwner)}/${encodeURIComponent(repositoryName)}/commit/${validCommitSha}`
    : undefined;

  return (
    <>
      <section className="shell content-section">
        <div className="page-heading">
          <div>
            <h1>Patchsets</h1>
            <p>Tracking Linux Chinese documentation patches from lore to mainline.</p>
          </div>
          <GeneratedStatus className="heading-count" generatedAt={metadata.generatedAt} status={syncRunState.status} commitSha={validCommitSha} commitUrl={commitUrl} />
        </div>
        <SyncHealth metadata={metadata} runState={syncRunState} />
        <div className="status-guide" aria-label="Upstream status legend">
          <span className="guide-label">Evidence:</span>
          <span className="guide-item"><span className="light-dot light-confirmed" aria-hidden="true" />exact Git match</span>
          <span className="guide-item"><span className="light-dot light-candidate" aria-hidden="true" />candidate / partial / previous</span>
          <span className="guide-item"><span className="light-dot light-missing" aria-hidden="true" />not found</span>
        </div>
        <PatchsetTable patchsets={patchsets} />
      </section>
    </>
  );
}
