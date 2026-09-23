import { MessageBrowser, type MessageSummary } from "@/components/message-browser";
import { getPatchsetDetails } from "@/lib/data/loader";

export default async function MessagesPage() {
  const patchsets = await getPatchsetDetails();
  const messages = patchsets.flatMap((patchset) => patchset.patches.map((patch) => ({
    messageId: patch.messageId,
    subject: patch.subject,
    authorName: patchset.authorName,
    authorEmail: patchset.authorEmail,
    postedAt: patchset.postedAt,
    language: patchset.language,
    ...(patch.patchId ? { patchId: patch.patchId } : {}),
    changedFiles: patch.changedFiles,
    loreUrl: patch.loreUrl,
    seriesId: patchset.id,
    revision: patchset.revision,
    latestRevision: patchset.latestRevision,
    index: patch.index,
    total: patch.total,
    status: patchset.status,
    trees: patch.trees,
  } satisfies MessageSummary)));

  return (
    <>
      <section className="shell content-section">
        <div className="page-heading">
          <div><h1>Messages</h1><p>Search individual translation patches by subject, Message-ID, stable patch-id, author, or changed file.</p></div>
          <span className="heading-count">{messages.length} indexed messages</span>
        </div>
        <MessageBrowser messages={messages} />
      </section>
    </>
  );
}
