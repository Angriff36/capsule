import { describe, expect, it } from "vitest";
import { proposalTemplateDefaults } from "../src/features/clients/proposalTemplateDefaults";

describe("proposal template defaults", () => {
  it("converts fractional rates into one percentage line and a fixed tax amount", () => {
    expect(
      proposalTemplateDefaults(
        {
          defaultTerms: "Net 14",
          defaultNotes: "Seasonal menu",
          defaultTaxRate: 0.0825,
          defaultServiceChargePercent: 0.2,
          validityDays: 21,
          visibleSections: ["event_summary", "pricing_summary", "terms"],
        },
        1000,
        new Date("2026-09-06T12:00:00"),
      ),
    ).toEqual({
      terms: "Net 14",
      notes: "Seasonal menu",
      expiresOn: "2026-09-27",
      taxAmount: 99,
      visibleSections: ["event_summary", "pricing_summary", "terms"],
      serviceChargeLine: {
        description: "Service charge",
        pricingBasis: "percentage",
        unitPrice: 20,
        quantity: 1,
        unit: "%",
      },
    });
  });

  it("keeps legacy defaults when no template is selected", () => {
    expect(
      proposalTemplateDefaults(null, 1000, new Date("2026-09-06T12:00:00")),
    ).toEqual({
      terms: "",
      notes: "",
      expiresOn: "2026-09-20",
      taxAmount: 0,
      visibleSections: [],
      serviceChargeLine: null,
    });
  });
});
