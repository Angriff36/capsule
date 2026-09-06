import { describe, expect, it } from "vitest";
import { BulkRunFailure, runBulkItems } from "../src/ui/bulk-select";
import { classifyCommandFailure } from "../src/features/events/CommandFailure";

describe("bulk run failure", () => {
  it("preserves the classified cause and reports confirmed counts", async () => {
    const completed: string[] = [];
    await expect(
      runBulkItems(["a", "b", "c"], async (item) => {
        if (item === "b")
          throw new Error("ConcurrencyConflict: VERSION_MISMATCH");
        completed.push(item);
      }),
    ).rejects.toMatchObject({ completed: 1, failed: 1, remaining: 1 });
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
});
