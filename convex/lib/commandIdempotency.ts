/**
 * PL-AUTH (AC-151): a saved step answer replays only for the same workspace
 * and the same step.
 *
 * Generated mutations keep each answer under the caller's idempotency key so
 * a retry gets the first answer back. The key alone was the lookup, so a
 * caller of another workspace (or a signed-out caller) sending a known key got
 * the saved answer before the step checked its record. The regen patch
 * scripts/apply-own-workspace-links.ts stores and looks up every answer under
 * this scoped key instead. Workspace ids and step names hold no ":", so the
 * scoped key cannot collide across workspaces or steps.
 */
import type { MutationCtx } from "../_generated/server";
import { getAuthContext } from "./authContext";

export async function scopedCommandKey(
  ctx: MutationCtx,
  command: string,
  key: string,
): Promise<string> {
  const auth = await getAuthContext(ctx);
  return `${auth.tenantId}:${command}:${key}`;
}
