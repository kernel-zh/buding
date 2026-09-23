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

import type { PatchsetStatus } from "@/lib/data/schema";

const statusLabels: Record<PatchsetStatus, string> = {
  proposed: "Proposed",
  "needs-revision": "Needs revision",
  superseded: "Superseded",
  approved: "Approved",
  rejected: "Rejected",
  applied: "Applied",
};

const statusClasses: Record<PatchsetStatus, string> = {
  proposed: "status-waiting",
  "needs-revision": "status-review",
  superseded: "status-updated",
  approved: "status-mainline",
  rejected: "status-terminal",
  applied: "status-mainline",
};

export function StatusBadge({ status }: { status: PatchsetStatus }) {
  return (
    <span className={`status-badge ${statusClasses[status]}`}>
      <span className="status-marker" aria-hidden="true">#</span>
      <span className="status-text">{statusLabels[status]}</span>
    </span>
  );
}

export function statusLabel(status: PatchsetStatus) {
  return statusLabels[status];
}
