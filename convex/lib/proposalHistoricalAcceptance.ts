// AC-098 (PR06-05): an event brought in from another system was often agreed
// before Capsule. This records that acceptance through the normal path - the
// proposal is built from the event (proposalGenerate), sent so its revision
// snapshot is captured (sendProposalWithRevisionCapture), and accepted against
// that revision under the staff member's own sign-in - then labeled with where
// the acceptance came from and what shows it. No SignatureRequest is made: an
// agreement from before Capsule is never shown as a Capsule signature.
//
// One transaction: if any step fails nothing is kept.

import { mutation } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { getAuthContext, requireTenant } from "./authContext";
import { readScopedEvent } from "./proposalGenerateSources";
import { TenantSystemCommandRunner } from "./tenantSystemCommandRunner";

export const recordImportedAcceptance = mutation({
  args: {
    eventId: v.id("events"),
    source: v.string(),
    evidence: v.string(),
  },
  handler: async (
    ctx,
    { eventId, source, evidence },
  ): Promise<{ proposalId: Id<"proposals">; revisionId: Id<"proposalRevisions"> }> => {
    const tenantId = requireTenant(await getAuthContext(ctx));
    const event = await readScopedEvent(ctx, tenantId, eventId);
    const from = source.trim();
    const shows = evidence.trim();
    if (from.length === 0 || shows.length === 0) {
      throw new Error(
        "Say where the acceptance came from and what shows the client agreed.",
      );
    }
    const accepted = (
      await ctx.db
        .query("proposals")
        .withIndex("by_eventId", (q) => q.eq("eventId", event._id))
        .collect()
    ).find(
      (row) =>
        row.tenantId === tenantId && row.deletedAt == null && row.status === "accepted",
    );
    if (accepted) {
      throw new Error("This event already has an accepted proposal.");
    }

    const { proposalId } = await ctx.runMutation(
      api.lib.proposalGenerate.generateProposalDraft,
      { eventId },
    );
    const draft = (await ctx.db.get(proposalId))!;
    await ctx.runMutation(api.lib.proposalRevision.sendProposalWithRevisionCapture, {
      docId: proposalId,
      version: draft.version,
      changeSummary: `Accepted before Capsule (from ${from})`,
    });
    const revision = (
      await ctx.db
        .query("proposalRevisions")
        .withIndex("by_proposalId", (q) => q.eq("proposalId", proposalId))
        .collect()
    )
      .filter((row) => row.deletedAt == null)
      .sort((a, b) => b.revisionNumber - a.revisionNumber)[0];
    const sent = (await ctx.db.get(proposalId))!;
    await ctx.runMutation(api.mutations.Proposal_accept, {
      docId: proposalId,
      version: sent.version,
      eventId: event._id,
      acceptedRevisionId: revision._id,
    });
    const acceptedRow = (await ctx.db.get(proposalId))!;
    await TenantSystemCommandRunner.forTenant(ctx, tenantId).context.runMutation(
      api.mutations.Proposal_recordHistoricalAcceptance,
      { docId: proposalId, version: acceptedRow.version, source: from, evidence: shows },
    );
    return { proposalId, revisionId: revision._id };
  },
});
