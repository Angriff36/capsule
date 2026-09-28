import { describe, expect, it } from "vitest";
import {
  projectProposalPdf,
  proposalPdfDownloadNotice,
  downloadProjectedProposalPdf,
} from "../src/features/clients/proposalPdfProjection";
import { buildProposalPdf } from "../src/features/clients/proposalPdf";

const live = {
  _id: "proposal-1",
  title: "Changed live title",
  eventDate: 99,
  eventType: "changed live type",
  guestCount: 99,
  venueName: "Changed live venue",
  venueAddress: "Changed live address",
  subtotal: 999,
  taxAmount: 99,
  discountAmount: 0,
  total: 1098,
  terms: "Changed live terms",
  notes: "Changed live notes",
  pricingLines: [],
  timelineItems: [{ time: "9:00 PM", activity: "Changed live activity" }],
  venueLogistics: { loadIn: "Changed private load-in" },
};

describe("published proposal PDF projection", () => {
  it("uses only the immutable revision when a published snapshot exists", () => {
    const result = projectProposalPdf(live, "Changed live client", {
      snapshot: JSON.stringify({
        proposal: {
          title: "Frozen title",
          eventDate: 1,
          eventType: "frozen type",
          guestCount: 10,
          venueName: "Frozen venue",
          venueAddress: "Frozen address",
          subtotal: 100,
          taxAmount: 8,
          discountAmount: 0,
          total: 108,
          terms: "Frozen terms",
          notes: "Frozen notes",
          visibleSections: ["pricing_summary", "terms"],
        },
        client: { name: "Frozen client" },
        venue: null,
        dishSelections: [],
        lineItems: [],
        enhancements: [],
        timeline: [{ name: "Frozen activity", startsAt: 1 }],
      }),
    });
    expect(result.source).toBe("revision");
    expect(result.clientName).toBe("Frozen client");
    expect(result.proposal).toMatchObject({
      title: "Frozen title",
      venueName: "Frozen venue",
      terms: "Frozen terms",
      venueLogistics: undefined,
    });
    expect(JSON.stringify(result)).not.toContain("Changed live");
  });

  it("uses the explicit live fallback for a legacy malformed snapshot", () => {
    const result = projectProposalPdf(live, "Live client", {
      snapshot: "not-json",
    });
    expect(result).toMatchObject({
      source: "legacy-malformed-snapshot",
      clientName: "Live client",
      proposal: { title: "Changed live title" },
    });
  });

  it("distinguishes an absent legacy snapshot and gives both fallbacks visible provenance", async () => {
    const missing = projectProposalPdf(live, "Live client", null);
    expect(missing.source).toBe("legacy-missing-snapshot");
    expect(proposalPdfDownloadNotice(missing.source)).toContain(
      "no published snapshot",
    );
    expect(proposalPdfDownloadNotice("legacy-malformed-snapshot")).toContain(
      "could not be read",
    );
    expect(proposalPdfDownloadNotice("revision")).toBe(
      "Proposal PDF downloaded.",
    );
    const notices: string[] = [];
    await downloadProjectedProposalPdf({
      projection: missing,
      branding: { displayName: "Capsule" },
      download: async () => undefined,
      onNotice: (message) => notices.push(message),
    });
    expect(notices).toEqual([expect.stringContaining("no published snapshot")]);
  });

  it("renders snapshot dishes and notes under their real labels and honors section visibility", () => {
    const doc = buildProposalPdf({
      clientName: "Client",
      branding: {
        displayName: "Capsule Catering",
        address: "",
        primaryColor: "#243B31",
        accentColor: "#B7791F",
      },
      proposal: {
        ...live,
        visibleSections: ["menu_sections"],
        dishSelections: [{ dishName: "Roasted carrots" }],
        notes: "Nut-free service requested",
        terms: "Hidden payment terms",
      },
    });
    const rendered = JSON.stringify((doc as any).internal.pages);
    expect(rendered).toContain("PROPOSED MENU");
    expect(rendered).toContain("Roasted carrots");
    expect(rendered).toContain("NOTES");
    expect(rendered).toContain("Nut-free service requested");
    expect(rendered).not.toContain("Hidden payment terms");
    expect(rendered).not.toContain("Changed live activity");
    expect(rendered).not.toContain("Changed live title");
    expect(rendered).not.toContain("/ person");
    expect(rendered).not.toContain("Total estimate");
  });

  // AC-260 (CF-5-2-required-sections): with every section shown, each
  // required section renders with its own content.
  it("renders every required section with content", () => {
    const doc = buildProposalPdf({
      clientName: "Harbor Lights Foundation",
      branding: {
        displayName: "Proof Kitchen Catering",
        address: "12 Dock St",
        primaryColor: "#243B31",
        accentColor: "#B7791F",
      },
      proposal: {
        _id: "proposal-sections",
        title: "Harbor gala",
        eventDate: Date.UTC(2026, 10, 2, 17),
        eventType: "gala dinner",
        guestCount: 40,
        venueName: "Old Mill Barn",
        venueAddress: "4 Mill Rd",
        subtotal: 1100,
        taxAmount: 88,
        discountAmount: 50,
        total: 1138,
        expiresAt: Date.UTC(2026, 9, 20),
        terms: "Deposit of 30% holds the date; balance due 7 days before.",
        dishSelections: [
          { dishName: "Cedar salmon", dishDescription: "Lemon butter, dill" },
        ],
        pricingLines: [
          {
            description: "Cedar salmon",
            pricingBasis: "per_unit",
            unitPrice: 24,
            quantity: 40,
          },
          {
            description: "Service staff",
            pricingBasis: "flat",
            unitPrice: 140,
          },
        ],
        timelineItems: [{ time: "6:00 PM", activity: "Guests arrive" }],
        venueLogistics: {
          loadIn: "Back dock after 2 PM",
          contact: "Pat Mill",
        },
        enhancements: [
          { name: "Oyster bar", description: "Shucked to order", price: 400 },
        ],
        acceptanceUrl: "https://capsule.example/accept/token-1",
      },
    });
    const rendered = JSON.stringify((doc as any).internal.pages);
    for (const expected of [
      "Proof Kitchen Catering",
      "Harbor Lights Foundation",
      "Old Mill Barn",
      "PROPOSED MENU",
      "Cedar salmon",
      "Lemon butter, dill",
      "PRICING BREAKDOWN",
      "Service staff",
      "TIMELINE",
      "Guests arrive",
      "VENUE LOGISTICS",
      "Back dock after 2 PM",
      "OPTIONAL ENHANCEMENTS",
      "Oyster bar",
      "ESTIMATE",
      "Discount",
      "Tax",
      "Total estimate",
      "TERMS",
      "Deposit of 30% holds the date",
      "NEXT STEPS",
      "capsule.example/accept/token-1",
    ]) {
      expect(rendered, expected).toContain(expected);
    }
  });
});
