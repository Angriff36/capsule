// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

let queryResult: any;
vi.mock("convex/react", () => ({
  useQuery: () => queryResult,
  useMutation: () => vi.fn(async () => undefined),
}));

import { SharedProposalPage } from "../src/features/clients/SharedProposalPage";
import { ProposalAcceptancePage } from "../src/features/clients/ProposalAcceptancePage";

let container: HTMLDivElement | null = null;
afterEach(() => {
  container?.remove();
  container = null;
});

async function mountedText(element: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  const result = container.textContent ?? "";
  await act(async () => root.unmount());
  return result;
}

describe("proposal public renderers", () => {
  it("renders shared snapshot menu/expiry and hides excluded timeline content", async () => {
    queryResult = {
      ok: true,
      proposal: {
        title: "Frozen proposal",
        proposalNumber: "P-1",
        eventDate: Date.UTC(2026, 8, 20),
        eventType: "Dinner",
        guestCount: 10,
        venueName: "Frozen venue",
        venueAddress: null,
        subtotal: 100,
        taxAmount: 8,
        discountAmount: 0,
        total: 108,
        expiresAt: Date.UTC(2026, 8, 30),
        notes: "Frozen client note",
        terms: "Frozen terms",
        visibleSections: ["event_summary", "menu_sections", "terms"],
      },
      venueLogistics: null,
      clientName: "Frozen client",
      lineItems: [],
      enhancements: [],
      dishSelections: [
        {
          dishName: "Roasted carrots",
          dishDescription: "Herbs and citrus",
          course: null,
          serviceStyle: null,
        },
      ],
      timeline: [
        {
          name: "Hidden timeline activity",
          startsAt: Date.UTC(2026, 8, 20, 18),
          endsAt: null,
        },
      ],
      revisionNumber: 1,
      capturedAt: Date.UTC(2026, 8, 1),
      linkCreatedAt: null,
      linkExpiresAt: null,
    };
    const text = await mountedText(
      createElement(SharedProposalPage, { token: "token" }),
    );
    expect(text).toContain("Valid through");
    expect(text).toContain("Roasted carrots");
    expect(text).toContain("Frozen client note");
    expect(text).toContain("Frozen terms");
    expect(text).not.toContain("Hidden timeline activity");
  });

  it("keeps the signing control available when presentation hides the acceptance CTA and terms", async () => {
    queryResult = {
      recipientName: "Client",
      recipientEmail: "client@example.com",
      revisionNumber: 1,
      capturedAt: null,
      changeSummary: null,
      expiresAt: null,
      proposal: {
        title: "Frozen proposal",
        total: 108,
        clientName: "Frozen client",
        terms: "Hidden terms",
        eventDate: null,
        guestCount: 10,
        venueName: null,
        visibleSections: ["pricing_summary"],
      },
      enhancements: [],
    };
    const text = await mountedText(
      createElement(ProposalAcceptancePage, {
        callbackToken: "signature-token",
      }),
    );
    expect(text).toContain("Accept Proposal");
    expect(text).not.toContain("Hidden terms");
  });
});
