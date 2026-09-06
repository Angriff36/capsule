import { describe, expect, it } from "vitest";
import { TemplateStockSyncLifecycle } from "../src/features/events/TemplateStockSyncLifecycle";

const observed = (ids: string[], revision: string) => ({
  ready: true,
  eventDishIds: ids,
  demandRevision: revision,
});

describe("TemplateStockSyncLifecycle", () => {
  it("waits for readiness, exact rows and demand, then exposes a deliberate failed retry", () => {
    const lifecycle = new TemplateStockSyncLifecycle();
    const attempt = lifecycle.begin({
      savedDishIds: ["saved-a", "saved-b"],
      baselineDemandRevision: "old",
      expectsDemandChange: true,
    });
    expect(lifecycle.next({ ...observed([], "old"), ready: false })).toBeNull();
    expect(lifecycle.next(observed(["other-a", "other-b"], "new"))).toBeNull();
    expect(lifecycle.next(observed(["saved-a", "saved-b"], "old"))).toBeNull();
    expect(lifecycle.next(observed(["saved-a", "saved-b"], "new"))).toEqual({
      attemptId: attempt,
      savedLines: 2,
    });
    expect(
      lifecycle.next(observed(["saved-a", "saved-b"], "newer")),
    ).toBeNull();
    lifecycle.failed(attempt);
    expect(lifecycle.status()).toMatchObject({
      phase: "failed",
      savedLines: 2,
    });
    lifecycle.retry();
    expect(lifecycle.next(observed(["saved-a", "saved-b"], "new"))).toEqual({
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
      baselineDemandRevision: "0",
      expectsDemandChange: false,
    });
    lifecycle.next(observed(["old"], "0"));
    const newAttempt = lifecycle.begin({
      savedDishIds: ["new"],
      baselineDemandRevision: "1",
      expectsDemandChange: false,
    });
    lifecycle.succeeded(oldAttempt);
    expect(lifecycle.status()).toMatchObject({
      attemptId: newAttempt,
      phase: "waiting",
    });
  });
});
