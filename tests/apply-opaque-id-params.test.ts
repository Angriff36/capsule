import { describe, expect, it } from "vitest";
import { relaxParamIds } from "../scripts/apply-opaque-id-params";
import { ProductionBatchPlanParamsSchema } from "../schemas/manifest-schemas";

describe("command id parameters accept Convex record ids", () => {
  it("relaxes uuid only inside command parameter schemas", () => {
    const source = [
      "export const RowSchema = z.object({",
      "  id: z.string().uuid(),",
      "});",
      "export const ThingPlanParamsSchema = z.object({",
      "  otherId: z.string().uuid().optional(),",
      "});",
    ].join("\n");
    const out = relaxParamIds(source);
    expect(out).toContain("  id: z.string().uuid(),");
    expect(out).toContain("  otherId: z.string().min(1).optional(),");
  });

  it("lets a make-up batch name the short batch by its record id", () => {
    const parsed = ProductionBatchPlanParamsSchema.safeParse({
      componentId: "kx7a1b2c3d4e5f6g7h8j9k0m1n2p3q4r",
      plannedYield: 4,
      yieldUnit: "portion",
      makeUpForBatchId: "rh7a1b2c3d4e5f6g7h8j9k0m1n2p3q4r",
    });
    expect(parsed.success).toBe(true);
  });
});
