import { normalizeMessageId } from "./parser.ts";
import type { LoreMessage } from "./types";
import { loreMessageUrls } from "./url.ts";

function decodeQuotedPrintable(value: string): Buffer {
  const unfolded = value.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let index = 0; index < unfolded.length; index += 1) {
    if (unfolded[index] === "=" && /^[0-9a-f]{2}$/i.test(unfolded.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(unfolded.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(unfolded.charCodeAt(index));
    }
  }
  return Buffer.from(bytes);
}

function decodeBytes(bytes: Buffer, charset: string): string {
  const normalized = charset.toLocaleLowerCase().replace(/["']/g, "");
  try {
    return new TextDecoder(normalized === "us-ascii" ? "utf-8" : normalized).decode(bytes);
  } catch {
    return bytes.toString("utf8");
  }
}

export function decodeMimeHeader(value: string): string {
  return value.replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (_whole, charset: string, encoding: string, encoded: string) => {
    const bytes = encoding.toLocaleLowerCase() === "b"
      ? Buffer.from(encoded, "base64")
      : decodeQuotedPrintable(encoded.replace(/_/g, " "));
    return decodeBytes(bytes, charset);
  });
}

function parseHeaders(value: string): Map<string, string> {
  const headers = new Map<string, string>();
  const unfolded = value.replace(/\r?\n[\t ]+/g, " ");
  for (const line of unfolded.split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 1) continue;
    const name = line.slice(0, separator).trim().toLocaleLowerCase();
    const content = line.slice(separator + 1).trim();
    headers.set(name, headers.has(name) ? `${headers.get(name)}, ${content}` : content);
  }
  return headers;
}

function headerParameter(value: string, name: string): string | undefined {
  const match = value.match(new RegExp(`(?:^|;)\\s*${name}=(?:"([^"]+)"|([^;\\s]+))`, "i"));
  return match?.[1] ?? match?.[2];
}

function decodeBody(headers: Map<string, string>, body: string): string {
  const contentType = headers.get("content-type") ?? "text/plain; charset=utf-8";
  const boundary = headerParameter(contentType, "boundary");
  if (/^multipart\//i.test(contentType) && boundary) {
    const parts = body.split(`--${boundary}`).slice(1, -1);
    const decoded = parts.map((part) => {
      const separator = part.search(/\r?\n\r?\n/);
      if (separator < 0) return "";
      const lineBreakLength = part.slice(separator).startsWith("\r\n\r\n") ? 4 : 2;
      const partHeaders = parseHeaders(part.slice(0, separator));
      const partType = partHeaders.get("content-type") ?? "text/plain";
      if (!/^text\/plain/i.test(partType) && !/^multipart\//i.test(partType)) return "";
      return decodeBody(partHeaders, part.slice(separator + lineBreakLength));
    }).filter(Boolean);
    return decoded.join("\n");
  }

  const transferEncoding = headers.get("content-transfer-encoding")?.toLocaleLowerCase();
  const bytes = transferEncoding === "base64"
    ? Buffer.from(body.replace(/\s/g, ""), "base64")
    : transferEncoding === "quoted-printable"
      ? decodeQuotedPrintable(body)
      : Buffer.from(body, "utf8");
  return decodeBytes(bytes, headerParameter(contentType, "charset") ?? "utf-8").replace(/^>From /gm, "From ");
}

function parseAddress(value: string): { name: string; email: string } {
  const decoded = decodeMimeHeader(value);
  const angle = decoded.match(/^(.*?)\s*<([^<>\s]+)>\s*$/);
  if (angle) return { name: angle[1].replace(/^"|"$/g, "").trim() || angle[2], email: angle[2] };
  const email = decoded.match(/[\w.+-]+@[\w.-]+/)?.[0] ?? "unknown@example.invalid";
  return { name: decoded.replace(email, "").replace(/[<>]/g, "").trim() || email, email };
}

export function parseRfc822Message(raw: string, loreBaseUrl = "https://lore.kernel.org/linux-doc/"): LoreMessage {
  const separator = raw.search(/\r?\n\r?\n/);
  if (separator < 0) throw new Error("Malformed message: missing header separator");
  const lineBreakLength = raw.slice(separator).startsWith("\r\n\r\n") ? 4 : 2;
  const headers = parseHeaders(raw.slice(0, separator));
  const rawMessageId = headers.get("message-id");
  if (!rawMessageId) throw new Error("Malformed message: missing Message-ID");
  const messageId = normalizeMessageId(rawMessageId.match(/<[^<>\s]+>/)?.[0] ?? rawMessageId);
  const urls = loreMessageUrls(messageId, loreBaseUrl);
  const dateValue = headers.get("date") ?? "";
  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) throw new Error(`Malformed message ${messageId}: invalid Date`);
  const references = (headers.get("references")?.match(/<[^<>\s]+>/g) ?? []).map(normalizeMessageId);
  const inReplyToMatch = headers.get("in-reply-to")?.match(/<[^<>\s]+>/)?.[0];
  return {
    messageId,
    subject: decodeMimeHeader(headers.get("subject") ?? "(no subject)"),
    from: parseAddress(headers.get("from") ?? "unknown@example.invalid"),
    date: parsedDate.toISOString(),
    ...(inReplyToMatch ? { inReplyTo: normalizeMessageId(inReplyToMatch) } : {}),
    references,
    body: decodeBody(headers, raw.slice(separator + lineBreakLength)).trimEnd(),
    ...urls,
  };
}

export function parseMboxrd(value: string, loreBaseUrl?: string): LoreMessage[] {
  const normalized = value.replace(/\r\n/g, "\n");
  const chunks = normalized.split(/^From [^\n]*\n/gm).filter((chunk) => chunk.trim());
  return chunks.map((chunk) => parseRfc822Message(chunk, loreBaseUrl));
}
