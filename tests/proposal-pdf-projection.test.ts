import { describe, expect, it } from "vitest";
import { projectProposalPdf } from "../src/features/clients/proposalPdfProjection";
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
      source: "legacy-live-fallback",
      clientName: "Live client",
      proposal: { title: "Changed live title" },
    });
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
});
