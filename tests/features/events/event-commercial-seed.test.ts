import { describe, expect, it } from "vitest";
import { eventCommercialQuotedPrice } from "../../../src/features/events/eventCommercialSeed";

describe("eventCommercialQuotedPrice", () => {
  it("prints the Event seed over a later live proposal total", () => {
    expect(
      eventCommercialQuotedPrice({
        quotedPrice: 2000,
        liveProposalTotal: 9999,
      }),
    ).toBe(2000);
  });

  it("treats a stored 0 as a real seed, not a missing one", () => {
    expect(
      eventCommercialQuotedPrice({ quotedPrice: 0, liveProposalTotal: 9999 }),
    ).toBe(0);
  });

  it("never invents a seed from a later proposal total", () => {
    expect(
      eventCommercialQuotedPrice({
        quotedPrice: null,
        liveProposalTotal: 9999,
      }),
    ).toBeNull();
  });

  it("returns null for a missing quoted price", () => {
    expect(eventCommercialQuotedPrice({ quotedPrice: undefined })).toBeNull();
    expect(eventCommercialQuotedPrice({})).toBeNull();
  });

  it("returns null for a non-finite quoted price", () => {
    expect(
      eventCommercialQuotedPrice({ quotedPrice: NaN, liveProposalTotal: 9999 }),
    ).toBeNull();
  });

  it("still returns the Event seed when no live proposal total is given", () => {
    expect(eventCommercialQuotedPrice({ quotedPrice: 2000 })).toBe(2000);
  });
});
