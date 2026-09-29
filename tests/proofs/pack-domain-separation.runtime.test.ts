/**
 * Runtime proof (PL-PACK-RULES, spec §13.1, AC-520): food prep and stock
 * are a separate system from equipment and packing. Finishing a prep line
 * and using held stock never change a pack line, a piece of equipment or
 * its hold - while container and rule lines still sit on the pack list.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  S,
  seedContainerDishLine,
} from "./pack-quantity-override-survival.runtime.helpers";
import {
  finishPrepLine,
  hireCook,
} from "./plan-vs-fact-completed-prep.runtime.helpers";
import {
  createPlannedEvent,
  defineRule,
  harness,
  liveRows,
  openPackList,
  packLines,
  rolesFor,
  runner,
} from "./pack-rules.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

describe("runtime proof: packing stays apart from food prep and stock", () => {
  it("a stock issue and a prep completion never mutate equipment or pack quantities (AC-520)", async () => {
    const proof = harness();
    const tenantId = "tenant-pack-domain-separation";
    const roles = rolesFor(proof, tenantId);
    const { eventId } = await createPlannedEvent(
      proof,
      tenantId,
      "Domain separation",
    );
    const dish = await seedContainerDishLine(
      proof,
      tenantId,
      eventId,
      "Braised greens",
    );
    await defineRule(proof, tenantId, {
      trigger: "dish",
      dishId: dish.dishId,
      description: "Serving spoon",
      category: "utensil",
      baseQuantity: 2,
    });
    const packListId = await openPackList(
      proof,
      tenantId,
      eventId,
      "Separation list",
    );
    const logistics = runner(proof, roles.logistics);
    const chafer = await logistics(M.Equipment_createViaRegister, {
      name: "Round chafer",
      assetTag: "CH-SEP",
      category: "holding",
      ownership: "owned",
      quantity: 6,
    });
    await proof.executeCommand(roles.logistics, api.equipmentCheckout.reserve, {
      equipmentId: chafer.docId,
      eventId,
      startsAt: S.startsAt,
      endsAt: S.endsAt,
      quantity: 3,
    } as never);

    const packBefore = await packLines(roles.owner, tenantId, packListId);
    expect(packBefore.map((row) => row.description)).toEqual([
      "Braised greens container",
      "Round chafer",
      "Serving spoon",
    ]);
    const gearBefore = await liveRows(roles.owner, "equipments", tenantId);
    const holdsBefore = await liveRows(
      roles.owner,
      "equipmentReservations",
      tenantId,
    );

    // Food side: a prep line is finished and held stock is used.
    const kitchen = runner(proof, roles.kitchen);
    const prep = await kitchen(M.PrepTask_createViaOpen, {
      eventDishId: dish.lineId,
      eventId,
      name: "Wash greens",
      quantity: 40,
      unit: "portion",
    });
    await finishPrepLine(
      proof,
      tenantId,
      prep.docId,
      await hireCook(proof, tenantId, "separation"),
      40,
    );
    const inventory = proof.asRole({
      subject: `inv-${tenantId}`,
      role: "inventory_staff",
      tenantId,
    });
    const stock = runner(proof, inventory);
    const ingredient = await kitchen(M.Ingredient_createViaIntroduce, {
      name: "Collard greens",
      unit: "kilogram",
      costPerUnit: 3,
      allergens: [],
      category: "produce",
    });
    const shelf = await stock(M.StorageLocation_createViaRegister, {
      name: "Walk-in",
      locationType: "cold",
    });
    const item = await stock(M.InventoryItem_createViaOpen, {
      ingredientId: ingredient.docId,
      locationId: shelf.docId,
      unit: "kilogram",
      quantityOnHand: 20,
    });
    const hold = await stock(M.InventoryReservation_createViaReserve, {
      inventoryItemId: item.docId,
      eventId,
      ingredientId: ingredient.docId,
      quantity: 8,
    });
    await stock(M.InventoryReservation_consume, {
      docId: hold.docId,
      version: 1,
    });

    expect(await packLines(roles.owner, tenantId, packListId)).toEqual(
      packBefore,
    );
    expect(await liveRows(roles.owner, "equipments", tenantId)).toEqual(
      gearBefore,
    );
    expect(
      await liveRows(roles.owner, "equipmentReservations", tenantId),
    ).toEqual(holdsBefore);
  });
});
