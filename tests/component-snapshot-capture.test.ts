import { describe, expect, it } from "vitest";
import { captureBeforeChange } from "../src/features/kitchen/componentSnapshotCapture";

describe("component snapshot capture", () => {
  it("discloses capture failure without blocking the requested change", async () => {
    const warnings: string[] = [];
    await expect(
      captureBeforeChange(
        async () => {
          throw new Error("storage unavailable");
        },
        (warning) => warnings.push(warning),
      ),
    ).resolves.toBe(false);
    expect(warnings).toEqual([
      "The before-version could not be captured. The requested change will still be attempted.",
    ]);
  });
});
