// @vitest-environment edge-runtime
/**
 * AC-327 (CF-9.2-scorecards): a role scorecard is an immutable version with
 * effective dates and an active state. Changing expectations means a new
 * version and archiving the old one; a review and a one-on-one keep the
 * version they used, and history answers which version was in force on a day.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import schema from "../../../convex/schema";
import { modules } from "../../proofs/convex-test-modules";
import { effectiveScorecard } from "../../../src/features/workforce/scorecardVersions";

const tenantId = "tenant-scorecard-versions";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("AC-327 role scorecard versions", () => {
  it("defines an immutable version, archives it, and history resolves the effective version", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const person = async (givenName: string, role: string, subject: string) =>
        (await ctx.db.insert("people", {
          tenantId,
          givenName,
          familyName: "Card",
          employmentType: "full_time",
          status: "active",
          deletedAt: null,
          version: 1,
          email: `${subject}@example.test`,
          role,
          authSubjectId: subject,
        } as never)) as Id<"people">;
      return {
        hrId: await person("Hana", "workforce_manager", "card-hr"),
        cookId: await person("Cody", "staff", "card-cook"),
      };
    });
    const hr = t.withIdentity({
      subject: "card-hr",
      tokenIdentifier: "proof|card-hr",
      role: "org:member",
      tenantId,
    });

    // No in-place edit exists: a version's content cannot be rewritten.
    expect(
      Object.keys(api.mutations).filter((name) =>
        /^RoleScorecard_(revise|update|edit)/.test(name),
      ),
    ).toEqual([]);

    const v1From = Date.UTC(2026, 0, 1);
    const v1 = (await hr.mutation(api.mutations.RoleScorecard_createViaDefine, {
      role: "staff",
      title: "Line cook v1",
      expectations: JSON.stringify([{ metric: "Tickets", target: "12/hr" }]),
      effectiveFrom: v1From,
    })) as { docId: Id<"roleScorecards"> };

    const review = (await hr.mutation(
      api.mutations.PerformanceReview_createViaRecord,
      {
        personId: ids.cookId,
        reviewerId: ids.hrId,
        reviewDate: Date.UTC(2026, 2, 1),
        reliabilityRating: 4,
        qualityRating: 4,
        teamworkRating: 4,
        scorecardId: v1.docId,
      },
    )) as { docId: Id<"performanceReviews"> };
    const meeting = (await hr.mutation(api.mutations.OneOnOne_createViaHold, {
      leadPersonId: ids.hrId,
      staffMemberId: ids.cookId,
      meetingDate: Date.UTC(2026, 2, 2),
      scorecardId: v1.docId,
    })) as { docId: Id<"oneOnOnes"> };

    const v1Before = await t.run((ctx) => ctx.db.get(v1.docId));

    await hr.mutation(api.mutations.RoleScorecard_archive, {
      docId: v1.docId,
      reason: "New ticket target",
    });
    const v2 = (await hr.mutation(api.mutations.RoleScorecard_createViaDefine, {
      role: "staff",
      title: "Line cook v2",
      expectations: JSON.stringify([{ metric: "Tickets", target: "15/hr" }]),
      effectiveFrom: Date.now(),
    })) as { docId: Id<"roleScorecards"> };

    const rows = await hr.query(api.queries.listRoleScorecard, {});
    const v1After = rows.find((row) => row._id === v1.docId);
    expect(v1After).toMatchObject({
      status: "archived",
      title: "Line cook v1",
      expectations: v1Before?.expectations,
      effectiveFrom: v1From,
      archiveReason: "New ticket target",
    });
    expect(v1After?.effectiveTo).toEqual(expect.any(Number));
    expect(rows.find((row) => row._id === v2.docId)?.status).toBe("active");

    // The old review and meeting still point at the version they used.
    const stored = await t.run(async (ctx) => ({
      review: await ctx.db.get(review.docId),
      meeting: await ctx.db.get(meeting.docId),
    }));
    expect(stored.review?.scorecardId).toBe(v1.docId);
    expect(stored.meeting?.scorecardId).toBe(v1.docId);

    // History: which version was in force on a day.
    expect(effectiveScorecard(rows, "staff", Date.UTC(2026, 2, 1))?._id).toBe(
      v1.docId,
    );
    expect(effectiveScorecard(rows, "staff", Date.now() + 1000)?._id).toBe(
      v2.docId,
    );
    expect(effectiveScorecard(rows, "staff", Date.UTC(2025, 5, 1))).toBeNull();
    expect(effectiveScorecard(rows, "driver", Date.now())).toBeNull();
  });
});
