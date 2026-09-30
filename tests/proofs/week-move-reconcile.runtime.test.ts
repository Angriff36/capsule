/**
 * Runtime proof (AC-471, BE-10.3 / BE-10.5): moving an event to another
 * purchasing week moves only its open contribution. The old week's draft
 * shrinks to what the other events still need, the new week's draft gets the
 * moved event, and later changes land on the new week only.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  approvedEvent,
  drafts,
  harness,
  lineFor,
  linkedEventIds,
  rolesFor,
  runner,
  seedCatalog,
  versionOf,
  WEEK_ONE,
  WEEK_TWO,
} from "./weekly-purchasing.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("runtime proof: week move reconciles both drafts (AC-471)", () => {
  it("rescheduling to another week moves only open contributions and reconciles both drafts", async () => {
    const proof = harness();
    const tenantId = "tenant-ac471-week-move";
    const roles = rolesFor(proof, tenantId);
    const events = runner(proof, roles.events);
    const catalog = await seedCatalog(proof, tenantId, [
      { name: "Polenta", perServing: 0.1 },
    ]);
    const [polentaId] = catalog.ingredientIds as [string];
    const moving = await approvedEvent(proof, tenantId, {
      title: "AC-471 moving",
      headcount: 60,
      dishIds: catalog.dishIds,
    });
    const staying = await approvedEvent(proof, tenantId, {
      title: "AC-471 staying",
      headcount: 40,
      dishIds: catalog.dishIds,
    });

    const [weekOne] = await drafts(roles.procurement, tenantId);
    expect(weekOne!.sourceRangeStart).toBe(WEEK_ONE.key);
    const shared = await lineFor(
      roles.procurement,
      tenantId,
      weekOne!._id,
      polentaId,
    );
    expect(Number(shared!.orderedQuantity)).toBeCloseTo(10, 4);
    expect(
      await linkedEventIds(roles.procurement, tenantId, shared!._id),
    ).toEqual([moving, staying].sort());

    await events(M.Event_reschedule, {
      docId: moving,
      version: await versionOf(roles.events, moving),
      startsAt: WEEK_TWO.startsAt,
      endsAt: WEEK_TWO.endsAt,
    });

    const open = await drafts(roles.procurement, tenantId);
    expect(open).toHaveLength(2);
    const weekOneAfter = open.find((o) => o.sourceRangeStart === WEEK_ONE.key);
    const weekTwo = open.find((o) => o.sourceRangeStart === WEEK_TWO.key);
    expect(weekOneAfter!._id).toBe(weekOne!._id);
    expect(weekTwo).toBeDefined();

    const oldLine = await lineFor(
      roles.procurement,
      tenantId,
      weekOne!._id,
      polentaId,
    );
    expect(oldLine!._id).toBe(shared!._id);
    expect(Number(oldLine!.orderedQuantity)).toBeCloseTo(4, 4);
    expect(
      await linkedEventIds(roles.procurement, tenantId, oldLine!._id),
    ).toEqual([staying]);

    const newLine = await lineFor(
      roles.procurement,
      tenantId,
      weekTwo!._id,
      polentaId,
    );
    expect(Number(newLine!.orderedQuantity)).toBeCloseTo(6, 4);
    expect(
      await linkedEventIds(roles.procurement, tenantId, newLine!._id),
    ).toEqual([moving]);

    // Later changes to the moved event follow it to the new week only.
    await events(M.Event_changeHeadcount, {
      docId: moving,
      version: await versionOf(roles.events, moving),
      newHeadcount: 80,
    });
    const newLineAfter = await lineFor(
      roles.procurement,
      tenantId,
      weekTwo!._id,
      polentaId,
    );
    expect(Number(newLineAfter!.orderedQuantity)).toBeCloseTo(8, 4);
    const oldLineAfter = await lineFor(
      roles.procurement,
      tenantId,
      weekOne!._id,
      polentaId,
    );
    expect(Number(oldLineAfter!.orderedQuantity)).toBeCloseTo(4, 4);
  });
});
