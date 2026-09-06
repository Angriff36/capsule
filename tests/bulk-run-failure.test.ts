import { describe, expect, it } from "vitest";
import { BulkRunFailure, runBulkItems } from "../src/ui/bulk-select";
import { classifyCommandFailure } from "../src/features/events/CommandFailure";
import { KitchenPrepAssignManager } from "../src/features/kitchen/command-deck/KitchenPrepAssignManager";
import type { PrepTaskLike } from "../src/features/kitchen/command-deck/KitchenCommandDeckTypes";

describe("bulk run failure", () => {
  it("preserves the classified cause and reports confirmed counts", async () => {
    const completed: string[] = [];
    await expect(
      runBulkItems(["a", "b", "c"], async (item) => {
        if (item === "b")
          throw new Error("ConcurrencyConflict: VERSION_MISMATCH");
        completed.push(item);
      }),
    ).rejects.toMatchObject({
      completed: 1,
      failed: 1,
      remaining: 1,
      completedItems: ["a"],
      unfinishedItems: ["b", "c"],
    });
    expect(completed).toEqual(["a"]);

    try {
      await runBulkItems(["a", "b", "c"], async (item) => {
        if (item === "b")
          throw new Error("ConcurrencyConflict: VERSION_MISMATCH");
      });
    } catch (error) {
      expect(error).toBeInstanceOf(BulkRunFailure);
      expect(classifyCommandFailure(error)).toMatchObject({
        category: "conflict",
        title: "This record changed elsewhere",
        detail: expect.stringContaining("1 completed, 1 failed, 1 remaining"),
      });
    }
  });

  it("kitchen assignment exposes only the failed and remaining tasks for retry", async () => {
    const tasks = ["a", "b", "c"].map((id): PrepTaskLike => ({
      _id: id,
      version: 1,
      eventId: "event",
      eventDishId: "event-dish",
      name: id,
      status: "pending",
      quantity: 1,
      unit: "each",
    }));
    const manager = new KitchenPrepAssignManager(
      async ({ docId }) => {
        if (docId === "b") throw new Error("assign failed");
      },
      async () => undefined,
      async () => undefined,
      async () => undefined,
      async () => undefined,
    );
    try {
      await manager.assignMany(tasks, "cook");
      throw new Error("expected assignment failure");
    } catch (error) {
      expect(error).toBeInstanceOf(BulkRunFailure);
      expect(
        (error as BulkRunFailure).unfinishedItems.map(
          (item) => (item as PrepTaskLike)._id,
        ),
      ).toEqual(["b", "c"]);
    }
  });
});
