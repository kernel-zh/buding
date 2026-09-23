import Link from "next/link";
import { notFound } from "next/navigation";
import { LanguageBadge } from "@/components/language-badge";
import { Pipeline } from "@/components/pipeline";
import { StatusBadge } from "@/components/status-badge";
import { UpstreamLights } from "@/components/upstream-lights";
import { ManualStatusControl } from "@/components/manual-status-control";
import { getPatchset } from "@/lib/data/loader";
import { messagePath } from "@/lib/messages/routing";

export default async function PatchsetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patchset = await getPatchset(id);
  if (!patchset) notFound();

  const postedAt = new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeStyle: "short" }).format(new Date(patchset.postedAt));

  return (
    <section className="shell content-section detail-page">
      <div className="back-nav"><Link href="/">← Back to patchsets</Link></div>
      <div className="detail-heading">
        <h1>{patchset.subject}</h1>
        <StatusBadge status={patchset.status} />
      </div>

      <div className="detail-overview section">
        <div className="detail-kv">
          <div className="kv-row"><span className="kv-label">Author:</span><span>{patchset.authorName} &lt;{patchset.authorEmail}&gt;</span></div>
          <div className="kv-row"><span className="kv-label">Date:</span><span>{postedAt}</span></div>
          <div className="kv-row"><span className="kv-label">Language:</span><span><LanguageBadge language={patchset.language} /></span></div>
          <div className="kv-row"><span className="kv-label">Version:</span><span>v{patchset.revision}{patchset.latestRevision ? " · latest" : " · newer revision available"}</span></div>
          <div className="kv-row"><span className="kv-label">RFC:</span><span>{patchset.rfc ? "Yes" : "No"}</span></div>
          <div className="kv-row"><span className="kv-label">Patches:</span><span>{patchset.patchCount} · {patchset.replies} replies</span></div>
          <div className="kv-row"><span className="kv-label">Review:</span><span>{patchset.reviewState === "waiting" ? "No external replies" : `${patchset.reviewReplies} external ${patchset.reviewReplies === 1 ? "reply" : "replies"}`}</span></div>
          <div className="kv-row"><span className="kv-label">Lifecycle:</span><span>{patchset.lifecycle}</span></div>
          <div className="kv-row"><span className="kv-label">Message-ID:</span><span className="break-anywhere">{patchset.messageIds[0]}</span></div>
          <div className="kv-row"><span className="kv-label">Links:</span><span><a className="text-link" href={patchset.loreUrl} target="_blank" rel="noreferrer">lore thread ↗</a> · <a className="text-link" href={patchset.rawUrl} target="_blank" rel="noreferrer">raw mail ↗</a></span></div>
        </div>
        <aside className="detail-upstream" aria-label="Upstream status">
          <h2>Upstream status</h2>
          <Pipeline trees={patchset.trees} compact />
        </aside>
      </div>

      <section className="section">
        <h2>Patch status</h2>
        <ManualStatusControl patchsetId={patchset.id} currentStatus={patchset.status} currentReason={patchset.manualStatus?.reason} />
      </section>

      <section className="section">
        <h2>Series patches <span className="heading-meta">{patchset.patchCount} total</span></h2>
        <ol className="patch-list">
          {patchset.patches.map((patch) => (
            <li className="patch-row" key={patch.messageId}>
              <span className="patch-number">{patch.index}/{patch.total}</span>
              <div>
                <Link className="patch-subject text-link" href={messagePath(patch.messageId)}>{patch.subject}</Link>
                {Boolean(patch.trailers?.length) && (
                  <div className="trailer-list" aria-label="Review trailers">
                    {patch.trailers?.map((trailer) => (
                      <span className="trailer" key={`${trailer.type}-${trailer.value}`} title={`Observed in ${trailer.messageId}`}>
                        <strong>{trailer.type}</strong> {trailer.value}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <UpstreamLights trees={patch.trees} compact />
            </li>
          ))}
        </ol>
      </section>

      <section className="section versions-section">
        <h2>Versions</h2>
        <div className="version-list">
          {patchset.versions.map((version) => (
            <Link key={version.id} className={`version-chip ${version.current ? "version-current" : ""}`} href={`/patchsets/${version.id}`}>
              v{version.revision}{version.current ? " selected" : ""}
            </Link>
          ))}
        </div>
      </section>
    </section>
  );
}
