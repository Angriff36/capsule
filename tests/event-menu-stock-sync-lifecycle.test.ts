import { describe, expect, it } from "vitest";
import { TemplateStockSyncLifecycle } from "../src/features/events/TemplateStockSyncLifecycle";

const observed = (
  ids: string[],
  demandVersions: Record<string, number> = {},
) => ({
  ready: true,
  eventDishIds: ids,
  demandVersions,
});

describe("TemplateStockSyncLifecycle", () => {
  it("waits for readiness and exact recovered rows when demand already reflects the commit", () => {
    const lifecycle = new TemplateStockSyncLifecycle();
    const attempt = lifecycle.begin({
      savedDishIds: ["saved-a", "saved-b"],
      savedDemandVersions: { demand: 3 },
    });
    expect(lifecycle.next({ ...observed([]), ready: false })).toBeNull();
    expect(
      lifecycle.next(observed(["other-a", "other-b"], { demand: 3 })),
    ).toBeNull();
    expect(
      lifecycle.next(observed(["saved-a", "saved-b"], { demand: 2 })),
    ).toBeNull();
    expect(
      lifecycle.next(observed(["saved-a", "saved-b"], { demand: 3 })),
    ).toEqual({
      attemptId: attempt,
      savedLines: 2,
    });
    expect(
      lifecycle.next(observed(["saved-a", "saved-b"], { demand: 4 })),
    ).toBeNull();
    lifecycle.failed(attempt);
    expect(lifecycle.status()).toMatchObject({
      phase: "failed",
      savedLines: 2,
    });
    lifecycle.retry();
    expect(
      lifecycle.next(observed(["saved-a", "saved-b"], { demand: 3 })),
    ).toEqual({
      attemptId: attempt,
      savedLines: 2,
    });
    lifecycle.succeeded(attempt);
    expect(lifecycle.status()).toMatchObject({ phase: "complete" });
  });

  it("a stale completion cannot clear newer pending work", () => {
    const lifecycle = new TemplateStockSyncLifecycle();
    const oldAttempt = lifecycle.begin({
      savedDishIds: ["old"],
      savedDemandVersions: {},
    });
    lifecycle.next(observed(["old"]));
    const newAttempt = lifecycle.begin({
      savedDishIds: ["new"],
      savedDemandVersions: {},
    });
    lifecycle.succeeded(oldAttempt);
    expect(lifecycle.status()).toMatchObject({
      attemptId: newAttempt,
      phase: "waiting",
    });
  });
});
