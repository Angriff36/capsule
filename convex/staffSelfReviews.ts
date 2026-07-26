// AUTHOR SEAM — staff self-service view of their own recorded performance
// reviews (spec §9.4: "Staff-facing views show only the feedback intended
// for them"). The generated performanceReview reads are manager-only
// (manageAccess); this query returns ONLY the caller's own reviews as a
// reviewee, with the encrypted `notes` omitted. Additive read — no new write
// guard, no manifest/regen (per docs/architecture/domain-gating-restraint.md).
import { query } from "./_generated/server";
import { getAuthContext } from "./lib/authContext";

export const listMyReviews = query({
  args: {},
  handler: async (ctx) => {
    const auth = await getAuthContext(ctx);
    // No linked active Person (unauthenticated / not yet hired) → nothing to show.
    if (!auth.personId || !auth.tenantId) return [];

    const personId = ctx.db.normalizeId("people", auth.personId);
    if (!personId) return [];

    const rows = await ctx.db
      .query("performanceReviews")
      .withIndex("by_personId", (q) => q.eq("personId", personId))
      .collect();

    const mine = rows
      .filter(
        (row) =>
          row.tenantId === auth.tenantId &&
          row.deletedAt == null &&
          row.recordedAt != null,
      )
      .sort((a, b) => (b.reviewDate ?? 0) - (a.reviewDate ?? 0));

    // Resolve reviewer names + event titles only for the rows this person can
    // see (small set). `notes` is intentionally never projected — encrypted,
    // manager-private.
    const reviewerName = new Map<string, string>();
    const eventTitle = new Map<string, string>();
    for (const row of mine) {
      if (!reviewerName.has(String(row.reviewerId))) {
        const reviewer = await ctx.db.get(row.reviewerId);
        if (reviewer) {
          const name = `${reviewer.givenName} ${reviewer.familyName}`.trim();
          reviewerName.set(String(row.reviewerId), name || "Manager");
        }
      }
      if (row.eventId && !eventTitle.has(String(row.eventId))) {
        const event = await ctx.db.get(row.eventId);
        if (event) eventTitle.set(String(row.eventId), event.title ?? "");
      }
    }

    return mine.map((row) => ({
      id: row._id,
      reviewDate: row.reviewDate ?? null,
      eventId: row.eventId ?? null,
      eventTitle:
        row.eventId && eventTitle.has(String(row.eventId))
          ? (eventTitle.get(String(row.eventId)) ?? null)
          : null,
      reviewerName: reviewerName.get(String(row.reviewerId)) ?? "Manager",
      reliabilityRating: row.reliabilityRating,
      qualityRating: row.qualityRating,
      teamworkRating: row.teamworkRating,
    }));
  },
});
