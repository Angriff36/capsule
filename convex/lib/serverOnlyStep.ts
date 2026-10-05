import type { MutationCtx } from "../_generated/server";

/**
 * PL-AUTH (AC-372): a Manifest `private command` is a step the server runs on
 * its own - a reaction keeping a total in step with its lines, or a follow-up
 * an authored seam runs through TenantSystemCommandRunner. The Convex
 * projection still exports it as a public mutation, so without this check any
 * signed-in person could call it with numbers of their own (an order subtotal
 * under the spend limit, an invoice payment with no payment behind it).
 *
 * Reactions call the step's run function in-process and never reach the
 * public wrapper. TenantSystemCommandRunner answers with the capsule-system
 * issuer, which no real sign-in can carry: Convex only accepts tokens from the
 * issuers in auth.config.ts.
 */
export async function assertServerOnlyStep(ctx: MutationCtx): Promise<void> {
  const identity = await ctx.auth.getUserIdentity();
  if (
    identity?.issuer === "capsule-system" &&
    identity.tokenIdentifier.startsWith("capsule-system|")
  ) {
    return;
  }
  throw new Error(
    "Capsule does this step on its own when the records it follows change. It can't be started by hand.",
  );
}
