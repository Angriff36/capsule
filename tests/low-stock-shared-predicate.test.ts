import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DashboardWidgetPolicy } from "../src/features/home/DashboardWidgetPolicy";
import {
  isBelowReorder,
  stockQuantity,
} from "../src/features/inventory/stockLevels";
import {
  nextStockFocusLatch,
  stockFocusScrollId,
} from "../src/features/inventory/useFocusedStockRow";
import {
  deriveNotifications,
  type NotificationSources,
} from "../src/features/notifications/deriveNotifications";

const emptySources = (
  overrides: Partial<NotificationSources> = {},
): NotificationSources => ({
  now: 1_700_000_000_000,
  currentAuthSubjectId: undefined,
  events: [],
  incidents: [],
  invoices: [],
  inventoryItems: [],
  ingredients: [],
  shifts: [],
  people: [],
  qualifications: [],
  timeOffRequests: [],
  vendorOrders: [],
  staffMessages: [],
  prepTaskComments: [],
  ...overrides,
});

function stockDoc(fields: {
  _id: string;
  quantityOnHand: number;
  reorderThreshold: number;
}) {
  return {
    _id: fields._id,
    ingredientId: "ing1",
    quantityOnHand: fields.quantityOnHand,
    reorderThreshold: fields.reorderThreshold,
    unit: "each",
    deletedAt: null,
    removedAt: null,
    updatedAt: 1_700_000_000_000,
  } as never;
}

describe("isBelowReorder mirrors the domain computed", () => {
  it("does not alert unconfigured 0/0 lines", () => {
    expect(isBelowReorder({ quantityOnHand: 0, reorderThreshold: 0 })).toBe(
      false,
    );
    expect(stockQuantity(null)).toBe(0);
    expect(stockQuantity(undefined)).toBe(0);
    expect(stockQuantity("0")).toBe(0);
  });

  it("alerts only when a tracked reorder point is missed", () => {
    expect(isBelowReorder({ quantityOnHand: 0, reorderThreshold: 5 })).toBe(
      true,
    );
    expect(isBelowReorder({ quantityOnHand: 2, reorderThreshold: 5 })).toBe(
      true,
    );
    expect(isBelowReorder({ quantityOnHand: 5, reorderThreshold: 5 })).toBe(
      false,
    );
    expect(isBelowReorder({ quantityOnHand: 6, reorderThreshold: 5 })).toBe(
      false,
    );
  });
});

describe("bell low-stock rows", () => {
  it("does not produce a bell row for unconfigured 0/0 stock", () => {
    const rows = deriveNotifications(
      emptySources({
        inventoryItems: [
          stockDoc({ _id: "i0", quantityOnHand: 0, reorderThreshold: 0 }),
        ],
        ingredients: [{ _id: "ing1", name: "Flour" } as never],
      }),
    );
    expect(rows.filter((row) => row.kind === "low_stock")).toEqual([]);
  });

  it("still alerts a tracked line that is actually below reorder", () => {
    const rows = deriveNotifications(
      emptySources({
        inventoryItems: [
          stockDoc({ _id: "i1", quantityOnHand: 0, reorderThreshold: 5 }),
        ],
        ingredients: [{ _id: "ing1", name: "Flour" } as never],
      }),
    );
    const low = rows.filter((row) => row.kind === "low_stock");
    expect(low).toHaveLength(1);
    expect(low[0]?.link).toBe("/inventory/stock?item=i1");
    expect(low[0]?.message).toContain("Flour");
    expect(low[0]?.message).not.toMatch(/reorder at 0/);
  });
});

describe("home and stock book share one low-stock predicate", () => {
  const policy = new DashboardWidgetPolicy();

  it("home widget omits 0/0 and keeps a tracked miss", () => {
    const views = policy.build({
      events: [],
      invoices: [],
      inventoryItems: [
        {
          _id: "zero",
          quantityOnHand: 0,
          reorderThreshold: 0,
          ingredientId: "ing1",
        },
        {
          _id: "low",
          quantityOnHand: 1,
          reorderThreshold: 4,
          ingredientId: "ing1",
        },
      ],
      ingredients: [{ _id: "ing1", name: "Chicken" }],
      assignments: [],
      payments: [],
      vendorOrders: [],
    });
    expect(views.low_stock_alerts.metric).toBe("1");
    expect(views.low_stock_alerts.rows.map((row) => row.href)).toEqual([
      "/inventory/stock?item=low",
    ]);
    expect(views.low_stock_alerts.rows[0]?.value).not.toBe("0 / 0");
  });

  it("stock book, home, overview, and the bell all call isBelowReorder", () => {
    const book = readFileSync(
      "src/features/inventory/StockBookPage.tsx",
      "utf8",
    );
    const overview = readFileSync(
      "src/features/inventory/InventoryOverviewPage.tsx",
      "utf8",
    );
    const home = readFileSync(
      "src/features/home/DashboardWidgetPolicy.ts",
      "utf8",
    );
    const bell = readFileSync(
      "src/features/notifications/deriveNotifications.ts",
      "utf8",
    );
    expect(book).toContain("isBelowReorder");
    expect(overview).toContain("isBelowReorder");
    expect(home).toContain("isBelowReorder");
    expect(bell).toContain("isBelowReorder");
    expect(book).not.toContain("availableFor(item) < item.reorderThreshold");
    expect(overview).not.toContain(
      "availableFor(item) < item.reorderThreshold",
    );
    expect(book).toContain(".filter(isBelowReorder)");
  });
});

describe("first-land stock-row latch", () => {
  it("keeps ?item= across the first paint and scrolls once rows are ready", () => {
    let latch = nextStockFocusLatch(
      { pendingId: null, scrolledForId: null },
      "abc",
    );
    expect(latch.pendingId).toBe("abc");
    expect(stockFocusScrollId(false, latch)).toBeNull();
    expect(stockFocusScrollId(true, latch)).toBe("abc");
    latch = { ...latch, scrolledForId: "abc" };
    expect(stockFocusScrollId(true, latch)).toBeNull();
  });

  it("resets the success latch when ?item= changes so a second alert still scrolls", () => {
    const afterFirst = nextStockFocusLatch(
      { pendingId: "abc", scrolledForId: "abc" },
      "def",
    );
    expect(afterFirst.pendingId).toBe("def");
    expect(afterFirst.scrolledForId).toBeNull();
    expect(stockFocusScrollId(true, afterFirst)).toBe("def");
  });

  it("the hook uses the latch and retries the first paint", () => {
    const hook = readFileSync(
      "src/features/inventory/useFocusedStockRow.ts",
      "utf8",
    );
    const book = readFileSync(
      "src/features/inventory/StockBookPage.tsx",
      "utf8",
    );
    expect(hook).toContain("nextStockFocusLatch");
    expect(hook).toContain("stockFocusScrollId");
    expect(hook).toContain("useLayoutEffect");
    expect(hook).toContain("requestAnimationFrame");
    expect(hook).toContain("scrollIntoView");
    expect(book).toContain("useFocusedStockRow");
    expect(book).toContain("items,");
  });
});
