// Only allow redirects to pages inside this app (never to another website).
export function safeNext(next: string | null | undefined, fallback = "/crews"): string {
  if (!next) return fallback;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) {
    return fallback;
  }
  return next;
}
