/**
 * Runtime proof (PL-PACK-RULES, spec §13.2 reconciliation):
 * AC-522 kit and container lines are stable under re-runs;
 * AC-523 a serving change resizes following lines, a hand-set line stays;
 * AC-524 removing a dish retires its unpacked generated lines only;
 * AC-525 operator lines, notes, hand-set amounts, exclusions and packed
 * counts survive every recalculation.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import { seedContainerDishLine } from "./pack-quantity-override-survival.runtime.helpers";
import {
  createPlannedEvent,
  defineRule,
  harness,
  line,
  openPackList,
  packLines,
  rolesFor,
  runner,
  version,
  type PackLine,
} from "./pack-rules.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  process.env.CONVEX_FIELD_ENCRYPTION_KEY ||=
    "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
});

function snapshot(lines: PackLine[]) {
  return lines.map((row) => [
    row._id,
    row.description,
    row.requiredQuantity,
    row.version,
  ]);
}

describe("runtime proof: stable pack lines", () => {
  it("re-applying a kit and re-syncing a container update the same lines and never duplicate (AC-522)", async () => {
    const proof = harness();
    const tenantId = "tenant-pack-stable-kit";
    const roles = rolesFor(proof, tenantId);
    const { eventId } = await createPlannedEvent(proof, tenantId, "Stable kit");
    const style = await runner(proof, roles.owner)(
      M.ServiceStyle_createViaRegister,
      { name: "Buffet", code: "BUF" },
    );
    await runner(proof, roles.logistics)(M.ServiceStyleKitItem_createViaAdd, {
      serviceStyleId: style.docId,
      description: "Buffet table skirt",
      baseQuantity: 2,
    });
    await runner(proof, roles.events)(M.Event_changeServiceStyle, {
      docId: eventId,
      serviceStyleId: style.docId,
      serviceStyleName: "Buffet",
      version: await version(roles.owner, eventId),
    });
    const dish = await seedContainerDishLine(
      proof,
      tenantId,
      eventId,
      "Lasagna",
    );
    await defineRule(proof, tenantId, {
      trigger: "dish",
      dishId: dish.dishId,
      description: "Lasagna spatula",
      category: "utensil",
      baseQuantity: 1,
    });
    const packListId = await openPackList(
      proof,
      tenantId,
      eventId,
      "Stable kit list",
    );
    const first = await packLines(roles.owner, tenantId, packListId);
    expect(first.map((row) => [row.description, row.requiredQuantity])).toEqual(
      [
        ["Buffet table skirt", 2],
        ["Lasagna container", 4],
        ["Lasagna spatula", 1],
      ],
    );

    const run = runner(proof, roles.logistics);
    for (let i = 0; i < 2; i++) {
      await run(M.PackList_applyServiceStyleKit, {
        docId: packListId,
        serviceStyleId: style.docId,
        version: await version(roles.owner, packListId),
      });
      await runner(proof, roles.kitchen)(M.EventDish_requestContainerPack, {
        docId: dish.lineId,
        packListId,
        version: await version(roles.owner, dish.lineId),
      });
      await proof.executeCommand(
        roles.logistics,
        api.lib.safeMaterialization.refreshPackRules,
        { packListId } as never,
      );
    }
    const again = await packLines(roles.owner, tenantId, packListId);
    expect(
      again.map((row) => [row._id, row.description, row.requiredQuantity]),
    ).toEqual(
      first.map((row) => [row._id, row.description, row.requiredQuantity]),
    );
    // The rule line was not rewritten at all by the refreshes.
    expect(line(again, "Lasagna spatula").version).toBe(
      line(first, "Lasagna spatula").version,
    );
  });

  it("raising servings resizes the container line, a manual override stays, and replay is stable (AC-523)", async () => {
    const proof = harness();
    const tenantId = "tenant-pack-serving-resize";
    const roles = rolesFor(proof, tenantId);
    const { eventId } = await createPlannedEvent(
      proof,
      tenantId,
      "Serving resize",
    );
    const follow = await seedContainerDishLine(
      proof,
      tenantId,
      eventId,
      "Salmon",
    );
    const manual = await seedContainerDishLine(
      proof,
      tenantId,
      eventId,
      "Risotto",
    );
    await defineRule(proof, tenantId, {
      trigger: "dish",
      dishId: follow.dishId,
      description: "Fish spatula",
      category: "utensil",
      scaleBy: "servings",
      perUnits: 20,
      baseQuantity: 0,
    });
    const packListId = await openPackList(
      proof,
      tenantId,
      eventId,
      "Resize list",
    );
    let lines = await packLines(roles.owner, tenantId, packListId);
    await runner(proof, roles.logistics)(M.PackListItem_adjustQuantity, {
      docId: line(lines, "Risotto container")._id,
      requiredQuantity: 9,
    });

    const adjust = async (lineId: string, servings: number) =>
      runner(proof, roles.events)(M.EventDish_adjustServings, {
        docId: lineId,
        quantityServings: servings,
        version: await version(roles.owner, lineId),
      });
    await adjust(follow.lineId, 70);
    await adjust(manual.lineId, 70);
    lines = await packLines(roles.owner, tenantId, packListId);
    expect(line(lines, "Salmon container").requiredQuantity).toBe(7);
    expect(line(lines, "Fish spatula").requiredQuantity).toBe(4);
    expect(line(lines, "Risotto container").requiredQuantity).toBe(9);
    expect(line(lines, "Risotto container").followsDishServings).toBe(false);

    // The same servings again: same lines, same amounts, rule line untouched.
    await adjust(follow.lineId, 70);
    const replay = await packLines(roles.owner, tenantId, packListId);
    expect(replay.map((row) => [row._id, row.requiredQuantity])).toEqual(
      lines.map((row) => [row._id, row.requiredQuantity]),
    );
    expect(line(replay, "Fish spatula").version).toBe(
      line(lines, "Fish spatula").version,
    );
  });

  it("dish removal zeroes and retires its uncommitted generated lines, keeps packed lines and manual lines untouched (AC-524)", async () => {
    const proof = harness();
    const tenantId = "tenant-pack-remove-dish";
    const roles = rolesFor(proof, tenantId);
    const { eventId } = await createPlannedEvent(
      proof,
      tenantId,
      "Remove dish",
    );
    const gone = await seedContainerDishLine(
      proof,
      tenantId,
      eventId,
      "Short ribs",
    );
    await seedContainerDishLine(proof, tenantId, eventId, "Polenta");
    await defineRule(proof, tenantId, {
      trigger: "dish",
      dishId: gone.dishId,
      description: "Carving knife",
      category: "utensil",
      baseQuantity: 1,
    });
    const packListId = await openPackList(
      proof,
      tenantId,
      eventId,
      "Remove list",
    );
    const run = runner(proof, roles.logistics);
    await run(M.PackListItem_createViaAddItem, {
      packListId,
      description: "Extra linens",
      requiredQuantity: 3,
      unit: "each",
    });
    await run(M.PackList_startPacking, {
      docId: packListId,
      version: await version(roles.owner, packListId),
    });
    let lines = await packLines(roles.owner, tenantId, packListId);
    await run(M.PackListItem_markPacked, {
      docId: line(lines, "Short ribs container")._id,
      packedQuantity: 4,
    });
    const before = await packLines(roles.owner, tenantId, packListId);

    await runner(proof, roles.events)(M.EventDish_remove, {
      docId: gone.lineId,
      reason: "Client swapped the main",
      version: await version(roles.owner, gone.lineId),
    });
    lines = await packLines(roles.owner, tenantId, packListId);
    const knife = line(lines, "Carving knife");
    expect(knife.requiredQuantity).toBe(0);
    expect(knife.retiredAt).toEqual(expect.any(Number));
    const packed = line(lines, "Short ribs container");
    expect(packed.packedQuantity).toBe(4);
    expect(packed.retiredAt ?? null).toBeNull();
    expect(packed.requiredQuantity).toBe(0);
    expect(line(lines, "Polenta container")).toMatchObject({
      requiredQuantity: 4,
      version: line(before, "Polenta container").version,
    });
    expect(line(lines, "Extra linens")).toMatchObject({
      requiredQuantity: 3,
      version: line(before, "Extra linens").version,
    });
  });

  it("operator item, note, hand-set amount, exclusion and packed count survive every recalculation (AC-525)", async () => {
    const proof = harness();
    const tenantId = "tenant-pack-operator-survival";
    const roles = rolesFor(proof, tenantId);
    const { eventId } = await createPlannedEvent(
      proof,
      tenantId,
      "Operator survival",
    );
    const dish = await seedContainerDishLine(
      proof,
      tenantId,
      eventId,
      "Paella",
    );
    await defineRule(proof, tenantId, {
      trigger: "dish",
      dishId: dish.dishId,
      description: "Paella spoon",
      category: "utensil",
      scaleBy: "servings",
      perUnits: 10,
      baseQuantity: 0,
    });
    await defineRule(proof, tenantId, {
      trigger: "guest_count",
      description: "Napkins",
      category: "disposable",
      scaleBy: "guests",
      perUnits: 1,
      baseQuantity: 0,
      returnRequired: false,
    });
    const packListId = await openPackList(
      proof,
      tenantId,
      eventId,
      "Survival list",
    );
    const run = runner(proof, roles.logistics);
    let lines = await packLines(roles.owner, tenantId, packListId);
    await run(M.PackListItem_createViaAddItem, {
      packListId,
      description: "Client's cake stand",
      requiredQuantity: 1,
      unit: "each",
    });
    await run(M.PackListItem_adjustQuantity, {
      docId: line(lines, "Napkins")._id,
      requiredQuantity: 100,
    });
    await run(M.PackListItem_annotate, {
      docId: line(lines, "Paella spoon")._id,
      note: "Long handles",
    });
    await run(M.PackListItem_exclude, {
      docId: line(lines, "Paella container")._id,
      reason: "Paella goes in the client's pan",
      coveredBy: "client",
    });
    await run(M.PackList_startPacking, {
      docId: packListId,
      version: await version(roles.owner, packListId),
    });
    await run(M.PackListItem_recordPackedCount, {
      docId: line(lines, "Paella spoon")._id,
      packedQuantity: 2,
    });

    await runner(proof, roles.events)(M.Event_changeHeadcount, {
      docId: eventId,
      newHeadcount: 80,
      version: await version(roles.owner, eventId),
    });
    await runner(proof, roles.events)(M.EventDish_adjustServings, {
      docId: dish.lineId,
      quantityServings: 90,
      version: await version(roles.owner, dish.lineId),
    });
    for (let i = 0; i < 2; i++)
      await proof.executeCommand(
        roles.logistics,
        api.lib.safeMaterialization.refreshPackRules,
        { packListId } as never,
      );

    lines = await packLines(roles.owner, tenantId, packListId);
    expect(line(lines, "Client's cake stand").requiredQuantity).toBe(1);
    const napkins = line(lines, "Napkins");
    expect(napkins.requiredQuantity).toBe(100);
    expect(napkins.generatedQuantity).toBe(80);
    const spoon = line(lines, "Paella spoon") as PackLine & { note?: string };
    expect(spoon.requiredQuantity).toBe(9);
    expect(spoon.packedQuantity).toBe(2);
    expect(spoon.note).toBe("Long handles");
    const pan = line(lines, "Paella container") as PackLine & {
      exclusionReason?: string;
      coveredBy?: string;
    };
    expect(pan.excludedAt).toEqual(expect.any(Number));
    expect(pan.exclusionReason).toBe("Paella goes in the client's pan");
    expect(pan.coveredBy).toBe("client");
    expect(snapshot(lines)).toHaveLength(4);
  });
});
