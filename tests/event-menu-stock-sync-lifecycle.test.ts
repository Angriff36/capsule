import { describe, expect, it } from "vitest";
import { TemplateStockSyncLifecycle } from "../src/features/events/TemplateStockSyncLifecycle";

describe("TemplateStockSyncLifecycle", () => {
  it("waits for readiness, exact saved rows, and reactive demand before retrying a failed stock phase", () => {
    const lifecycle = new TemplateStockSyncLifecycle();
    lifecycle.begin({
      savedDishIds: ["saved-a", "saved-b"],
      baselineDemandRevision: "demand-old",
      expectsDemandChange: true,
    });
    expect(
      lifecycle.next({
        ready: false,
        eventDishIds: [],
        demandRevision: "demand-old",
      }),
    ).toBeNull();
    expect(
      lifecycle.next({
        ready: true,
        eventDishIds: ["unrelated-a", "unrelated-b"],
        demandRevision: "demand-new",
      }),
    ).toBeNull();
    expect(
      lifecycle.next({
        ready: true,
        eventDishIds: ["saved-a", "saved-b"],
        demandRevision: "demand-old",
      }),
    ).toBeNull();
    expect(
      lifecycle.next({
        ready: true,
        eventDishIds: ["saved-a", "saved-b"],
        demandRevision: "demand-new",
      }),
    ).toEqual({ savedLines: 2 });
    lifecycle.failed();
    expect(
      lifecycle.next({
        ready: true,
        eventDishIds: ["saved-a", "saved-b"],
        demandRevision: "demand-new",
      }),
    ).toEqual({ savedLines: 2 });
    lifecycle.succeeded();
    expect(
      lifecycle.next({
        ready: true,
        eventDishIds: ["saved-a", "saved-b"],
        demandRevision: "demand-new",
      }),
    ).toBeNull();
  });
});
