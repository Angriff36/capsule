/**
 * PL-AUTH (AC-151): a saved step answer replays only for the same caller with
 * the same access, in the same workspace, for the same step.
 *
 * Generated mutations keep each answer under the caller's idempotency key so
 * a retry gets the first answer back, and the saved answer is returned before
 * the step checks the caller's role. So the scoped key carries everything the
 * step's checks read from the sign-in: workspace, sign-in id, staff profile,
 * role and the company's switched-off areas. A different person, a removed or
 * unlinked person, or the same person after a role or area change gets a
 * different key and the step runs its checks fresh. A signed-out caller, or a
 * sign-in with no workspace, gets no key: nothing is saved or replayed.
 *
 * The regen patch scripts/apply-own-workspace-links.ts works the key out ONCE,
 * before the step runs, and uses it for both lookup and store, so a step that
 * changes its caller's own access (deactivate yourself) still saves under the
 * access the caller had when it asked.
 */
import type { MutationCtx } from "../_generated/server";
import { getAuthContext } from "./authContext";

export async function scopedCommandKey(
  ctx: MutationCtx,
  command: string,
  key: string,
): Promise<string | null> {
  const auth = await getAuthContext(ctx);
  if (!auth.id || !auth.tenantId) return null;
  return JSON.stringify([
    auth.tenantId,
    auth.id,
    auth.personId ?? "",
    auth.role,
    auth.roleSource,
    [...auth.disabledCapabilities].sort(),
    command,
    key,
  ]);
}
