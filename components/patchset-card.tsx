import Link from "next/link";
import type { PatchsetSummary } from "@/lib/data/schema";
import { LanguageBadge } from "./language-badge";
import { StatusBadge } from "./status-badge";
import { UpstreamLights } from "./upstream-lights";

const formatDate = (value: string) => new Date(value).toISOString().slice(0, 10);

export function PatchsetCard({ patchset }: { patchset: PatchsetSummary }) {
  return (
    <article className="patch-card">
      <div className="patch-card-head">
        <Link href={`/patchsets/${patchset.id}`} className="patch-card-title">
          {patchset.subject}
        </Link>
        <LanguageBadge language={patchset.language} />
      </div>
      <div className="patch-card-meta">
        <span className="patch-card-author">
          <span className="author-name">{patchset.authorName}</span>
          <span className="author-email">{patchset.authorEmail}</span>
        </span>
        <span>{formatDate(patchset.postedAt)}</span>
        <span>v{patchset.revision}</span>
      </div>
      <div className="patch-card-foot">
        <StatusBadge status={patchset.status} />
        <UpstreamLights trees={patchset.trees} compact />
      </div>
    </article>
  );
}
