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

export type PatchLineKind = "context" | "added" | "removed" | "header";

const HEADER_PREFIXES = [
  "diff --git ",
  "index ",
  "--- ",
  "+++ ",
  "@@ ",
  "new file mode ",
  "deleted file mode ",
  "old mode ",
  "new mode ",
  "similarity index ",
  "dissimilarity index ",
  "rename from ",
  "rename to ",
  "copy from ",
  "copy to ",
];

export function patchLineKind(line: string): PatchLineKind {
  if (HEADER_PREFIXES.some((prefix) => line.startsWith(prefix))) return "header";
  if (line.startsWith("+") && !line.startsWith("+++")) return "added";
  if (line.startsWith("-") && !line.startsWith("---") && line.trim() !== "--") return "removed";
  return "context";
}
