// @vitest-environment edge-runtime
/**
 * AC-329 (CF-9.4-performance): a review links the staff member, event,
 * reviewer, role scorecard, ratings, strengths, things to work on, comments
 * and follow-up. Staff managers see all of it; the person reviewed sees their
 * own reviews with the scorecard and shared feedback, without the private
 * notes, and never another person's feedback.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import schema from "../../../convex/schema";
import { modules } from "../../proofs/convex-test-modules";

const tenantId = "tenant-my-reviews";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

function signIn(t: ReturnType<typeof convexTest>, subject: string) {
  return t.withIdentity({
    subject,
    tokenIdentifier: `proof|${subject}`,
    role: "org:member",
    tenantId,
  });
}

describe("AC-329 performance feedback reaches only the person it is for", () => {
  it("reviewee sees their reviews without notes and never another person's feedback", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const person = async (givenName: string, role: string, subject: string) =>
        (await ctx.db.insert("people", {
          tenantId,
          givenName,
          familyName: "Review",
          employmentType: "part_time",
          status: "active",
          deletedAt: null,
          version: 1,
          email: `${subject}@example.test`,
          role,
          authSubjectId: subject,
        } as never)) as Id<"people">;
      return {
        hrId: await person("Hana", "workforce_manager", "rev-hr"),
        serverId: await person("Sam", "staff", "rev-server"),
        otherId: await person("Ori", "staff", "rev-other"),
        eventId: (await ctx.db.insert("events", {
          tenantId,
          title: "Harvest gala",
          eventType: "gala",
          stage: "planning",
          deletedAt: null,
          version: 1,
        } as never)) as Id<"events">,
      };
    });
    const hr = signIn(t, "rev-hr");
    const server = signIn(t, "rev-server");
    const other = signIn(t, "rev-other");

    const scorecard = (await hr.mutation(
      api.mutations.RoleScorecard_createViaDefine,
      {
        role: "staff",
        title: "Server standards 2026",
        expectations: JSON.stringify([{ metric: "On time", target: "100%" }]),
      },
    )) as { docId: string };

    await hr.mutation(api.mutations.PerformanceReview_createViaRecord, {
      personId: ids.serverId,
      reviewerId: ids.hrId,
      eventId: ids.eventId,
      reviewDate: Date.UTC(2026, 8, 27),
      reliabilityRating: 5,
      qualityRating: 4,
      teamworkRating: 5,
      notes: "Manager only: raise next month",
      scorecardId: scorecard.docId,
      strengths: "Calm with guests",
      opportunities: "Clear plates faster",
      comments: "You carried the head table",
      followUp: "Lead the next pass briefing",
      followUpDue: Date.UTC(2026, 9, 10),
    });
    await hr.mutation(api.mutations.PerformanceReview_createViaRecord, {
      personId: ids.otherId,
      reviewerId: ids.hrId,
      reviewDate: Date.UTC(2026, 8, 27),
      reliabilityRating: 2,
      qualityRating: 3,
      teamworkRating: 3,
      notes: "Manager only: warning",
      comments: "Please call if running late",
    });

    // Staff managers see the full linked record.
    const all = await hr.query(api.queries.listPerformanceReview, {});
    const full = all.find((row) => row.personId === ids.serverId);
    expect(full).toMatchObject({
      eventId: ids.eventId,
      reviewerId: ids.hrId,
      scorecardId: scorecard.docId,
      strengths: "Calm with guests",
      opportunities: "Clear plates faster",
      comments: "You carried the head table",
      followUp: "Lead the next pass briefing",
      notes: "Manager only: raise next month",
    });

    const mine = await server.query(api.staffSelfReviews.listMyReviews, {});
    expect(mine).toEqual([
      expect.objectContaining({
        eventTitle: "Harvest gala",
        reviewerName: "Hana Review",
        scorecardTitle: "Server standards 2026",
        reliabilityRating: 5,
        qualityRating: 4,
        teamworkRating: 5,
        strengths: "Calm with guests",
        opportunities: "Clear plates faster",
        comments: "You carried the head table",
        followUp: "Lead the next pass briefing",
        followUpDue: Date.UTC(2026, 9, 10),
      }),
    ]);
    const mineText = JSON.stringify(mine);
    expect(mineText).not.toContain("Manager only");
    expect(mineText).not.toContain("Please call if running late");

    const theirs = await other.query(api.staffSelfReviews.listMyReviews, {});
    expect(theirs).toHaveLength(1);
    expect(theirs[0]).toMatchObject({
      comments: "Please call if running late",
      scorecardTitle: null,
    });
    const theirsText = JSON.stringify(theirs);
    expect(theirsText).not.toContain("Manager only");
    expect(theirsText).not.toContain("head table");

    // Neither worker reads the review list itself.
    expect(await server.query(api.queries.listPerformanceReview, {})).toEqual(
      [],
    );
  });
});
