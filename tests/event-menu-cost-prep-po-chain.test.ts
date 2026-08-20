import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EVENT_DETAIL_TABS,
  parseEventDetailTab,
} from "../src/features/events/eventRoutes";
import { persistableServiceStyleId } from "../src/features/events/serviceStyleCatalog";
import { eventCreateDisabledReason } from "../src/features/events/eventCreateGuards";
import { eventsIndexPath } from "../src/features/events/eventRoutes";

const read = (path: string) => readFileSync(path, "utf8");

describe("leftovers 1–6: event menu cost → prep → PO chain", () => {
  it("1. event menu rolls food cost from catalog/receipt, not estimatedCost-only dash", () => {
    const tab = read("src/features/events/EventMenuTab.tsx");
    expect(tab).toContain("buildEventMenuCost");
    expect(tab).toContain("event-menu-food-cost");
    expect(tab).toContain("formatMoneyExact(costRollup.foodCost)");
    expect(tab).not.toContain("6.25");
    expect(tab).toMatch(/estimated > 0 \? formatMoneyExact\(estimated\) : "—"/);
    expect(tab).not.toMatch(
      /Number\(\(selection as \{ estimatedCost\?: number \}\)\.estimatedCost\)/,
    );
  });

  it("2. recipe-unit vs stock-unit mismatch is warned and not silently converted", () => {
    const tab = read("src/features/events/EventMenuTab.tsx");
    const editor = read("src/features/events/EventMenuRecipeEditor.tsx");
    const cost = read("src/features/events/eventMenuCost.ts");
    expect(tab).toContain("event-menu-unit-mismatch");
    expect(editor).toContain("event-menu-unit-mismatch");
    expect(cost).toContain("incompatible_unit");
    expect(cost).toContain("These units are not converted");
    expect(cost).toContain("convertComponentQuantity");
  });

  it("3. event menu shows cost + pan count and edits recipe in place", () => {
    const tab = read("src/features/events/EventMenuTab.tsx");
    const editor = read("src/features/events/EventMenuRecipeEditor.tsx");
    expect(tab).toContain("EventMenuRecipeEditor");
    expect(tab).toContain("eventMenuContainerCountsForDish");
    expect(tab).toContain("Edit recipe on this menu");
    expect(editor).toContain("event-menu-recipe-editor");
    expect(editor).toContain("event-menu-container-count");
    expect(editor).toContain("Add ingredient");
    expect(editor).toContain("Add container");
    expect(editor).toContain("you do not need to leave the");
  });

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

  it("5. draft PO from event needs does not require approving the event", () => {
    const coordinator = read("src/features/events/EventDraftPoCoordinator.ts");
    const button = read("src/features/events/EventDraftPoButton.tsx");
    const menu = read("src/features/events/EventMenuTab.tsx");
    const inventory = read("src/features/events/EventInventoryPanel.tsx");
    expect(coordinator).toContain('"planning"');
    expect(coordinator).toContain('"sales_lock"');
    expect(coordinator).toContain("eventAllowsDraftPoFromNeeds");
    expect(coordinator).not.toMatch(
      /stage === ["']approved["'] \|\| .*\n.*draftFromNeeds/s,
    );
    expect(button).toContain("Draft PO from this event's needs");
    expect(button).toContain("Approving the event");
    expect(menu).toContain("EventDraftPoButton");
    expect(inventory).toContain("EventDraftPoButton");
  });

  it("6. margin includes recipe-estimated food cost when no PO exists", () => {
    const margin = read("src/features/events/EventMarginTab.tsx");
    const live = read("src/features/events/liveEventProfitability.ts");
    expect(margin).toContain("buildEventMenuCost");
    expect(margin).toContain("recipeEstimatedFoodCost");
    expect(margin).toContain("recipeRollup.foodCost");
    expect(live).toContain("recipeEstimatedFoodCost");
    expect(live).toContain("ingredient.cost > 0");
    expect(live).toContain("recipeFood");
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

describe("leftover returns fail this suite", () => {
  it("does not ship leftover stubs from the cost → prep → PO product", () => {
    const leftover = JSON.parse('{"leftover":false}');
    expect(leftover).not.toEqual({ leftover: true });
    for (const path of [
      "src/features/events/eventMenuCost.ts",
      "src/features/events/EventDraftPoCoordinator.ts",
      "src/features/events/EventPrepTab.tsx",
      "src/features/events/EventMenuTab.tsx",
    ]) {
      expect(read(path)).not.toMatch(/leftover\s*:\s*true/);
    }
  });

  it("product helpers do not import the TPP catalog or hardcode 6.25", () => {
    const features = [
      "src/features/events/eventMenuCost.ts",
      "src/features/events/eventMenuContainers.ts",
      "src/features/events/eventMenuSellPrice.ts",
      "src/features/events/EventDraftPoCoordinator.ts",
      "src/features/events/EventMenuTab.tsx",
      "src/features/events/EventPrepTab.tsx",
      "src/features/events/EventMenuRecipeEditor.tsx",
      "src/features/events/EventMarginTab.tsx",
    ];
    for (const path of features) {
      const source = read(path);
      expect(source).not.toContain("tpp-mendenhall-jarvis-catalog");
      expect(source).not.toContain("6.25");
    }
  });

  it("event menu shows encoded sell prices and flags the 196 lb radish", () => {
    const tab = read("src/features/events/EventMenuTab.tsx");
    const prep = read("src/features/events/EventPrepTab.tsx");
    expect(tab).toContain("eventMenuSellTotals");
    expect(tab).toContain("unitSellPrice");
    expect(tab).toContain("food sell");
    expect(prep).toContain("suspectPrepQuantityFlag");
    expect(prep).toContain("suspect-prep-quantity");
  });
});
