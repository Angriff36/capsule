import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EVENT_DETAIL_TABS,
  parseEventDetailTab,
} from "../src/features/events/eventRoutes";
import { persistableServiceStyleId } from "../src/features/events/serviceStyleCatalog";
import { eventCreateDisabledReason } from "../src/features/events/eventCreateGuards";
import { eventsIndexPath } from "../src/features/events/eventRoutes";
import { eventAllowsDraftPoFromNeeds } from "../src/features/events/EventDraftPoCoordinator";
import { suspectRowsFromRecipeLines } from "../src/features/events/eventMenuSuspectQuantity";

const read = (path: string) => readFileSync(path, "utf8");

describe("leftovers 1–6: event menu cost → prep → PO chain", () => {
  it("4. prep generates from the event menu or says why sync no-op'd", () => {
    expect(EVENT_DETAIL_TABS.some((tab) => tab.key === "prep")).toBe(true);
    expect(parseEventDetailTab("prep")).toBe("prep");
    const detail = read("src/features/events/EventDetailPage.tsx");
    const prepTab = read("src/features/events/EventPrepTab.tsx");
    const sync = read("src/features/kitchen/EventPrepTaskSynchronizer.ts");
    const deck = read("src/features/kitchen/KitchenDashboardPage.tsx");
    expect(detail).toContain("EventPrepTab");
    expect(detail).toContain('activeTab === "prep"');
    expect(prepTab).toContain("event-prep-tab");
    expect(prepTab).toContain("Sync prep from menu");
    expect(prepTab).toContain("noOpReason");
    expect(sync).toContain("dishIngredients");
    expect(sync).toContain(
      "This dish has no prep templates and no ingredients to generate prep from.",
    );
    expect(deck).toContain("result.noOpReason");
  });
});

describe("PR 211 create-event leftovers stay on main", () => {
  it("keeps events index, service styles, client-required copy, and Name *", () => {
    expect(eventsIndexPath()).toBe("/events");
    expect(persistableServiceStyleId("full-service")).toBe("");
    expect(eventCreateDisabledReason({ busy: false, clientId: "" })).toBe(
      "Client is required",
    );
    const page = read("src/features/events/EventCreatePage.tsx");
    expect(page).toMatch(/Name \*[\s\S]{0,80}name="primaryContactName"/);
    const catalog = read("src/features/events/serviceStyleCatalog.ts");
    expect(catalog).toContain("Full Service");
    expect(catalog).toContain("Limited Service");
    expect(catalog).toContain("Drop Off");
    expect(catalog).toContain("Vending");
  });
});

describe("PR 212 Highs must not return", () => {
  it("High 1: draft PO is contract-stage only and does not call PurchaseNeed.create", () => {
    expect(eventAllowsDraftPoFromNeeds("planning")).toBe(true);
    expect(eventAllowsDraftPoFromNeeds("quote")).toBe(true);
    expect(eventAllowsDraftPoFromNeeds("sales_lock")).toBe(true);
    expect(eventAllowsDraftPoFromNeeds("approved")).toBe(false);
    expect(eventAllowsDraftPoFromNeeds("pending_approval")).toBe(false);
    expect(eventAllowsDraftPoFromNeeds("executing")).toBe(false);
    const coordinator = read("src/features/events/EventDraftPoCoordinator.ts");
    const button = read("src/features/events/EventDraftPoButton.tsx");
    expect(coordinator).toContain('"planning"');
    expect(coordinator).toContain('"quote"');
    expect(coordinator).toContain('"sales_lock"');
    expect(coordinator).not.toContain("pending_approval");
    expect(coordinator).not.toContain('"approved"');
    expect(coordinator).not.toContain("executing");
    expect(coordinator).not.toMatch(/PurchaseNeed/);
    expect(button).not.toMatch(/PurchaseNeed/);
    expect(button).toContain("Draft PO from this event's needs");
  });

  it("High 2: menu card and post-sync prep flag 196 from recipe lines", () => {
    const rows = suspectRowsFromRecipeLines(
      [
        { name: "Garnish kit", quantity: 1, unit: "each" },
        { name: "Sliced radish", quantity: 2, unit: "pound", suspect: true },
      ],
      98,
    );
    expect(rows[0]?.quantity).toBe(196);
    expect(rows[0]?.flag).toMatch(/196/);
    expect(rows[0]?.flag).toMatch(/not converted/i);
    const tab = read("src/features/events/EventMenuTab.tsx");
    const prep = read("src/features/events/EventPrepTab.tsx");
    const helper = read("src/features/events/eventMenuSuspectQuantity.ts");
    expect(helper).toContain("suspect?: boolean");
    expect(helper).toContain("suspectRowsFromRecipeLines");
    expect(tab).toContain("suspectRowsFromRecipeLines");
    expect(tab).toContain('data-testid="suspect-prep-quantity"');
    expect(prep).toContain("suspectRowsFromRecipeLines");
    expect(prep).toContain("dishIngredients");
    expect(prep).toContain('data-testid="suspect-prep-quantity"');
  });
});
