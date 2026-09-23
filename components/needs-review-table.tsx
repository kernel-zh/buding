"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Language, PatchsetReviewState } from "@/lib/data/schema";
import type { ReviewQueueItem } from "@/lib/review/queue";
import { messagePath } from "@/lib/messages/routing";
import { LanguageBadge } from "./language-badge";
import { UpstreamLights } from "./upstream-lights";

const formatDate = (value: string) => new Date(value).toISOString().slice(0, 10);

export function NeedsReviewTable({ items }: { items: ReviewQueueItem[] }) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<"all" | Language>("all");
  const [activity, setActivity] = useState<"all" | PatchsetReviewState>("all");
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items.filter((item) => (
      (!needle || [item.subject, item.authorName, item.authorEmail, item.openMessageId].join(" ").toLocaleLowerCase().includes(needle))
      && (language === "all" || item.language === language)
      && (activity === "all" || item.reviewState === activity)
    ));
  }, [activity, items, language, query]);

  return (
    <>
      <div className="controls">
        <select className="filter" aria-label="Filter by language" value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}>
          <option value="all">All languages</option>
          <option value="zh_CN">zh_CN</option>
          <option value="zh_TW">zh_TW</option>
          <option value="mixed">Mixed</option>
        </select>
        <label className="search-wrap">
          <span className="sr-only">Search review queue</span>
          <input className="search-input" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search subject, author, email, Message-ID" />
        </label>
        <button className="control-button" type="button" disabled={!query} onClick={() => setQuery("")}>Clear</button>
        <select className="filter" aria-label="Filter by review activity" value={activity} onChange={(event) => setActivity(event.target.value as typeof activity)}>
          <option value="all">All review activity</option>
          <option value="waiting">No external replies</option>
          <option value="discussion">Discussion started</option>
        </select>
      </div>

      {visible.length ? (
        <>
          <div className="table-shell">
            <table className="patch-table review-table">
              <colgroup>
                <col className="review-subject-column" />
                <col className="patchset-author-column" />
                <col className="patchset-date-column" />
                <col className="patchset-version-column" />
                <col className="patchset-language-column" />
                <col className="review-activity-column" />
                <col className="review-upstream-column" />
                <col className="review-action-column" />
              </colgroup>
              <thead><tr><th>Subject</th><th>Author</th><th>Date</th><th className="version-heading">Version</th><th>Lang</th><th>Review activity</th><th>Upstream</th><th>Action</th></tr></thead>
              <tbody>
                {visible.map((item) => (
                  <tr key={item.id}>
                    <td><Link className="subject-link" href={`/patchsets/${item.id}`}>{item.subject}</Link></td>
                    <td className="author-cell"><span className="author-name">{item.authorName}</span><span className="author-email">{item.authorEmail}</span></td>
                    <td className="nowrap date-cell">{formatDate(item.postedAt)}</td>
                    <td className="version-cell">v{item.revision}</td>
                    <td><LanguageBadge language={item.language} /></td>
                    <td>
                      <span className={`review-activity review-${item.reviewState}`}>{item.reviewState === "waiting" ? "No external replies" : `${item.reviewReplies} external ${item.reviewReplies === 1 ? "reply" : "replies"}`}</span>
                      <span className="review-progress">Reviewed/Acked {item.reviewedPatches}/{item.patchCount}</span>
                    </td>
                    <td><UpstreamLights trees={item.trees} /></td>
                    <td><div className="review-action-wrap"><Link className="control-button nowrap" href={messagePath(item.openMessageId)}>Review →</Link></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mobile-list">
            {visible.map((item) => (
              <article className="patch-card" key={item.id}>
                <Link className="patch-card-title" href={`/patchsets/${item.id}`}>{item.subject}</Link>
                <div className="patch-card-meta"><span>{item.authorName}</span><span>{formatDate(item.postedAt)}</span><span>v{item.revision}</span><LanguageBadge language={item.language} /></div>
                <div className="review-mobile-foot"><span>{item.reviewState === "waiting" ? "No external replies" : `${item.reviewReplies} external replies`}</span><Link className="control-button" href={messagePath(item.openMessageId)}>Review →</Link></div>
              </article>
            ))}
          </div>
          <div className="stats"><strong>{visible.length}</strong> of {items.length} active latest series need review</div>
        </>
      ) : <div className="panel empty-state">No patch series match these filters.</div>}
    </>
  );
}
