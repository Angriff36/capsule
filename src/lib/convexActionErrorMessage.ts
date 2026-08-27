import { ConvexError } from "convex/values";

/**
 * Human-readable copy for signed-in staff UI when a Convex action fails.
 * Prefer ConvexError payloads; otherwise peel the author message out of the
 * formatted `[CONVEX A(...)] Server Error Uncaught Error: …` wrapper.
 */
export function convexActionErrorMessage(
  cause: unknown,
  fallback: string,
): string {
  if (cause instanceof ConvexError) {
    const data: unknown = cause.data;
    if (typeof data === "string" && data.trim()) return data.trim();
    if (data && typeof data === "object" && "message" in data) {
      const message = (data as { message?: unknown }).message;
      if (typeof message === "string" && message.trim()) return message.trim();
    }
  }
  if (cause instanceof Error) {
    const uncaught = cause.message.match(
      /Uncaught (?:ConvexError|Error): ([^\n]+)/,
    );
    if (uncaught?.[1]?.trim()) return uncaught[1].trim();
    if (!cause.message.includes("[CONVEX")) return cause.message;
  }
  return fallback;
}
