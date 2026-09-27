/**
 * PL-AUTH (AC-151): a caller may only link records of its own workspace.
 *
 * Generated create and change steps store the record ids a caller sends
 * (eventId, componentId, assignedToId ...) without looking them up, so a
 * signed-in caller could save its own record pointing at another workspace's
 * record, and reactions keyed by that id then read the other workspace's
 * data into it. scripts/apply-own-workspace-links.ts calls this at the start
 * of every public generated mutation. Every text value in the arguments that
 * is a record id must name a live-or-soft-deleted record of the caller's
 * workspace; another workspace's record and a missing record get the same
 * answer, so the refusal does not tell what exists elsewhere.
 */
import type { MutationCtx } from "../_generated/server";
import schema from "../schema";
import { getAuthContext } from "./authContext";

const TABLES = Object.keys(schema.tables);

/** docId is checked by each step itself, with its own "not found" answer. */
const SKIP = new Set(["docId", "version", "idempotencyKey"]);

function texts(value: unknown, out: string[]): void {
  if (typeof value === "string") {
    if (value.length > 0 && value.length <= 64 && !/\s/.test(value))
      out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) texts(item, out);
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) texts(item, out);
  }
}

export async function assertOwnWorkspaceLinks(
  ctx: MutationCtx,
  args: Record<string, unknown>,
): Promise<void> {
  const candidates: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (!SKIP.has(key)) texts(value, candidates);
  }
  if (candidates.length === 0) return;
  let tenantId: string | null | undefined;
  for (const text of candidates) {
    const table = TABLES.find(
      (name) => ctx.db.normalizeId(name as never, text) !== null,
    );
    if (!table) continue;
    if (tenantId === undefined) {
      const auth = (await getAuthContext(ctx)) as { tenantId?: string | null };
      tenantId = auth.tenantId ?? null;
    }
    // Signed out: each step's own sign-in check answers.
    if (tenantId === null) return;
    const row = (await ctx.db.get(text as never)) as {
      tenantId?: string | null;
    } | null;
    if (!row || (row.tenantId != null && row.tenantId !== tenantId)) {
      throw new Error("A linked record was not found");
    }
  }
}
