/**
 * AC-526 (BE-13-catalog-revision): a catalog container revision updates only
 * the pack lines that still follow it and never erases an event's own
 * choices.
 *
 * One dish ships in pans that hold 10. Three events serve 40 (4 pans each):
 *   A - its pan line still follows the dish, and it has a hand-added line
 *   B - its pan line was set by hand to 7
 *   C - its list was packed and has left on the truck
 * The pan is revised to hold 5. A goes to 8 pans; B keeps 7; C keeps the 4
 * that went out; A's hand-added line is untouched.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  S,
  createPlannedEvent,
  harness,
  openPackList,
  readRow,
  rolesFor,
  runner,
} from "./pack-quantity-override-survival.runtime.helpers";

const M = api.mutations;

type PackItemRow = {
  _id: string;
  packListId: string;
  dishContainerId?: string | null;
  description: string;
  requiredQuantity: number;
  packedQuantity: number;
  followsDishServings?: boolean | null;
  status: string;
  tenantId: string;
  deletedAt?: number | null;
};

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

describe("runtime proof: container revision (AC-526)", () => {
  it("a container revision resizes generated lines and leaves overridden and dispatched lines untouched", async () => {
    const proof = harness();
    const tenantId = "tenant-ac526-container-revision";
    const roles = rolesFor(proof, tenantId);
    const kitchen = runner(proof, roles.kitchen);
    const events = runner(proof, roles.events);
    const logistics = runner(proof, roles.logistics);

    const dish = await kitchen(M.Dish_createViaIntroduce, {
      name: "Braised short rib",
      portionSize: 1,
      portionUnit: "portion",
    });
    const container = await kitchen(M.DishContainer_createViaDefine, {
      dishId: dish.docId,
      name: "Half hotel pan",
      serviceMethod: "cooked_at_kitchen",
      servingsPerContainer: 10,
      baseQuantity: 0,
      unit: "each",
    });

    const lists: Record<"A" | "B" | "C", string> = { A: "", B: "", C: "" };
    for (const key of ["A", "B", "C"] as const) {
      const { eventId } = await createPlannedEvent(
        proof,
        tenantId,
        `AC-526 event ${key}`,
      );
      await events(M.EventDish_createViaAddToEvent, {
        eventId,
        dishId: dish.docId,
        quantityServings: S.headcount,
      });
      lists[key] = await openPackList(proof, tenantId, eventId, `Pack ${key}`);
    }

    const itemsOf = async (packListId: string) =>
      (
        (await roles.events.run(async (ctx) =>
          ctx.db.query("packListItems").collect(),
        )) as unknown as PackItemRow[]
      ).filter(
        (row) =>
          row.tenantId === tenantId &&
          row.packListId === packListId &&
          row.deletedAt == null,
      );
    const panOf = async (packListId: string) => {
      const pan = (await itemsOf(packListId)).find(
        (row) => row.dishContainerId === container.docId,
      );
      if (!pan) throw new Error(`No pan line on ${packListId}`);
      return pan;
    };

    for (const key of ["A", "B", "C"] as const) {
      expect((await panOf(lists[key])).requiredQuantity).toBe(4);
    }

    // A: a hand-added line beside the generated one.
    const extra = await logistics(M.PackListItem_createViaAddItem, {
      packListId: lists.A,
      description: "Extra serving spoons",
      requiredQuantity: 3,
      unit: "each",
    });
    // B: the pan count set by hand.
    await logistics(M.PackListItem_adjustQuantity, {
      docId: (await panOf(lists.B))._id,
      requiredQuantity: 7,
    });
    // C: packed and out the door.
    await logistics(M.PackList_startPacking, { docId: lists.C });
    await logistics(M.PackListItem_markPacked, {
      docId: (await panOf(lists.C))._id,
      packedQuantity: 4,
    });
    await logistics(M.PackList_markPacked, { docId: lists.C });
    await logistics(M.PackList_markLoaded, { docId: lists.C });
    await logistics(M.PackList_dispatch, { docId: lists.C });

    // The catalog pan now holds 5.
    await kitchen(M.DishContainer_revise, {
      docId: container.docId,
      name: "Half hotel pan",
      serviceMethod: "cooked_at_kitchen",
      servingsPerContainer: 5,
      baseQuantity: 0,
      unit: "each",
    });

    const panA = await panOf(lists.A);
    expect(panA).toMatchObject({ requiredQuantity: 8, status: "listed" });
    expect(panA.followsDishServings).not.toBe(false);

    const panB = await panOf(lists.B);
    expect(panB).toMatchObject({
      requiredQuantity: 7,
      followsDishServings: false,
    });

    const panC = await panOf(lists.C);
    expect(panC).toMatchObject({
      requiredQuantity: 4,
      packedQuantity: 4,
      status: "packed",
    });
    const listC = await readRow<{ status: string }>(roles.events, lists.C);
    expect(listC.status).toBe("dispatched");

    const extraRow = await readRow<PackItemRow>(roles.events, extra.docId);
    expect(extraRow).toMatchObject({
      description: "Extra serving spoons",
      requiredQuantity: 3,
      status: "listed",
    });
    // No duplicate pan lines were made by the revision.
    for (const key of ["A", "B", "C"] as const) {
      const pans = (await itemsOf(lists[key])).filter(
        (row) => row.dishContainerId === container.docId,
      );
      expect(pans).toHaveLength(1);
    }
  });
});
