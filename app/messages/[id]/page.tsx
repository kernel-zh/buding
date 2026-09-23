import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { LanguageBadge } from "@/components/language-badge";
import { PatchContent } from "@/components/patch-content";
import { Pipeline } from "@/components/pipeline";
import { StatusBadge } from "@/components/status-badge";
import { getPatchMessage } from "@/lib/data/loader";
import { messagePath } from "@/lib/messages/routing";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await getPatchMessage(id);
  return { title: data ? `${data.message.subject} · Buding` : "Patch not found · Buding" };
}

function formatDate(value: string): string {
  return `${new Date(value).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export default async function MessagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getPatchMessage(id);
  if (!data) notFound();

  const { message, patch, patchset, previous, next } = data;

  return (
    <section className="shell content-section detail-page message-detail-page">
      <nav className="back-nav message-detail-nav" aria-label="Patch navigation">
        <Link href="/messages">← Back to messages</Link>
        <span className="message-detail-nav-links">
          {patchset.patches.length > 1 && (previous
            ? <Link href={messagePath(previous.messageId)}>← Previous</Link>
            : <span className="disabled-link">← Previous</span>)}
          <Link href={`/patchsets/${patchset.id}`}>Series</Link>
          {patchset.patches.length > 1 && (next
            ? <Link href={messagePath(next.messageId)}>Next →</Link>
            : <span className="disabled-link">Next →</span>)}
        </span>
      </nav>

      <div className="detail-heading">
        <h1>{message.subject}</h1>
        <StatusBadge status={patchset.status} />
      </div>

      <div className="detail-overview section">
        <div className="detail-kv message-detail-meta">
          <div className="kv-row"><span className="kv-label">From:</span><span className="break-anywhere">{message.from.name} &lt;{message.from.email}&gt;</span></div>
          <div className="kv-row"><span className="kv-label">Date:</span><time dateTime={message.date}>{formatDate(message.date)}</time></div>
          <div className="kv-row">
            <span className="kv-label">Message-ID:</span>
            <span className="message-id-value"><span className="break-anywhere">{message.messageId}</span><CopyButton value={message.messageId} /></span>
          </div>
          <div className="kv-row"><span className="kv-label">Series:</span><span><Link className="text-link" href={`/patchsets/${patchset.id}`}>{patchset.subject}</Link></span></div>
          <div className="kv-row"><span className="kv-label">Patch:</span><span>v{patchset.revision} · {patch.index}/{patch.total}</span></div>
          <div className="kv-row"><span className="kv-label">Language:</span><span><LanguageBadge language={patchset.language} /></span></div>
          {patch.patchId && <div className="kv-row"><span className="kv-label">Patch-ID:</span><span className="break-anywhere">{patch.patchId}</span></div>}
          <div className="kv-row">
            <span className="kv-label">Files:</span>
            <span className="changed-files-list">{patch.changedFiles.map((file) => <code key={file}>{file}</code>)}</span>
          </div>
          <div className="kv-row">
            <span className="kv-label">Links:</span>
            <span><a className="text-link" href={message.loreUrl} target="_blank" rel="noreferrer">lore message ↗</a> · <a className="text-link" href={message.rawUrl} target="_blank" rel="noreferrer">raw mail ↗</a></span>
          </div>
        </div>
        <aside className="detail-upstream" aria-label="Upstream status">
          <h2>Upstream status</h2>
          <Pipeline trees={patch.trees} compact />
        </aside>
      </div>

      <section className="section">
        <h2>Patch content <span className="heading-meta">{patch.changedFiles.length} changed {patch.changedFiles.length === 1 ? "file" : "files"}</span></h2>
        <PatchContent body={message.body || "(no body)"} />
      </section>

      <nav className="message-detail-footer-nav" aria-label="Patch navigation">
        {previous ? <Link href={messagePath(previous.messageId)}>← {previous.index}/{previous.total}</Link> : <span />}
        <Link href={`/patchsets/${patchset.id}`}>Back to series</Link>
        {next ? <Link href={messagePath(next.messageId)}>{next.index}/{next.total} →</Link> : <span />}
      </nav>
    </section>
  );
}
