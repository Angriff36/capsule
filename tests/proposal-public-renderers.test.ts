// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

let queryResult: any;
const completeSignature = vi.hoisted(() =>
  vi.fn(async (_args: unknown) => undefined),
);
vi.mock("convex/react", () => ({
  useQuery: () => queryResult,
  useMutation: () => completeSignature,
}));

import { SharedProposalPage } from "../src/features/clients/SharedProposalPage";
import { ProposalAcceptancePage } from "../src/features/clients/ProposalAcceptancePage";
import { formatDate, formatTime } from "../src/lib/format";

let container: HTMLDivElement | null = null;
afterEach(() => {
  container?.remove();
  container = null;
});

async function mountedText(
  element: ReactNode,
  interact?: (element: HTMLDivElement) => Promise<void>,
) {
  container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(element));
    await interact?.(container);
    return container.textContent ?? "";
  } finally {
    await act(async () => root.unmount());
  }
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
      // AC-654: the dish picture shows with the menu, named under it.
      pictures: [
        {
          dishName: "Roasted carrots",
          imageUrl: "https://files.example/carrots.jpg",
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
    // Menu line + picture caption.
    expect(text.split("Roasted carrots")).toHaveLength(3);
    expect(text).toContain("Frozen client note");
    expect(text).toContain("Frozen terms");
    expect(text).not.toContain("Hidden timeline activity");
    // No brand from an older server: the head shows as before.
    expect(text).not.toContain("×");
    // No saved order (older revisions): the standard layout.
    expect(text.indexOf("Event Details")).toBeLessThan(
      text.indexOf("Roasted carrots"),
    );
    expect(text.indexOf("Roasted carrots")).toBeLessThan(
      text.indexOf("Frozen terms"),
    );

    // AC-259: the client page shows sections in the saved order.
    queryResult = {
      ...queryResult,
      proposal: {
        ...queryResult.proposal,
        sectionOrder: ["terms", "menu_sections"],
      },
    };
    const ordered = await mountedText(
      createElement(SharedProposalPage, { token: "token" }),
    );
    expect(ordered.indexOf("Frozen terms")).toBeGreaterThan(-1);
    expect(ordered.indexOf("Frozen terms")).toBeLessThan(
      ordered.indexOf("Roasted carrots"),
    );
    expect(ordered.indexOf("Roasted carrots")).toBeLessThan(
      ordered.indexOf("Event Details"),
    );

    // Playbook section 06: at a partner venue the company comes first and
    // the venue's logo sits next to it.
    queryResult = {
      ...queryResult,
      brand: {
        companyName: "Mangia Catering Co.",
        companyLogoUrl: null,
        partnerVenue: {
          name: "Garden Hall",
          logoUrl: "https://files.example/garden-hall.png",
          color: "#1f3a5f",
        },
      },
    };
    container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    await act(async () =>
      root.render(createElement(SharedProposalPage, { token: "token" })),
    );
    const row = container.querySelector('[data-testid="proposal-brand"]');
    expect(row?.textContent).toContain("Mangia Catering Co.");
    expect(row?.textContent).toContain("×");
    const logo = row?.querySelector("img");
    expect(logo?.getAttribute("alt")).toBe("Garden Hall");
    expect(row?.textContent?.indexOf("Mangia Catering Co.")).toBe(0);
    await act(async () => root.unmount());
  });

  it("keeps the signing control available when presentation hides the acceptance CTA and terms", async () => {
    completeSignature.mockClear();
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
      async (element) => {
        expect(element.textContent).not.toContain("Hidden terms");
        const accept = Array.from(element.querySelectorAll("button")).find(
          (button) => button.textContent === "Accept Proposal",
        );
        expect(accept).toBeDefined();
        expect(accept!.disabled).toBe(false);
        await act(async () => accept!.click());
        expect(completeSignature).toHaveBeenCalledExactlyOnceWith({
          token: "signature-token",
          signerUserAgent: navigator.userAgent,
        });
      },
    );
    expect(text).toContain("Proposal Accepted");
  });

  it("renders timeline start and end times with date context", async () => {
    const startsAt = new Date(2026, 8, 20, 18).getTime();
    const endsAt = new Date(2026, 8, 20, 21, 30).getTime();
    queryResult = {
      ok: true,
      proposal: {
        title: "Timed proposal",
        proposalNumber: "P-2",
        eventDate: Date.UTC(2026, 8, 20),
        eventType: "Dinner",
        guestCount: 10,
        venueName: null,
        venueAddress: null,
        subtotal: 0,
        taxAmount: 0,
        discountAmount: 0,
        total: 0,
        expiresAt: null,
        notes: null,
        terms: null,
        visibleSections: ["timeline"],
      },
      venueLogistics: null,
      clientName: "Client",
      lineItems: [],
      enhancements: [],
      dishSelections: [],
      pictures: [],
      timeline: [
        {
          name: "Dinner service",
          startsAt,
          endsAt,
        },
      ],
      revisionNumber: 1,
      capturedAt: null,
      linkCreatedAt: null,
      linkExpiresAt: null,
    };
    const text = await mountedText(
      createElement(SharedProposalPage, { token: "token" }),
    );
    expect(text).toContain("Dinner service");
    expect(text).toContain(
      `${formatDate(startsAt)} at ${formatTime(startsAt)} – ${formatTime(endsAt)}`,
    );
  });
});
