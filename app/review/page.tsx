import { NeedsReviewTable } from "@/components/needs-review-table";
import { getPatchsetDetails } from "@/lib/data/loader";
import { buildReviewQueue } from "@/lib/review/queue";

export default async function NeedsReviewPage() {
  const items = buildReviewQueue(await getPatchsetDetails());
  const untouched = items.filter((item) => item.reviewState === "waiting").length;

  return (
    <section className="shell content-section">
      <div className="page-heading">
        <div>
          <h1>Needs review</h1>
          <p>Active latest revisions not yet found in Alex&apos;s docs-next. Newest series appear first.</p>
        </div>
        <span className="heading-count">{untouched} without external replies · {items.length} total</span>
      </div>
      <div className="review-note">“Discussion started” means someone other than the patch author replied; it does not mean the review is complete.</div>
      <NeedsReviewTable items={items} />
    </section>
  );
}
