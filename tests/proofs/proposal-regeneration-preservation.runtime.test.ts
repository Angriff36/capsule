/**
 * PL-PROPOSAL-DRAFT runtime proof (AC-417, spec §7.2.7): a rebuild from the
 * event keeps what staff did to the draft - their wording, price and override
 * reason on a generated line, a line they took out, a line they typed by hand -
 * and names the sections the event changed under them.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  generate,
  liveLines,
  proposalRow,
  report,
  seedWorld,
} from "./proposal-generate.runtime.helpers";

const M = api.mutations;

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("proposal regeneration preservation (AC-417)", () => {
  it("regeneration keeps authored text/adjustments/exclusions and marks stale sections", async () => {
    const w = await seedWorld("tenant-regeneration-preservation");
    const built = await generate(w);
    const lib = api.lib as any;
    const [salmon, brisket] = await liveLines(w, built.proposalId);
    expect([salmon.description, brisket.description]).toEqual([
      "Cedar salmon",
      "Smoked brisket",
    ]);

    // Staff reword and reprice the salmon (with a reason), take the brisket
    // out, and type a line of their own.
    await w.sales.mutation(lib.proposalPricing.reviseProposalLineAndRecompute, {
      docId: salmon._id,
      description: "Cedar-planked salmon with lemon butter",
      pricingBasis: "per_unit",
      unitPrice: 26,
      quantity: 40,
      menuDishId: salmon.menuDishId,
      overrideReason: "Chef's premium plating",
    });
    await w.sales.mutation(lib.proposalPricing.removeProposalLineAndRecompute, {
      docId: brisket._id,
    });
    await w.sales.mutation(lib.proposalPricing.addProposalLineAndRecompute, {
      proposalId: built.proposalId,
      description: "Late-night snack table",
      pricingBasis: "flat",
      unitPrice: 150,
      quantity: 1,
    });

    // The event changes under the draft.
    await w.runOwner(M.EventDish_adjustServings, {
      docId: w.eventDishes.salmon,
      quantityServings: 50,
    });
    await w.runOwner(M.EventDish_adjustServings, {
      docId: w.eventDishes.brisket,
      quantityServings: 35,
    });
    await w.runOwner(M.EventDish_createViaAddToEvent, {
      eventId: w.eventId,
      dishId: w.dishes.tart,
      quantityServings: 40,
    });

    const stale = await report(w, built.proposalId);
    const menu = stale.sections.find((s) => s.key === "menu")!;
    expect(menu.stale).toBe(true);
    expect(menu.staleReasons.join(" ")).toContain(
      "Cedar-planked salmon with lemon butter",
    );

    const rebuilt = await generate(w);
    expect(rebuilt).toMatchObject({
      proposalId: built.proposalId,
      created: false,
      changed: true,
    });
    const after = await liveLines(w, built.proposalId);
    expect(
      after.map((l) => [
        l.description,
        l.unitPrice,
        l.quantity,
        l.overrideReason ?? null,
      ]),
    ).toEqual([
      ["Apple tart", 7, 40, null],
      [
        "Cedar-planked salmon with lemon butter",
        26,
        40,
        "Chef's premium plating",
      ],
      ["Late-night snack table", 150, 1, null],
    ]);
    const row = await proposalRow(w, built.proposalId);
    expect(row.title).toBe("Harvest dinner");
    expect(row.subtotal).toBe(280 + 1040 + 150);

    // The staff line still stands against a changed dish: named, not undone.
    const afterReport = await report(w, built.proposalId);
    const menuAfter = afterReport.sections.find((s) => s.key === "menu")!;
    expect(menuAfter.stale).toBe(true);
    expect(menuAfter.staleReasons).toHaveLength(1);
    expect(menuAfter.staleReasons[0]).toContain(
      "Cedar-planked salmon with lemon butter",
    );

    // Replay after the rebuild changes nothing and keeps the brisket out.
    expect(await generate(w)).toEqual({
      proposalId: built.proposalId,
      created: false,
      changed: false,
      outcome: "reused",
      version: expect.any(Number),
    });
    expect(
      (await liveLines(w, built.proposalId)).map((l) => l.description),
    ).not.toContain("Smoked brisket");
  });
});
