const LORE_BASE_URL = "https://lore.kernel.org/linux-doc/";

// Keep RFC 3986 path-segment characters readable so tools such as b4 can
// recognize the Message-ID directly. Delimiters that can change URL structure
// (/, ?, # and %) remain percent-encoded.
const READABLE_PATH_CHARACTERS: Record<string, string> = {
  "%24": "$",
  "%26": "&",
  "%2B": "+",
  "%2C": ",",
  "%3A": ":",
  "%3B": ";",
  "%3D": "=",
  "%40": "@",
};

export function loreMessagePathSegment(messageId: string): string {
  const bare = messageId.startsWith("<") && messageId.endsWith(">")
    ? messageId.slice(1, -1)
    : messageId;
  return encodeURIComponent(bare).replace(/%[0-9A-F]{2}/gi, (encoded) => (
    READABLE_PATH_CHARACTERS[encoded.toLocaleUpperCase()] ?? encoded.toLocaleUpperCase()
  ));
}

export function loreMessageUrls(messageId: string, loreBaseUrl = LORE_BASE_URL) {
  const base = loreBaseUrl.endsWith("/") ? loreBaseUrl : `${loreBaseUrl}/`;
  const path = loreMessagePathSegment(messageId);
  return {
    loreUrl: `${base}${path}/`,
    rawUrl: `${base}${path}/raw`,
  };
}

export function canonicalLoreMessageUrls(
  messageId: string,
  loreUrl: string,
  rawUrl: string,
): { loreUrl: string; rawUrl: string } {
  try {
    const parsed = new URL(loreUrl);
    if (parsed.hostname === "lore.kernel.org" && parsed.pathname.startsWith("/linux-doc/")) {
      return loreMessageUrls(messageId);
    }
  } catch {
    // Validation elsewhere reports malformed URLs; keep the original values.
  }
  return { loreUrl, rawUrl };
}
