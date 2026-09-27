/**
 * PL-AUTH (AC-151): a saved step answer replays only for the same caller with
 * the same access, while the reservation itself stays stable for the
 * workspace, so a retry never executes the step twice.
 *
 * Two layers:
 * - The RESERVATION (commandIdempotencyKeys.key) is worked out from the
 *   caller's workspace, the step name and the caller's retry key — never from
 *   who is signed in. The first run claims it; any later run with the same
 *   key finds the receipt and never re-executes the step, whoever sends it.
 * - The stored CALLER SCOPE (the sign-in, staff profile, role, role source
 *   and switched-off areas, kept in the row's command field after a "|") says
 *   what a hit returns. The same caller with the same access replays the full
 *   saved answer. A different caller never sees the saved answer and never
 *   re-executes the step: the run is refused with guidance to send a new key.
 *   A retry key that starts with "tenant-shared/" claims a TENANT-WORKFLOW
 *   receipt (import resume, inbox ingestion, payment sync — keys sent by the
 *   app's own flows, not by a person): another signed-in caller in the same
 *   workspace may recover the original record reference from it, because an
 *   operator handoff mid-workflow must not duplicate records.
 *
 * A signed-out caller, or a sign-in with no workspace, gets no reservation:
 * nothing is saved or replayed. A receipt saved before the reservation
 * rewrite (stored under the raw retry key, or for a tenant-shared key under
 * the same key without its prefix) cannot be attributed to a caller, so a
 * retry that hits one is refused with guidance instead of replayed or
 * re-executed.
 *
 * The regen patch scripts/apply-own-workspace-links.ts works the scope out
 * ONCE, before the step runs, and uses it for both lookup and store, so a
 * step that changes its caller's own access (deactivate yourself) still
 * saves under the access the caller had when it asked.
 */
import type { MutationCtx } from "../_generated/server";
import { getAuthContext } from "./authContext";

/** Retry-key prefix that claims a tenant-workflow receipt (operator handoff). */
export const SHARED_KEY_PREFIX = "tenant-shared/";

export type CommandIdempotencyScope = {
  /** The step name the receipt was saved for. */
  command: string;
  /** Stable per workspace + step + retry key; never per caller. */
  reservationKey: string;
  /** Who saved it: sign-in, profile, role and access at save time. */
  callerScope: string;
  /** Tenant-workflow receipt: another workspace caller may recover the id. */
  shared: boolean;
};

export type CommandIdempotencyHit =
  | { kind: "miss" }
  // `any` on purpose: the generated handlers save and replay whatever the
  // step returned, and callers type the result at their own call sites.
  | { kind: "replay"; result: any }
  | { kind: "refuse"; reason: string };

export const LEGACY_REFUSAL =
  "This retry key was used by an earlier version of the app, so its saved answer can no longer be replayed safely. Send the request again with a new key.";

const SCOPE_REFUSAL =
  "This retry key was already used by a different sign-in in this workspace, so its saved answer cannot be shown again. Send the request again with a new key.";

export async function commandIdempotencyScope(
  ctx: MutationCtx,
  command: string,
  key: string,
): Promise<CommandIdempotencyScope | null> {
  const auth = await getAuthContext(ctx);
  if (!auth.id || !auth.tenantId) return null;
  return {
    command,
    reservationKey: JSON.stringify([auth.tenantId, command, key]),
    callerScope: JSON.stringify([
      auth.id,
      auth.personId ?? "",
      auth.role,
      auth.roleSource,
      [...auth.disabledCapabilities].sort(),
    ]),
    shared: key.startsWith(SHARED_KEY_PREFIX),
  };
}

/**
 * Look a reservation up. A miss (including a receipt from the raw-key era,
 * which is refused rather than replayed) lets the step run; a hit answers
 * from the receipt and the step never runs again under that key.
 */
export async function lookupCommandIdempotency(
  ctx: MutationCtx,
  scope: CommandIdempotencyScope,
  rawKey: string,
): Promise<CommandIdempotencyHit> {
  const row = await ctx.db
    .query("commandIdempotencyKeys")
    .withIndex("by_key", (q) => q.eq("key", scope.reservationKey))
    .first();
  if (row === null) {
    // Raw-key era receipts: the key exactly as sent, and for a tenant-shared
    // key also the key without its prefix (the app's own flows sent those
    // unprefixed before the rename).
    const legacyKeys = scope.shared
      ? [rawKey, rawKey.slice(SHARED_KEY_PREFIX.length)]
      : [rawKey];
    for (const legacyKey of legacyKeys) {
      const legacy = await ctx.db
        .query("commandIdempotencyKeys")
        .withIndex("by_key", (q) => q.eq("key", legacyKey))
        .first();
      if (legacy !== null) return { kind: "refuse", reason: LEGACY_REFUSAL };
    }
    return { kind: "miss" };
  }
  if (row.command === `${scope.command}|${scope.callerScope}`) {
    return { kind: "replay", result: row.result };
  }
  if (scope.shared) {
    // Operator handoff: recover the original record reference, never the
    // saved answer. create steps answer { _id, ...doc }, createVia steps
    // { docId } — hand back both names for the one original record.
    const record = recordReference(row.result);
    if (record !== null) return { kind: "replay", result: record };
  }
  return { kind: "refuse", reason: SCOPE_REFUSAL };
}

function recordReference(result: unknown): {
  docId: string;
  _id: string;
} | null {
  if (typeof result !== "object" || result === null) return null;
  const id =
    (result as { docId?: unknown }).docId ?? (result as { _id?: unknown })._id;
  return typeof id === "string" ? { docId: id, _id: id } : null;
}

export async function saveCommandIdempotency(
  ctx: MutationCtx,
  scope: CommandIdempotencyScope,
  result: unknown,
): Promise<void> {
  const existing = await ctx.db
    .query("commandIdempotencyKeys")
    .withIndex("by_key", (q) => q.eq("key", scope.reservationKey))
    .first();
  if (existing !== null) return;
  await ctx.db.insert("commandIdempotencyKeys", {
    key: scope.reservationKey,
    command: `${scope.command}|${scope.callerScope}`,
    result,
    createdAt: Date.now(),
  });
}
