import { describe, expect, it } from "vitest";
import {
  inspectProductionManifestIntegration,
  inspectProductionSource,
} from "../scripts/check-production-manifest-integration";

describe("Production Manifest integration guard", () => {
  it("keeps current authored production integration on approved generated surfaces", () => {
    expect(inspectProductionManifestIntegration()).toEqual([]);
  });

  it("rejects direct generated Convex imports and handwritten hooks", () => {
    for (const source of [
      'import { PrepTask_open } from "../../../convex/mutations";',
      'import { useMutation } from "convex/react"; const save = useMutation(anything);',
    ]) {
      expect(
        inspectProductionSource("src/features/production/Bypass.tsx", source),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: "approved-production-api-path" }),
        ]),
      );
    }
  });

  it("rejects direct authored writes to production and quality documents", () => {
    const tables = ["prepTasks", "qualityChecks", "productionBatches"];
    for (const table of tables) {
      const violations = inspectProductionSource(
        `convex/lib/rogue-${table}.ts`,
        `async function bypass(ctx: any) { await ctx.db.insert("${table}", {}); }`,
      );
      expect(violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule: "generated-production-writes-only",
          }),
        ]),
      );
    }
  });

  it("rejects locally recreated production lifecycle tables", () => {
    const violations = inspectProductionSource(
      "src/features/production/LocalLifecycle.ts",
      'const transitions = [{ property: "status", from: "pending", to: "claimed" }];',
    );
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "generated-production-lifecycle" }),
      ]),
    );
  });
});
