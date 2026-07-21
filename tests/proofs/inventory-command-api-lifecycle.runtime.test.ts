/**
 * Happy-path proof: inventory reserve → reconcile → consume lifecycle over
 * POST /api/manifest/{entity}/commands/{command}, matching the UI coordinators.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { EventStockIssueCoordinator } from "../../src/features/events/EventStockIssueCoordinator";
import { EventStockReservationCoordinator } from "../../src/features/events/EventStockReservationCoordinator";
import { INVENTORY_HTTP_LIFECYCLE as S } from "../fixtures/inventory-http-lifecycle-scenario";
import { modules } from "./convex-test-modules";
import {
  dispatchCommand,
  loadRows,
  mapDemands,
  mapItems,
  mapReservations,
  seedApprovedEvent,
  seedStock,
} from "./inventory-command-api-lifecycle.helpers";

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: inventory command API lifecycle", () => {
  it("reserves, reconciles, and consumes through the authenticated HTTP dispatcher", async () => {
    const proof = harness();
    const eventId = await seedApprovedEvent(proof);
    const { inventory, ingredientId, itemId, demandId } = await seedStock(
      proof,
      eventId,
    );

    const reservationCoordinator = new EventStockReservationCoordinator({
      createReservation: async (input) => {
        const data = (await dispatchCommand(
          inventory,
          "InventoryReservation",
          "reserve",
          input,
        )) as { docId: string };
        return { docId: data.docId };
      },
      releaseReservation: async (input) => {
        await dispatchCommand(inventory, "InventoryReservation", "release", {
          docId: input.docId,
          version: input.version,
          reason: input.reason,
        });
      },
    });

    const firstSnapshot = await loadRows(inventory, eventId);
    const allocated = await reservationCoordinator.allocate({
      eventId,
      demands: mapDemands(firstSnapshot.demands),
      items: mapItems(firstSnapshot.items),
      reservations: mapReservations(firstSnapshot.reservations),
    });
    expect(allocated.created).toEqual([
      {
        inventoryItemId: itemId,
        ingredientId,
        quantity: S.initialDemand,
        unit: S.unit,
      },
    ]);
    expect(allocated.shortages).toEqual([]);

    const afterReserve = await loadRows(inventory, eventId);
    const activeAfterReserve = afterReserve.reservations.filter(
      (row: any) => row.status === "active",
    );
    expect(activeAfterReserve).toHaveLength(1);
    expect(activeAfterReserve[0]).toMatchObject({
      quantity: S.initialDemand,
      inventoryItemId: itemId,
      ingredientId,
    });
    const itemAfterReserve = afterReserve.items.find(
      (row: any) => row._id === itemId,
    );
    expect(itemAfterReserve?.quantityOnHand).toBe(S.onHand);
    const available =
      Number(itemAfterReserve?.quantityOnHand) -
      activeAfterReserve.reduce(
        (sum: number, row: any) => sum + Number(row.quantity),
        0,
      );
    expect(available).toBe(S.onHand - S.initialDemand);

    const demandRow = afterReserve.demands.find(
      (row: any) => row._id === demandId,
    );
    await dispatchCommand(inventory, "IngredientDemand", "recalculate", {
      docId: demandId,
      newQuantity: S.increasedDemand,
      reason: "Headcount bump",
      version: demandRow?.version,
    });

    const beforeReconcile = await loadRows(inventory, eventId);
    const reconciled = await reservationCoordinator.reconcile({
      eventId,
      demands: mapDemands(beforeReconcile.demands),
      items: mapItems(beforeReconcile.items),
      reservations: mapReservations(beforeReconcile.reservations),
    });
    expect(reconciled.created).toEqual([
      {
        inventoryItemId: itemId,
        ingredientId,
        quantity: S.increasedDemand - S.initialDemand,
        unit: S.unit,
      },
    ]);

    const afterReconcile = await loadRows(inventory, eventId);
    const activeAfterReconcile = afterReconcile.reservations
      .filter((row: any) => row.status === "active")
      .sort((a: any, b: any) => Number(a.quantity) - Number(b.quantity));
    expect(activeAfterReconcile).toHaveLength(2);
    expect(
      activeAfterReconcile.map((row: any) => Number(row.quantity)),
    ).toEqual([S.increasedDemand - S.initialDemand, S.initialDemand]);

    // Reactions land asynchronously, so a version captured from a row
    // snapshot can go stale before its dispatch. On VERSION_MISMATCH,
    // re-read THAT row's version and retry the single command once —
    // idempotent-safe, unlike retrying a whole multi-command issue().
    const dispatchFresh = async (
      entity: "InventoryReservation" | "IngredientDemand",
      command: string,
      docId: string,
      version: number | undefined,
    ) => {
      try {
        await dispatchCommand(inventory, entity, command, { docId, version });
      } catch (error) {
        if (!String(error).includes("VERSION_MISMATCH")) throw error;
        const rows = await loadRows(inventory, eventId);
        const pool =
          entity === "InventoryReservation" ? rows.reservations : rows.demands;
        const row = pool.find((r: any) => String(r._id) === docId);
        await dispatchCommand(inventory, entity, command, {
          docId,
          version: row?.version,
        });
      }
    };
    const issueCoordinator = new EventStockIssueCoordinator({
      consumeReservation: async (input) => {
        await dispatchFresh(
          "InventoryReservation",
          "consume",
          input.docId,
          input.version,
        );
      },
      confirmDemand: async (input) => {
        await dispatchFresh(
          "IngredientDemand",
          "confirm",
          input.docId,
          input.version,
        );
      },
      fulfillDemand: async (input) => {
        await dispatchFresh(
          "IngredientDemand",
          "fulfill",
          input.docId,
          input.version,
        );
      },
    });

    const freshFirst = await loadRows(inventory, eventId);
    const firstIssue = await issueCoordinator.issue({
      eventId,
      reservationId: String(activeAfterReconcile[0]._id),
      reservations: mapReservations(freshFirst.reservations),
      demands: mapDemands(freshFirst.demands),
      items: mapItems(freshFirst.items),
    });
    expect(firstIssue.fulfilledDemandId).toBeNull();
    expect(firstIssue.demandPreserved).toBe(true);
    expect(firstIssue.stockAdjustment.quantityOnHand).toBe(
      S.onHand - (S.increasedDemand - S.initialDemand),
    );

    const afterPartial = await loadRows(inventory, eventId);
    const itemAfterPartial = afterPartial.items.find(
      (row: any) => row._id === itemId,
    );
    expect(itemAfterPartial?.quantityOnHand).toBe(
      S.onHand - (S.increasedDemand - S.initialDemand),
    );
    const demandAfterPartial = afterPartial.demands.find(
      (row: any) => row._id === demandId,
    );
    expect(["calculated", "confirmed"]).toContain(demandAfterPartial?.status);

    const remainingActive = afterPartial.reservations.find(
      (row: any) => row.status === "active",
    );
    expect(remainingActive).toBeTruthy();

    const freshSecond = await loadRows(inventory, eventId);
    const secondIssue = await issueCoordinator.issue({
      eventId,
      reservationId: String(remainingActive!._id),
      reservations: mapReservations(freshSecond.reservations),
      demands: mapDemands(freshSecond.demands),
      items: mapItems(freshSecond.items),
    });
    expect(secondIssue.fulfilledDemandId).toBe(demandId);
    expect(secondIssue.demandPreserved).toBe(false);

    const afterFulfill = await loadRows(inventory, eventId);
    const itemFinal = afterFulfill.items.find((row: any) => row._id === itemId);
    expect(itemFinal?.quantityOnHand).toBe(S.onHand - S.increasedDemand);
    const demandFinal = afterFulfill.demands.find(
      (row: any) => row._id === demandId,
    );
    expect(demandFinal?.status).toBe("fulfilled");
    expect(
      afterFulfill.reservations.every((row: any) => row.status === "consumed"),
    ).toBe(true);
  });
});
