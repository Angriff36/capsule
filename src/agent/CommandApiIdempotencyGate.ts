/**
 * Idempotency gate for the external command API (backend spec §3.3).
 *
 * External retries must reuse ONE idempotency key so Convex
 * commandIdempotencyKeys can return the first result instead of making a
 * second write (a lost response would otherwise create two Clients). The
 * generated Convex HTTP dispatcher treats `idempotencyKey` as optional, so
 * the authored gateway is where a retryable external call must carry a key:
 * header `Idempotency-Key` first, else a JSON body `idempotencyKey` field.
 * Discovery (GET) never needs a key.
 */
export class CommandApiIdempotencyGate {
  private static readonly RETRYABLE_COMMAND_PATH =
    /^\/api\/manifest\/[^/]+\/commands\/[^/]+\/?$/;

  isRetryableExternalCommand(method: string, pathname: string): boolean {
    return (
      method === "POST" &&
      CommandApiIdempotencyGate.RETRYABLE_COMMAND_PATH.test(pathname)
    );
  }

  readKey(headers: Headers, bodyText: string): string | null {
    const headerKey = headers.get("Idempotency-Key")?.trim() ?? "";
    if (headerKey) return headerKey;
    return this.readBodyKey(bodyText);
  }

  applyToBody(bodyText: string, key: string): string {
    const parsed = this.parseJsonObject(bodyText);
    if (parsed === null) return JSON.stringify({ idempotencyKey: key });
    return JSON.stringify({ ...parsed, idempotencyKey: key });
  }

  private readBodyKey(bodyText: string): string | null {
    const parsed = this.parseJsonObject(bodyText);
    const value = parsed?.["idempotencyKey"];
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private parseJsonObject(bodyText: string): Record<string, unknown> | null {
    if (!bodyText.trim()) return null;
    try {
      const parsed: unknown = JSON.parse(bodyText);
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

export const commandApiIdempotencyGate = new CommandApiIdempotencyGate();
