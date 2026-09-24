/**
 * Moving an event to another week carries the ingredient list that is still
 * being bought. Ingredient already received stays on the week it was bought.
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";

const S = {
  tenantId: "tenant-demand-week",
  startsAt: Date.UTC(2026, 6, 20, 16, 0),
  endsAt: Date.UTC(2026, 6, 20, 22, 0),
  nextStartsAt: Date.UTC(2026, 6, 28, 16, 0),
  nextEndsAt: Date.UTC(2026, 6, 28, 22, 0),
  oldWeek: 1,
} as const;

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

describe("runtime proof: reschedule moves live ingredient demand", () => {
  it("moves confirmed demand onto the new week and leaves fulfilled demand", async () => {
    const proof = harness();
    const owner = proof.asRole({
      subject: "owner-demand-week",
      role: "owner",
      tenantId: S.tenantId,
    });
    const client = (await proof.executeCommand(
      owner,
      api.mutations.Client_createViaRegister,
      { clientType: "company", companyName: "Week move client" },
    )) as { docId: string };
    const event = (await proof.executeCommand(
      owner,
      api.mutations.Event_createViaPlanEngagement,
      {
        clientId: client.docId,
        title: "Moved dinner",
        eventType: "catering",
        startsAt: S.startsAt,
        endsAt: S.endsAt,
        expectedHeadcount: 40,
        primaryContactName: "Pat Planner",
        budgetAmount: 2000,
        quotedPrice: 2400,
      },
    )) as { docId: string };

    const ids = await owner.run(async (ctx) => {
      const liveIngredientId = await ctx.db.insert("ingredients", {
        tenantId: S.tenantId,
        deletedAt: null,
        name: "Rice",
        unit: "kilogram",
        costPerUnit: 2,
        status: "active",
        version: 1,
      });
      const boughtIngredientId = await ctx.db.insert("ingredients", {
        tenantId: S.tenantId,
        deletedAt: null,
        name: "Oil",
        unit: "liter",
        costPerUnit: 4,
        status: "active",
        version: 1,
      });
      const liveDemandId = await ctx.db.insert("ingredientDemands", {
        tenantId: S.tenantId,
        deletedAt: null,
        eventId: event.docId as never,
        ingredientId: liveIngredientId,
        requiredQuantity: 10,
        unit: "kilogram",
        status: "confirmed",
        purchasingWeekStart: S.oldWeek,
        confirmedAt: S.startsAt,
        version: 1,
      });
      const boughtDemandId = await ctx.db.insert("ingredientDemands", {
        tenantId: S.tenantId,
        deletedAt: null,
        eventId: event.docId as never,
        ingredientId: boughtIngredientId,
        requiredQuantity: 2,
        unit: "liter",
        status: "fulfilled",
        purchasingWeekStart: S.oldWeek,
        confirmedAt: S.startsAt,
        fulfilledAt: S.startsAt,
        version: 1,
      });
      const stored = await ctx.db.get(event.docId as never);
      return {
        liveDemandId,
        boughtDemandId,
        version: (stored as { version?: number } | null)?.version,
      };
    });

    await proof.executeCommand(owner, api.mutations.Event_reschedule, {
      docId: event.docId,
      version: ids.version,
      startsAt: S.nextStartsAt,
      endsAt: S.nextEndsAt,
    });

    const after = await owner.run(async (ctx) => {
      const movedEvent = await ctx.db.get(event.docId as never);
      const live = await ctx.db.get(ids.liveDemandId);
      const bought = await ctx.db.get(ids.boughtDemandId);
      return {
        week: (movedEvent as { purchasingWeekStart?: number } | null)
          ?.purchasingWeekStart,
        liveWeek: (live as { purchasingWeekStart?: number } | null)
          ?.purchasingWeekStart,
        boughtWeek: (bought as { purchasingWeekStart?: number } | null)
          ?.purchasingWeekStart,
      };
    });

    expect(after.week).not.toBe(S.oldWeek);
    expect(after.liveWeek).toBe(after.week);
    expect(after.boughtWeek).toBe(S.oldWeek);
  });
});
