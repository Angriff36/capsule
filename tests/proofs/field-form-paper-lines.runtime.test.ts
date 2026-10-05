/**
 * Runtime proof (PL-REPLACEMENT-PROOF, Mangia "EVENT FORMS ONE PRINT"): the
 * Leaving The Shop and Event Arrival day-of forms carry the paper lines, the
 * food waste form lists the event's menu to count leftovers against, and what
 * the lead ticks or counts is kept on the signed form exactly as written.
 */
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import {
  blankChecklist,
  blankMuda,
  decodeAnswers,
  encodeAnswers,
} from "../../src/lib/eventPacket/finalLock/fieldFormAnswers";
import { modules } from "./convex-test-modules";

const finalLock = api.lib.eventPacket.finalLock;
const m = api.mutations;

async function setup() {
  const t = convexTest(schema, modules);
  const manager = t.withIdentity({
    subject: "paper-manager",
    org_id: "tenant-a",
    role: "admin",
  });
  const eventId = await t.run(async (ctx) => {
    const leadId = await ctx.db.insert("people", {
      tenantId: "tenant-a",
      givenName: "Lena",
      familyName: "Crew",
      email: "paper-lead@example.test",
      role: "staff",
      employmentType: "full_time",
      status: "active",
      authSubjectId: "paper-lead",
      version: 1,
    } as never);
    const id = await ctx.db.insert("events", {
      tenantId: "tenant-a",
      title: "A Century Worth Celebrating",
      eventType: "Social",
      eventNumber: "6839",
      venueName: "Fields Senior Living",
      venueAddress: "16512 E Desmet Ct",
      startsAt: Date.parse("2026-09-22T21:00:00Z"),
      endsAt: Date.parse("2026-09-23T00:01:00Z"),
      expectedHeadcount: 100,
      timingSetupMinutes: 60,
      budgetAmount: 0,
      stage: "planning",
      version: 1,
      deletedAt: null,
    });
    await ctx.db.insert("eventAssignments", {
      tenantId: "tenant-a",
      eventId: id,
      personId: leadId,
      role: "Event lead",
      status: "assigned",
      assignedAt: Date.now(),
      version: 1,
    } as never);
    for (const name of ["Coconut Prawns", "Mini Baked Potato Bites"]) {
      const dishId = await ctx.db.insert("dishes", {
        tenantId: "tenant-a",
        name,
        course: "Appetizer",
        portionSize: 1,
        portionUnit: "each",
        status: "active",
        version: 1,
      } as never);
      await ctx.db.insert("eventDishes", {
        tenantId: "tenant-a",
        eventId: id,
        dishId,
        quantityServings: 100,
        course: "Appetizer",
        addedAt: Date.now(),
        version: 1,
      });
    }
    return id;
  });
  const lead = t.withIdentity({
    subject: "paper-lead",
    org_id: "tenant-a",
    role: "staff",
  });
  return { manager, lead, eventId };
}

async function formsByKey(user: any, eventId: any) {
  const rows = await user.query(finalLock.listEventFieldForms, { eventId });
  return Object.fromEntries(rows.map((r: any) => [r.formKey, r]));
}

describe("Mangia's paper day-of forms", () => {
  it("keeps the ticked lines and the leftover counts as the lead wrote them", async () => {
    const { manager, lead, eventId } = await setup();
    await manager.mutation(finalLock.prepareFieldForms, { eventId });
    const forms = await formsByKey(manager, eventId);
    expect(forms["field.leaving-shop"].instructions).toMatch(
      /before leaving the shop/,
    );
    expect(forms["field.muda"].expectedItems).toBe(
      "Coconut Prawns; Mini Baked Potato Bites",
    );

    // Leaving the shop: one line not done, so it is signed as a problem.
    const lines = blankChecklist("field.leaving-shop").map((l) => ({
      ...l,
      done: !/garage event space/.test(l.line),
    }));
    expect(lines).toHaveLength(15);
    await lead.mutation(m.FieldConfirmation_complete, {
      docId: forms["field.leaving-shop"].id,
      outcome: "problem",
      note: "Garage space still had the Smith rentals",
      answers: encodeAnswers({ kind: "checklist", lines }),
    });

    const muda = {
      ...blankMuda(),
      attendance: 92,
      appetizersUsed: true,
      appetizerStyles: ["passed" as const],
      mainsHandling: "to_kitchen" as const,
      leftovers: [
        { item: "Coconut Prawns", kind: "appetizer" as const, amount: 12 },
        { item: "", kind: "main" as const, amount: 3 },
      ],
    };
    await lead.mutation(m.FieldConfirmation_complete, {
      docId: forms["field.muda"].id,
      outcome: "all_good",
      note: "About 92 guests came.",
      answers: encodeAnswers({ kind: "muda", muda }),
    });

    const rows = await formsByKey(manager, eventId);
    expect(rows["field.leaving-shop"].outcome).toBe("problem");
    const shop = decodeAnswers(rows["field.leaving-shop"].answers);
    expect(shop?.kind).toBe("checklist");
    expect(
      shop?.kind === "checklist" && shop.lines.filter((l) => !l.done),
    ).toEqual([
      {
        section: "Walk through",
        line: "The garage event space is empty (if one is assigned)",
        done: false,
      },
    ]);
    const waste = decodeAnswers(rows["field.muda"].answers);
    expect(waste?.kind === "muda" && waste.muda).toMatchObject({
      attendance: 92,
      mainsHandling: "to_kitchen",
      leftovers: [{ item: "Coconut Prawns", kind: "appetizer", amount: 12 }],
    });
    // Forms with no paper lines keep no answers.
    expect(rows["field.bins"].answers).toBeNull();
  });
});
