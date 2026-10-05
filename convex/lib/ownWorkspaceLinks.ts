/**
 * PL-AUTH (AC-151): a caller may only link records of its own workspace.
 *
 * Generated create and change steps store the record ids a caller sends
 * (eventId, componentId, assignedToId ...) without looking them up, so a
 * signed-in caller could save its own record pointing at another workspace's
 * record, and reactions keyed by that id then read the other workspace's
 * data into it. scripts/apply-own-workspace-links.ts calls this at the start
 * of every public generated mutation with the names of the step's inputs the
 * Manifest declares as record links (type uuid or list of uuid, or a field of
 * a declared ref / belongsTo link). Other text inputs are never looked at, so
 * codes and outside-system ids pass untouched.
 *
 * Two kinds of link input (the regen patch works the kind out from the
 * Manifest IR):
 *  - `table` set: the field is a declared ref / belongsTo reference. The id
 *    must parse as a record id of exactly that table. Malformed, wrong-table,
 *    missing and other-workspace ids all get the same answer, so the refusal
 *    does not tell what exists elsewhere.
 *  - `table` null: a bare uuid field. Its schema column is a plain string
 *    because it also holds outside-system ids (imports), so a value that
 *    resolves to no record anywhere passes untouched; one that resolves to a
 *    record must be in the caller's workspace.
 *
 * A linked value that is a record id must name a live-or-soft-deleted record
 * of the caller's workspace; another workspace's record and a missing record
 * get the same answer, so the refusal does not tell what exists elsewhere.
 */
import type { MutationCtx } from "../_generated/server";
import schema from "../schema";
import { getAuthContext } from "./authContext";

export type LinkParam = { name: string; table: string | null };

const TABLES = Object.keys(schema.tables);
const NOT_FOUND = "A linked record was not found";

export async function assertOwnWorkspaceLinks(
  ctx: MutationCtx,
  args: Record<string, unknown>,
  links: readonly LinkParam[],
): Promise<void> {
  const inputs: { table: string | null; values: string[] }[] = [];
  for (const link of links) {
    const value = args[link.name];
    const values: string[] = [];
    if (typeof value === "string") values.push(value);
    else if (Array.isArray(value)) {
      for (const item of value) if (typeof item === "string") values.push(item);
    }
    if (values.length > 0) inputs.push({ table: link.table, values });
  }
  if (inputs.length === 0) return;
  let tenant: string | null | undefined;
  for (const input of inputs) {
    for (const text of input.values) {
      if (input.table !== null) {
        // Declared reference: malformed and wrong-table ids fail closed.
        if (ctx.db.normalizeId(input.table as never, text) === null) {
          throw new Error(NOT_FOUND);
        }
      } else {
        const anyTable = TABLES.find(
          (name) => ctx.db.normalizeId(name as never, text) !== null,
        );
        // A bare uuid that resolves to no record anywhere is an
        // outside-system id (an import), never a record of ours.
        if (anyTable === undefined) continue;
      }
      if (tenant === undefined) {
        const auth = (await getAuthContext(ctx)) as {
          tenantId?: string | null;
        };
        tenant = auth.tenantId ?? null;
      }
      // Signed out: each step's own sign-in check answers.
      if (tenant === null) return;
      const row = (await ctx.db.get(text as never)) as {
        tenantId?: string | null;
      } | null;
      if (!row || (row.tenantId != null && row.tenantId !== tenant)) {
        throw new Error(NOT_FOUND);
      }
    }
  }
}
