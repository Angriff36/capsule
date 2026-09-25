/**
 * Runtime proof (AC-422): every §8.1 change emits EXACTLY ONE typed
 * manifestEvents row with stable ids, tenant, runtime createdAt, and payload
 * — ops changes (headcount/venue/style/schedule/purchasing week), the
 * lifecycle ladder plus cancel, EventDish add/adjust/reorder/substitute/
 * remove, and proposal accept/link + component revise/publish. Proof only:
 * the typed events already exist in the manifests; nothing here adds
 * commands, stages, or changes `final`.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  S,
  acceptedProposal,
  createPlannedEvent,
  expectExactlyOne,
  harness,
  rolesFor,
  runner,
  type Cmd,
  type Role,
} from "./canonical-change-events.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: §8.1 canonical change events (AC-422)", () => {
  it("ops changes emit schedule, week, headcount, venue, and style rows", async () => {
    const proof = harness();
    const tenantId = "tenant-ac422-ops";
    const { events } = rolesFor(proof, tenantId);
    const run = runner(proof, events);
    const { eventId, clientId } = await createPlannedEvent(
      proof,
      tenantId,
      "AC-422 ops",
    );
    const venue = await run(M.Venue_createViaRegister, {
      name: "Canonical Hall",
      venueType: "other",
      capacity: 90,
      addressLine1: "10 Oak",
    });
    const style = await run(M.ServiceStyle_createViaRegister, {
      name: "Plated",
      code: "PLATED_ac422",
      sortOrder: 10,
    });
    let version = 1;
    await run(M.Event_changeHeadcount, {
      docId: eventId,
      version: version++,
      newHeadcount: 48,
    });
    await expectExactlyOne(events, "EventHeadcountChanged", eventId, {
      previousHeadcount: 40,
      newHeadcount: 48,
      eventId,
      tenantId,
    });
    await run(M.Event_changeVenue, {
      docId: eventId,
      version: version++,
      venueId: venue.docId,
      venueName: "Canonical Hall",
      venueAddress: "10 Oak",
      venueCapacity: 90,
    });
    await expectExactlyOne(events, "EventVenueChanged", eventId, {
      venueId: venue.docId,
      venueName: "Canonical Hall",
      venueAddress: "10 Oak",
      venueCapacity: 90,
      eventId,
      tenantId,
    });
    await run(M.Event_changeServiceStyle, {
      docId: eventId,
      version: version++,
      serviceStyleId: style.docId,
      serviceStyleName: "Plated",
    });
    await expectExactlyOne(events, "EventServiceStyleChanged", eventId, {
      serviceStyleId: style.docId,
      serviceStyleName: "Plated",
      eventId,
      tenantId,
    });
    // Seven days later — a different purchasing week.
    const before = (await events.run(async (ctx) =>
      ctx.db.get(eventId as never),
    )) as { purchasingWeekStart: number };
    const previousWeek = before.purchasingWeekStart;
    await run(M.Event_reschedule, {
      docId: eventId,
      version: version++,
      startsAt: Date.UTC(2026, 9, 25, 17, 0),
      endsAt: Date.UTC(2026, 9, 25, 22, 0),
    });
    await expectExactlyOne(events, "EventScheduleChanged", eventId, {
      startsAt: Date.UTC(2026, 9, 25, 17, 0),
      endsAt: Date.UTC(2026, 9, 25, 22, 0),
      eventId,
      tenantId,
    });
    const weekRow = await expectExactlyOne(
      events,
      "EventPurchasingWeekChanged",
      eventId,
      { eventId, tenantId },
    );
    expect(weekRow.payload.previousPurchasingWeekStart).toBe(previousWeek);
    expect(weekRow.payload.purchasingWeekStart).not.toBe(previousWeek);
    // Creation itself already wrote the planned row.
    await expectExactlyOne(events, "EventPlanned", eventId, {
      clientId,
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      expectedHeadcount: 40,
    });
  });

  it("lifecycle ladder plus cancel emit approved, lock, final, complete, closeout, cancelled", async () => {
    const proof = harness();
    const ladderTenant = "tenant-ac422-ladder";
    const { sales, events } = rolesFor(proof, ladderTenant);
    const { eventId, clientId } = await createPlannedEvent(
      proof,
      ladderTenant,
      "AC-422 ladder",
    );
    const plan: Array<readonly [Role, Cmd]> = [
      [events, M.Event_submitForApproval],
      [events, M.Event_approve],
      [sales, M.Event_lockForSales],
      [events, M.Event_beginExecution],
      [events, M.Event_finalizeEvent],
      [events, M.Event_complete],
      [events, M.Event_closeOut],
    ];
    let version = 1;
    for (const [role, cmd] of plan) {
      await proof.executeCommand(role, cmd, { docId: eventId, version });
      version += 1;
    }
    // [emitted type, payload fields to assert on top of the tenant]
    const emitted: Array<readonly [string, Record<string, unknown>]> = [
      ["EventApproved", { clientId, expectedHeadcount: 40, quotedPrice: 4500 }],
      ["EventSalesLocked", {}],
      ["EventExecutionStarted", {}],
      ["EventFinalized", {}],
      ["EventCompleted", {}],
      [
        "EventClosedOut",
        {
          clientId,
          expectedHeadcount: 40,
          quotedPrice: 4500,
          budgetAmount: 3000,
        },
      ],
    ];
    for (const [type, extra] of emitted) {
      await expectExactlyOne(events, type, eventId, {
        ...extra,
        tenantId: ladderTenant,
      });
    }
    const cancelTenant = "tenant-ac422-cancel";
    const { events: cancelEvents } = rolesFor(proof, cancelTenant);
    const cancelled = await createPlannedEvent(
      proof,
      cancelTenant,
      "AC-422 cancel",
    );
    const reason = "Client postponed the gala";
    await proof.executeCommand(cancelEvents, M.Event_cancel, {
      docId: cancelled.eventId,
      version: cancelled.version,
      reason,
    });
    const cancelRow = await expectExactlyOne(
      cancelEvents,
      "EventCancelled",
      cancelled.eventId,
      { reason, tenantId: cancelTenant },
    );
    expect(cancelRow.payload.clientId).toBe(cancelled.clientId);
    await expect(
      proof.executeCommand(cancelEvents, M.Event_cancel, {
        docId: cancelled.eventId,
        version: cancelled.version + 1,
        reason: "Second cancel must not write",
      }),
    ).rejects.toThrow(/Guard|Invalid state transition/);
    await expectExactlyOne(cancelEvents, "EventCancelled", cancelled.eventId, {
      reason,
    });
  });

  it("EventDish add, adjust, reorder, substitute, and remove emit typed rows", async () => {
    const proof = harness();
    const tenantId = "tenant-ac422-dish";
    const { events, kitchen } = rolesFor(proof, tenantId);
    const run = runner(proof, events);
    const seed = runner(proof, kitchen);
    const { eventId } = await createPlannedEvent(
      proof,
      tenantId,
      "AC-422 dishes",
    );
    const introduce = (name: string) =>
      seed(M.Ingredient_createViaIntroduce, {
        name,
        unit: "pound",
        costPerUnit: 2,
        allergens: [],
        category: "produce",
      });
    const onion = await introduce("Yellow onion");
    const shallot = await introduce("Shallot");
    const dish = await seed(M.Dish_createViaIntroduce, {
      name: "Canonical plate",
      portionSize: 1,
      portionUnit: "portion",
    });
    const onionLine = await seed(M.DishIngredient_createViaAdd, {
      dishId: dish.docId,
      ingredientId: onion.docId,
      quantity: 0.1,
      unit: "pound",
      wasteFactor: 1,
    });
    const added = await run(M.EventDish_createViaAddToEvent, {
      eventId,
      dishId: dish.docId,
      quantityServings: 40,
      course: "main",
    });
    await expectExactlyOne(events, "EventDishAdded", added.docId, {
      eventId,
      dishId: dish.docId,
      quantityServings: 40,
      tenantId,
    });
    await run(M.EventDish_adjustServings, {
      docId: added.docId,
      quantityServings: 36,
    });
    await expectExactlyOne(events, "EventDishServingsAdjusted", added.docId, {
      previousQuantityServings: 40,
      quantityServings: 36,
      eventId,
      tenantId,
    });
    await run(M.EventDish_reorder, { docId: added.docId, sortOrder: 3 });
    await expectExactlyOne(events, "EventDishReordered", added.docId, {
      sortOrder: 3,
      eventId,
      tenantId,
    });
    // Substitute = an EventDishLineOverride of kind "replace" — the existing
    // §8.1 substitute; no EventDish.substitute command exists.
    const override = await run(M.EventDishLineOverride_createViaApply, {
      eventDishId: added.docId,
      eventId,
      kind: "replace",
      targetDishIngredientId: onionLine.docId,
      ingredientId: shallot.docId,
      quantity: 0.1,
      unit: "pound",
      portionsAffected: 36,
      reason: "Guest cannot eat onions",
    });
    await expectExactlyOne(
      events,
      "EventDishLineOverrideApplied",
      override.docId,
      {
        eventDishId: added.docId,
        eventId,
        kind: "replace",
        portionsAffected: 36,
      },
    );
    await run(M.EventDish_remove, {
      docId: added.docId,
      reason: "Dropped the station",
    });
    await expectExactlyOne(events, "EventDishRemoved", added.docId, {
      eventId,
      dishId: dish.docId,
      reason: "Dropped the station",
      tenantId,
    });
  });

  it("proposal accept/link and component revise/publish emit typed rows", async () => {
    const proof = harness();
    const tenantId = "tenant-ac422-proposal";
    const { owner, kitchen } = rolesFor(proof, tenantId);
    const seed = runner(proof, kitchen);
    const { clientId, proposalId } = await acceptedProposal(
      proof,
      owner,
      tenantId,
    );
    await expectExactlyOne(owner, "ProposalAccepted", proposalId, {
      clientId,
      tenantId,
    });
    const booked = (await owner.mutation(
      api.lib.proposalEventCreation.createEventFromAcceptedProposal,
      {
        proposalId,
        event: {
          clientId,
          title: "Autumn gala",
          eventType: "gala dinner",
          startsAt: Date.parse("2026-11-05T18:00:00Z"),
          endsAt: Date.parse("2026-11-05T23:00:00Z"),
          expectedHeadcount: 80,
          primaryContactName: "Casey Contact",
          budgetAmount: 0,
          quotedPrice: 1300,
          venueName: "Garden Hall",
        },
      },
    )) as { docId: string };
    await expectExactlyOne(owner, "ProposalEventLinked", proposalId, {
      eventId: booked.docId,
      clientId,
      tenantId,
    });
    await expectExactlyOne(owner, "EventPlanned", booked.docId, {
      clientId,
      expectedHeadcount: 80,
    });
    const component = await seed(M.Component_createViaDraft, {
      name: "Canonical rolls",
      yieldQuantity: 1,
      yieldUnit: "portion",
      batchMultiplier: 1,
    });
    await seed(M.Component_reviseDraft, {
      docId: component.docId,
      version: 1,
      name: "Revised rolls",
      yieldQuantity: 2,
      yieldUnit: "portion",
      batchMultiplier: 1,
    });
    await expectExactlyOne(kitchen, "ComponentDraftRevised", component.docId, {
      name: "Revised rolls",
      yieldQuantity: 2,
      tenantId,
    });
    // reviseDraft bumps the concurrency version (1 -> 2) but NOT
    // versionNumber — publish takes version 2 and keeps versionNumber 1.
    await seed(M.Component_publishVersion, {
      docId: component.docId,
      version: 2,
    });
    await expectExactlyOne(
      kitchen,
      "ComponentVersionPublished",
      component.docId,
      { versionNumber: 1, tenantId },
    );
  });
});
