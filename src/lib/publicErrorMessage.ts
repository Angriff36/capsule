import { ConvexError } from "convex/values";

/**
 * Safe error text for an UNAUTHENTICATED page (quote form, client portal,
 * proposal acceptance / share links).
 *
 * `Error.message` on a Convex action failure is the server's formatted string —
 * it embeds the internal module path, line/column and a request id, e.g.
 * "[CONVEX A(quoteBuilder:submitQuote)] [Request ID: …] Server Error Uncaught
 * ConvexError: … at handler (../convex/quoteBuilder.ts:112:8)". Rendering that
 * to a prospective client leaks internals and reads as a crash.
 *
 * A `ConvexError` carries the author's intended, already-sanitized message in
 * `.data`. Use it when it is a plain string; otherwise fall back to the
 * caller's generic copy. Never render a raw `Error.message` on a public page.
 */
export function publicErrorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof ConvexError) {
    const data: unknown = cause.data;
    if (typeof data === "string" && data.trim()) return data.trim();
    if (data && typeof data === "object" && "message" in data) {
      const message = (data as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message.trim();
    }
  }
  return fallback;
}
