"use client";

import { useState } from "react";
import type { ManualPatchsetStatus } from "@/lib/data/schema";

const statuses: Array<{ value: ManualPatchsetStatus; label: string }> = [
  { value: "proposed", label: "Proposed" },
  { value: "needs-revision", label: "Needs revision" },
  { value: "superseded", label: "Superseded" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "applied", label: "Applied" },
];

export function ManualStatusControl({ patchsetId, currentStatus, currentReason }: { patchsetId: string; currentStatus: ManualPatchsetStatus; currentReason?: string }) {
  const [status, setStatus] = useState<ManualPatchsetStatus>(currentStatus);
  const [reason, setReason] = useState(currentReason ?? "");
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage(undefined);
    const response = await fetch(`/api/patchsets/${encodeURIComponent(patchsetId)}/status`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reason }) });
    const result = await response.json() as { error?: string };
    setBusy(false);
    if (!response.ok) return setMessage(result.error ?? (response.status === 401 ? "Enter an API Key from the navigation first." : "Could not set status."));
    setMessage("Manual status saved. Refreshing…");
    window.location.reload();
  }

  return (
    <section className="manual-status-control" aria-label="Authenticated manual patch status">
      <form onSubmit={save} className="manual-status-form">
        <label className="sr-only" htmlFor="manual-patch-status">Status</label>
        <select id="manual-patch-status" value={status} onChange={(event) => setStatus(event.target.value as ManualPatchsetStatus)}>{statuses.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
        <label className="sr-only" htmlFor="manual-patch-reason">Reason (optional)</label>
        <input id="manual-patch-reason" placeholder="Reason (optional)" value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
        <button className="control-button" disabled={busy}>{busy ? "Saving…" : "Save"}</button>
      </form>
      {message && <p className="section-help" role="status">{message}</p>}
    </section>
  );
}
