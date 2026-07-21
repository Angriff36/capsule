import { describe, expect, it } from "vitest";
import {
  inspectLogisticsManifestIntegration,
  inspectLogisticsSource,
} from "../scripts/check-logistics-manifest-integration";

describe("Logistics Manifest integration guard", () => {
  it("keeps current authored logistics integration on approved generated surfaces", () => {
    expect(inspectLogisticsManifestIntegration()).toEqual([]);
  });

  it("rejects direct generated Convex imports and handwritten hooks", () => {
    for (const source of [
      'import { PackList_open } from "../../../convex/mutations";',
      'import { useMutation } from "convex/react"; const save = useMutation(anything);',
    ]) {
      expect(
        inspectLogisticsSource("src/features/logistics/Bypass.tsx", source),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: "approved-logistics-api-path" }),
        ]),
      );
    }
  });

  it("rejects direct authored writes to logistics documents", () => {
    for (const table of ["packLists", "packListItems", "deliveries"]) {
      const violations = inspectLogisticsSource(
        `convex/lib/rogue-${table}.ts`,
        `async function bypass(ctx: any) { await ctx.db.insert("${table}", {}); }`,
      );
      expect(violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            rule: "generated-logistics-writes-only",
          }),
        ]),
      );
    }
  });

  it("rejects locally recreated logistics lifecycle tables", () => {
    const violations = inspectLogisticsSource(
      "src/features/logistics/LocalLifecycle.ts",
      'const transitions = [{ property: "status", from: "draft", to: "packing" }];',
    );
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "generated-logistics-lifecycle" }),
      ]),
    );
  });
});
