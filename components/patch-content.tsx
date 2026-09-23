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

import { patchLineKind } from "@/lib/messages/content";

export function PatchContent({ body }: { body: string }) {
  return (
    <pre className="patch-content" aria-label="Patch email content">
      {body.split("\n").map((line, index) => (
        <span className={`patch-content-line patch-content-${patchLineKind(line)}`} key={index}>
          {line || " "}
        </span>
      ))}
    </pre>
  );
}
