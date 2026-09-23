export function messageRouteId(messageId: string): string {
  const bare = messageId.startsWith("<") && messageId.endsWith(">")
    ? messageId.slice(1, -1)
    : messageId;
  return [...new TextEncoder().encode(bare)]
    .map((byte) => {
      const character = String.fromCharCode(byte);
      return /^[a-z0-9.-]$/i.test(character) ? character : `_${byte.toString(16).padStart(2, "0")}`;
    })
    .join("");
}

export function messagePath(messageId: string): string {
  return `/messages/${messageRouteId(messageId)}`;
}
