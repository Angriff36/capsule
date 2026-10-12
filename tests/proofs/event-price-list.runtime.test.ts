/**
 * Runtime proof: an event's price list (convex/lib/eventPriceList.ts). The
 * proposal "build from event" makes holds the event's price lines; while the
 * event is planned, its quoted price follows that list's total, so the event,
 * the proposal and a draft invoice show one number.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import {
  generate,
  liveLines,
  proposalRow,
  seedWorld,
} from "./proposal-generate.runtime.helpers";

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

const quoted = async (w: Awaited<ReturnType<typeof seedWorld>>) =>
  Number(
    (
      (await w.sales.query(api.queries.getEvent, {
        id: w.eventId as never,
      })) as { quotedPrice?: number }
    ).quotedPrice,
  );

describe("event price list", () => {
  it("the event's price follows its price list while it is planned", async () => {
    const w = await seedWorld("tenant-event-price-list");
    expect(await quoted(w)).toBe(4500);

    const built = await generate(w);
    expect((await proposalRow(w, built.proposalId)).total).toBe(1515);
    expect(await quoted(w)).toBe(1515);

    const list = (await w.sales.query(
      (api.lib as any).eventPriceList.forEvent,
      { eventId: w.eventId },
    )) as { proposalId: string; followsEvent: boolean; total: number };
    expect(list).toMatchObject({
      proposalId: built.proposalId,
      followsEvent: true,
      total: 1515,
    });

    // A dish priced differently for this one event.
    const salmon = (await liveLines(w, built.proposalId)).find(
      (line) => line.description === "Cedar salmon",
    )!;
    await w.sales.mutation(
      (api.lib as any).proposalPricing.reviseProposalLineAndRecompute,
      {
        docId: salmon._id,
        version: salmon.version,
        description: salmon.description,
        pricingBasis: "per_unit",
        unitPrice: 26,
        quantity: salmon.quantity,
        overrideReason: "Client asked for the larger cut",
      },
    );
    // 40 × $26 + 30 × $18.50
    expect((await proposalRow(w, built.proposalId)).total).toBe(1595);
    expect(await quoted(w)).toBe(1595);
  });
});
