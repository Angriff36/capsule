/**
 * Runtime proof (AC-474, BE-10.3): after the buyer sends the weekly order,
 * more demand becomes a new line for the difference on a fresh weekly draft.
 * The sent order is never rewritten.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  sentOrderSurplus,
  type SurplusNeed,
} from "../../src/features/inventory/sentOrderSurplus";
import {
  approvedEvent,
  drafts,
  harness,
  lineFor,
  linesOf,
  linkedEventIds,
  liveRows,
  orders,
  readRow,
  rolesFor,
  runner,
  seedCatalog,
  versionOf,
  WEEK_ONE,
  type LineRow,
  type OrderRow,
} from "./weekly-purchasing.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: demand after the order is sent (AC-474)", () => {
  it("demand rising after submission leaves the submitted order unchanged and opens a delta line on the weekly draft", async () => {
    const proof = harness();
    const tenantId = "tenant-ac474-post-submit";
    const roles = rolesFor(proof, tenantId);
    const buyer = runner(proof, roles.procurement);
    const events = runner(proof, roles.events);
    const catalog = await seedCatalog(proof, tenantId, [
      { name: "Beans", perServing: 0.1 },
    ]);
    const [beansId] = catalog.ingredientIds as [string];
    const eventId = await approvedEvent(proof, tenantId, {
      title: "AC-474 picnic",
      headcount: 40,
      dishIds: catalog.dishIds,
    });

    const [draft] = await drafts(roles.procurement, tenantId);
    const sentLine = await lineFor(
      roles.procurement,
      tenantId,
      draft!._id,
      beansId,
    );
    expect(Number(sentLine!.orderedQuantity)).toBeCloseTo(4, 4);
    await buyer(M.VendorOrder_submit, {
      docId: draft!._id,
      version: draft!.version,
    });
    const sent = await readRow<OrderRow>(roles.procurement, draft!._id);
    expect(sent.status).toBe("submitted");
    const sentLineBefore = await readRow<LineRow>(
      roles.procurement,
      sentLine!._id,
    );

    await events(M.Event_changeHeadcount, {
      docId: eventId,
      version: await versionOf(roles.events, eventId),
      newHeadcount: 60,
    });

    // The sent order and its line are exactly as they were.
    const sentAfter = await readRow<OrderRow>(roles.procurement, draft!._id);
    expect(sentAfter.status).toBe("submitted");
    expect(sentAfter.version).toBe(sent.version);
    const sentLineAfter = await readRow<LineRow>(
      roles.procurement,
      sentLine!._id,
    );
    expect(sentLineAfter).toEqual(sentLineBefore);
    expect(await linesOf(roles.procurement, tenantId, draft!._id)).toHaveLength(
      1,
    );

    // The extra 2 kg lands on a new draft for the same vendor and week.
    const newDrafts = await drafts(roles.procurement, tenantId);
    expect(newDrafts).toHaveLength(1);
    const delta = newDrafts[0]!;
    expect(delta._id).not.toBe(draft!._id);
    expect(delta.vendorId).toBe(catalog.vendorId);
    expect(delta.sourceRangeStart).toBe(WEEK_ONE.key);
    const deltaLine = await lineFor(
      roles.procurement,
      tenantId,
      delta._id,
      beansId,
    );
    expect(Number(deltaLine!.orderedQuantity)).toBeCloseTo(2, 4);
    expect(
      await linkedEventIds(roles.procurement, tenantId, deltaLine!._id),
    ).toEqual([eventId]);

    // A second rise grows the same delta line; still one open draft.
    await events(M.Event_changeHeadcount, {
      docId: eventId,
      version: await versionOf(roles.events, eventId),
      newHeadcount: 70,
    });
    const deltaAgain = await lineFor(
      roles.procurement,
      tenantId,
      delta._id,
      beansId,
    );
    expect(deltaAgain!._id).toBe(deltaLine!._id);
    expect(Number(deltaAgain!.orderedQuantity)).toBeCloseTo(3, 4);
    expect(await orders(roles.procurement, tenantId)).toHaveLength(2);
    expect(await readRow<LineRow>(roles.procurement, sentLine!._id)).toEqual(
      sentLineBefore,
    );

    // Falling back below the sent amount: the delta draft has nothing left
    // to buy and goes away; the sent order is still untouched.
    await events(M.Event_changeHeadcount, {
      docId: eventId,
      version: await versionOf(roles.events, eventId),
      newHeadcount: 30,
    });
    expect(await drafts(roles.procurement, tenantId)).toHaveLength(0);
    expect(await readRow<LineRow>(roles.procurement, sentLine!._id)).toEqual(
      sentLineBefore,
    );
  });

  // BE-10.5: less demand after sending shows the buyer the extra; the sent
  // order is still not rewritten and no draft appears.
  it("demand falling after submission leaves the sent order alone and shows the extra to the buyer", async () => {
    const proof = harness();
    const tenantId = "tenant-ac474-post-submit-drop";
    const roles = rolesFor(proof, tenantId);
    const buyer = runner(proof, roles.procurement);
    const events = runner(proof, roles.events);
    const catalog = await seedCatalog(proof, tenantId, [
      { name: "Chickpeas", perServing: 0.1 },
    ]);
    const [chickpeasId] = catalog.ingredientIds as [string];
    const eventId = await approvedEvent(proof, tenantId, {
      title: "AC-474 smaller party",
      headcount: 40,
      dishIds: catalog.dishIds,
    });
    const [draft] = await drafts(roles.procurement, tenantId);
    const line = await lineFor(
      roles.procurement,
      tenantId,
      draft!._id,
      chickpeasId,
    );
    await buyer(M.VendorOrder_submit, {
      docId: draft!._id,
      version: draft!.version,
    });
    const sentLine = await readRow<LineRow>(roles.procurement, line!._id);

    await events(M.Event_changeHeadcount, {
      docId: eventId,
      version: await versionOf(roles.events, eventId),
      newHeadcount: 30,
    });

    expect(await readRow<LineRow>(roles.procurement, line!._id)).toEqual(
      sentLine,
    );
    // No empty "PO" draft with a zero line appears for the buyer.
    expect(await drafts(roles.procurement, tenantId)).toHaveLength(0);
    const surplus = sentOrderSurplus({
      needs: await liveRows<SurplusNeed & { tenantId: string }>(
        roles.procurement,
        "purchaseNeeds",
        tenantId,
      ),
      orders: await orders(roles.procurement, tenantId),
    });
    expect(surplus).toHaveLength(1);
    expect(surplus[0]).toMatchObject({
      eventId,
      ingredientId: chickpeasId,
      vendorOrderId: draft!._id,
      orderedFor: 4,
      nowNeeded: 3,
      extra: 1,
      eventCancelled: false,
    });
  });
});
