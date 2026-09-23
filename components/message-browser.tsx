/*
 * Portions of this file are adapted from Sashiko:
 * https://github.com/sashiko-dev/sashiko
 *
 * Copyright The Linux Foundation and its contributors. All rights reserved.
 * Licensed under the Apache License, Version 2.0.
 * See LICENSES/Apache-2.0.txt and THIRD_PARTY_NOTICES.
 *
 * Modified for Buding in 2026.
 */

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Language, PatchsetStatus, TreeId, TreeSummary } from "@/lib/data/schema";
import { messagePath } from "@/lib/messages/routing";
import { LanguageBadge } from "./language-badge";
import { StatusBadge } from "./status-badge";
import { UpstreamLights } from "./upstream-lights";

export interface MessageSummary {
  messageId: string;
  subject: string;
  authorName: string;
  authorEmail: string;
  postedAt: string;
  language: Language;
  patchId?: string;
  changedFiles: string[];
  loreUrl: string;
  seriesId: string;
  revision: number;
  latestRevision: boolean;
  index: number;
  total: number;
  status: PatchsetStatus;
  trees: Record<TreeId, TreeSummary>;
}

const formatDate = (value: string) => new Date(value).toISOString().slice(0, 10);

type StatusFilter = "all" | PatchsetStatus;

const statusMatches = (status: PatchsetStatus, filter: StatusFilter) => {
  if (filter === "all") return true;
  return status === filter;
};

export function MessageBrowser({ messages }: { messages: MessageSummary[] }) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<"all" | Language>("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [versions, setVersions] = useState<"latest" | "all">("latest");
  const [limit, setLimit] = useState(100);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return messages.filter((message) => {
      const haystack = [
        message.subject,
        message.messageId,
        message.authorName,
        message.authorEmail,
        message.patchId ?? "",
        ...message.changedFiles,
      ].join(" ").toLocaleLowerCase();
      return (!needle || haystack.includes(needle))
        && (language === "all" || message.language === language)
        && statusMatches(message.status, status)
        && (versions === "all" || message.latestRevision);
    });
  }, [language, messages, query, status, versions]);
  const displayed = visible.slice(0, limit);

  return (
    <>
      <div className="controls">
        <select className="filter" aria-label="Filter messages by language" value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}>
          <option value="all">All languages</option>
          <option value="zh_CN">zh_CN</option>
          <option value="zh_TW">zh_TW</option>
          <option value="mixed">Mixed</option>
        </select>
        <label className="search-wrap">
          <span className="sr-only">Search patch messages</span>
          <input
            className="search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search subject, Message-ID, patch-id, file"
          />
        </label>
        <button className="control-button" type="button" disabled={!query} onClick={() => setQuery("")}>Clear</button>
        <select className="filter" aria-label="Filter messages by status" value={status} onChange={(event) => {
          const nextStatus = event.target.value as StatusFilter;
          setStatus(nextStatus);
          if (nextStatus === "superseded") setVersions("all");
          setLimit(100);
        }}>
          <option value="all">All statuses</option>
          <option value="proposed">Proposed</option>
          <option value="needs-revision">Needs revision</option>
          <option value="superseded">Superseded</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="applied">Applied</option>
        </select>
        <select className="filter" aria-label="Filter messages by series version" value={versions} onChange={(event) => setVersions(event.target.value as typeof versions)}>
          <option value="latest">Latest only</option>
          <option value="all">All revisions</option>
        </select>
        <span className="control-spacer" />
        <Link className="control-button" href="/">Patchsets</Link>
        <Link className="control-button active" href="/messages">Messages</Link>
      </div>

      {visible.length ? (
        <>
          <div className="table-shell message-table-shell">
            <table className="patch-table message-table">
              <colgroup>
                <col className="message-subject-column" />
                <col className="patchset-author-column" />
                <col className="patchset-date-column" />
                <col className="patchset-version-column" />
                <col className="patchset-language-column" />
                <col className="patchset-status-column" />
                <col className="patchset-upstream-column" />
              </colgroup>
              <thead><tr><th>Subject</th><th>Author</th><th>Date</th><th className="version-heading">Version</th><th>Lang</th><th>Status</th><th>Upstream</th></tr></thead>
              <tbody>
                {displayed.map((message) => (
                  <tr key={message.messageId}>
                    <td>
                      <Link className="subject-link" href={messagePath(message.messageId)}>{message.subject}</Link>
                      <span className="subline message-reference">
                        <span className="message-reference-id" title={message.messageId}>{message.messageId}</span>
                        <span className="message-reference-details">
                          {message.patchId ? `patch-id ${message.patchId.slice(0, 10)} · ` : ""}
                          <Link className="text-link" href={`/patchsets/${message.seriesId}`}>series</Link>
                        </span>
                      </span>
                    </td>
                    <td className="author-cell"><span className="author-name">{message.authorName}</span><span className="author-email">{message.authorEmail}</span></td>
                    <td className="nowrap mono date-cell">{formatDate(message.postedAt)}</td>
                    <td className="nowrap mono version-cell">v{message.revision} · {message.index}/{message.total}</td>
                    <td><LanguageBadge language={message.language} /></td>
                    <td className="status-cell"><StatusBadge status={message.status} /></td>
                    <td><UpstreamLights trees={message.trees} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mobile-list message-mobile-list">
            {displayed.map((message) => (
              <article className="message-card" key={message.messageId}>
                <div className="patch-card-head">
                  <Link className="patch-card-title" href={messagePath(message.messageId)}>{message.subject}</Link>
                  <LanguageBadge language={message.language} />
                </div>
                <div className="message-id" title={message.messageId}>{message.messageId}</div>
                <div className="patch-card-meta">
                  <span className="patch-card-author"><span className="author-name">{message.authorName}</span><span className="author-email">{message.authorEmail}</span></span>
                  <span>{formatDate(message.postedAt)}</span>
                  <span>v{message.revision} · {message.index}/{message.total}</span>
                  <Link className="text-link" href={`/patchsets/${message.seriesId}`}>series</Link>
                </div>
                <div className="patch-card-foot"><StatusBadge status={message.status} /><UpstreamLights trees={message.trees} compact /></div>
              </article>
            ))}
          </div>
          {displayed.length < visible.length && (
            <div className="message-more">
              <button className="load-more" type="button" onClick={() => setLimit((value) => value + 100)}>
                Show 100 more
              </button>
            </div>
          )}
          <div className="stats" aria-live="polite"><strong>{displayed.length}</strong> shown · {visible.length} matching · {messages.length} total messages</div>
        </>
      ) : (
        <div className="panel empty-state">No patch messages match these filters.</div>
      )}
    </>
  );
}
