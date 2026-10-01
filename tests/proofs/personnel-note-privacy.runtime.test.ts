/**
 * AC-129 (PR09-08): staff managers record event feedback, performance
 * follow-up and one-on-one notes. A worker's own event access does not show
 * anyone's confidential personnel notes: a cook cannot read another person's
 * review or any one-on-one, and sees their own review without the private
 * notes. Other managers (kitchen, sales) do not read personnel notes either.
 * Synthetic workspace.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import schema from "../../convex/schema";
import { modules } from "./convex-test-modules";

const tenantId = "tenant-personnel-notes";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

async function seed(t: ReturnType<typeof convexTest>) {
  return await t.run(async (ctx) => {
    const person = async (givenName: string, role: string, subject: string) =>
      (await ctx.db.insert("people", {
        tenantId,
        givenName,
        familyName: "Proof",
        employmentType: "full_time",
        status: "active",
        deletedAt: null,
        version: 1,
        email: `${subject}@example.test`,
        role,
        authSubjectId: subject,
      } as never)) as Id<"people">;
    const hrId = await person("Hana", "workforce_manager", "notes-hr");
    const chefId = await person("Kai", "kitchen_manager", "notes-chef");
    const cookId = await person("Cody", "staff", "notes-cook");
    const otherId = await person("Remy", "staff", "notes-other");
    const eventId = (await ctx.db.insert("events", {
      tenantId,
      title: "Notes dinner",
      eventType: "dinner",
      stage: "planning",
      deletedAt: null,
      version: 1,
    } as never)) as Id<"events">;
    await ctx.db.insert("eventAssignments", {
      tenantId,
      eventId,
      personId: cookId,
      role: "cook",
      status: "confirmed",
      deletedAt: null,
      version: 1,
    });
    return { hrId, chefId, cookId, otherId, eventId };
  });
}

function signIn(t: ReturnType<typeof convexTest>, subject: string) {
  return t.withIdentity({
    subject,
    tokenIdentifier: `proof|${subject}`,
    role: "org:member",
    tenantId,
  });
}

describe("AC-129 personnel notes stay with staff managers", () => {
  it("a staff role cannot read another person review or one-on-one notes while seeing own review without notes", async () => {
    const t = convexTest(schema, modules);
    const ids = await seed(t);
    const hr = signIn(t, "notes-hr");
    const chef = signIn(t, "notes-chef");
    const cook = signIn(t, "notes-cook");
    const other = signIn(t, "notes-other");

    const review = (personId: string, notes: string, comments: string) =>
      hr.mutation(api.mutations.PerformanceReview_createViaRecord, {
        personId,
        reviewerId: ids.hrId,
        eventId: ids.eventId,
        reviewDate: Date.UTC(2026, 8, 20),
        reliabilityRating: 4,
        qualityRating: 5,
        teamworkRating: 3,
        notes,
        strengths: "Fast on the line",
        opportunities: "Label every hotel pan",
        comments,
        followUp: "Shadow the sauté station",
        followUpDue: Date.UTC(2026, 9, 1),
      });
    await review(ids.cookId, "PRIVATE: talked about lateness", "Great night");
    await review(ids.otherId, "PRIVATE: other person's note", "Thanks Remy");
    const meeting = (await hr.mutation(api.mutations.OneOnOne_createViaHold, {
      leadPersonId: ids.hrId,
      staffMemberId: ids.cookId,
      meetingDate: Date.UTC(2026, 8, 21),
      agenda: "PRIVATE agenda",
      wins: "Closed the kitchen clean",
      opportunities: "PRIVATE opportunity",
    })) as { docId: string };
    await hr.mutation(api.mutations.OneOnOneAction_createViaCapture, {
      oneOnOneId: meeting.docId,
      ownerPersonId: ids.cookId,
      description: "PRIVATE action",
    });

    // HR sees everything, notes included.
    const hrReviews = await hr.query(api.queries.listPerformanceReview, {});
    expect(hrReviews).toHaveLength(2);
    expect(hrReviews.map((row) => row.notes).sort()).toEqual([
      "PRIVATE: other person's note",
      "PRIVATE: talked about lateness",
    ]);
    expect(await hr.query(api.queries.listOneOnOne, {})).toHaveLength(1);

    // The cook keeps their operational event access...
    const assignments = await cook.query(
      api.queries.listEventAssignment as never,
      {} as never,
    );
    expect(Array.isArray(assignments)).toBe(true);

    // ...but reads no review list, no one-on-one and no action.
    expect(await cook.query(api.queries.listPerformanceReview, {})).toEqual([]);
    expect(await cook.query(api.queries.listOneOnOne, {})).toEqual([]);
    expect(await cook.query(api.queries.listOneOnOneAction, {})).toEqual([]);

    // A kitchen manager runs the line but does not read personnel notes.
    expect(await chef.query(api.queries.listPerformanceReview, {})).toEqual([]);
    expect(await chef.query(api.queries.listOneOnOne, {})).toEqual([]);

    // The cook's own review: ratings and the shared feedback, no notes.
    const mine = await cook.query(api.staffSelfReviews.listMyReviews, {});
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      eventTitle: "Notes dinner",
      reviewerName: "Hana Proof",
      reliabilityRating: 4,
      qualityRating: 5,
      teamworkRating: 3,
      strengths: "Fast on the line",
      opportunities: "Label every hotel pan",
      comments: "Great night",
      followUp: "Shadow the sauté station",
      followUpDue: Date.UTC(2026, 9, 1),
    });
    expect(JSON.stringify(mine)).not.toContain("PRIVATE");
    expect(mine[0]).not.toHaveProperty("notes");

    // The other worker sees only their own review, never the cook's.
    const theirs = await other.query(api.staffSelfReviews.listMyReviews, {});
    expect(theirs).toHaveLength(1);
    expect(theirs[0]?.comments).toBe("Thanks Remy");
    expect(JSON.stringify(theirs)).not.toContain("Great night");
    expect(JSON.stringify(theirs)).not.toContain("PRIVATE");
  });
});
