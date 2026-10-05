// @vitest-environment edge-runtime
/**
 * AC-330 (CF-9.5-one-on-ones): a one-on-one keeps period, participants,
 * agenda, goals, wins, opportunities and decisions, plus follow-up actions
 * with owners and dates. Open actions come up when the next meeting with the
 * same person is started, and closing one never rewrites the earlier meeting.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import schema from "../../../convex/schema";
import { modules } from "../../proofs/convex-test-modules";
import { openActionsForNextMeeting } from "../../../src/features/workforce/oneOnOneCarryOver";

const tenantId = "tenant-one-on-one-actions";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("AC-330 one-on-one follow-up actions", () => {
  it("open action items carry into the next held meeting view and close without mutating the prior record", async () => {
    const t = convexTest(schema, modules);
    const ids = await t.run(async (ctx) => {
      const person = async (givenName: string, role: string, subject: string) =>
        (await ctx.db.insert("people", {
          tenantId,
          givenName,
          familyName: "Meet",
          employmentType: "full_time",
          status: "active",
          deletedAt: null,
          version: 1,
          email: `${subject}@example.test`,
          role,
          authSubjectId: subject,
        } as never)) as Id<"people">;
      return {
        leadId: await person("Lee", "workforce_manager", "meet-lead"),
        cookId: await person("Cody", "staff", "meet-cook"),
        otherId: await person("Ori", "staff", "meet-other"),
      };
    });
    const lead = t.withIdentity({
      subject: "meet-lead",
      tokenIdentifier: "proof|meet-lead",
      role: "org:member",
      tenantId,
    });

    const september = (await lead.mutation(
      api.mutations.OneOnOne_createViaHold,
      {
        leadPersonId: ids.leadId,
        staffMemberId: ids.cookId,
        meetingDate: Date.UTC(2026, 8, 1),
        agenda: "Station ownership",
        goals: JSON.stringify(["Own the grill"]),
        wins: "No comps last week",
        opportunities: "Prep lists by 2pm",
        decisions: JSON.stringify(["Grill lead on Fridays"]),
      },
    )) as { docId: Id<"oneOnOnes"> };
    const otherMeeting = (await lead.mutation(
      api.mutations.OneOnOne_createViaHold,
      {
        leadPersonId: ids.leadId,
        staffMemberId: ids.otherId,
        meetingDate: Date.UTC(2026, 8, 2),
      },
    )) as { docId: Id<"oneOnOnes"> };

    const capture = (oneOnOneId: string, ownerPersonId: string, text: string) =>
      lead.mutation(api.mutations.OneOnOneAction_createViaCapture, {
        oneOnOneId,
        ownerPersonId,
        description: text,
        dueDate: Date.UTC(2026, 8, 15),
      }) as Promise<{ docId: Id<"oneOnOneActions"> }>;
    // The lead owns one of the cook's follow-ups: it still carries over.
    const order = await capture(september.docId, ids.leadId, "Order new tongs");
    const prep = await capture(september.docId, ids.cookId, "Write prep list");
    const done = await capture(september.docId, ids.cookId, "Sharpen knives");
    await capture(otherMeeting.docId, ids.otherId, "Other person's action");

    await lead.mutation(api.mutations.OneOnOneAction_close, {
      docId: done.docId,
    });

    const meetingBefore = await t.run((ctx) => ctx.db.get(september.docId));
    const read = async () => ({
      meetings: await lead.query(api.queries.listOneOnOne, {}),
      actions: await lead.query(api.queries.listOneOnOneAction, {}),
    });

    let state = await read();
    let carried = openActionsForNextMeeting(
      state.meetings,
      state.actions,
      ids.cookId,
    );
    expect(carried.map((row) => row.description).sort()).toEqual([
      "Order new tongs",
      "Write prep list",
    ]);
    expect(carried.every((row) => row.dueDate === Date.UTC(2026, 8, 15))).toBe(
      true,
    );
    expect(
      openActionsForNextMeeting(state.meetings, state.actions, ""),
    ).toEqual([]);

    // Close one from the next meeting's view.
    await lead.mutation(api.mutations.OneOnOneAction_close, {
      docId: prep.docId,
    });
    state = await read();
    carried = openActionsForNextMeeting(
      state.meetings,
      state.actions,
      ids.cookId,
    );
    expect(carried.map((row) => row._id)).toEqual([order.docId]);

    // The September meeting record never moved.
    const meetingAfter = await t.run((ctx) => ctx.db.get(september.docId));
    expect(meetingAfter).toEqual(meetingBefore);
    expect(meetingAfter).toMatchObject({
      agenda: "Station ownership",
      wins: "No comps last week",
      opportunities: "Prep lists by 2pm",
      goals: JSON.stringify(["Own the grill"]),
      decisions: JSON.stringify(["Grill lead on Fridays"]),
    });
    const closed = state.actions.find((row) => row._id === prep.docId);
    expect(closed).toMatchObject({ status: "closed" });
    expect(closed?.closedAt).toEqual(expect.any(Number));
  });
});
