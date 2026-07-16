import { describe, expect, it } from "vitest";
import {
  inspectSupplyManifestIntegration,
  inspectSupplySource,
} from "../scripts/check-supply-manifest-integration";

describe("Supply Manifest integration guard", () => {
  it("keeps current authored supply integration on approved generated surfaces", () => {
    expect(inspectSupplyManifestIntegration()).toEqual([]);
  });

  it("rejects direct generated Convex imports and handwritten hooks", () => {
    for (const source of [
      'import { PurchaseNeed_create } from "../../../convex/mutations";',
      'import { useMutation } from "convex/react"; const save = useMutation(anything);',
    ]) {
      expect(
        inspectSupplySource("src/features/inventory/Bypass.tsx", source),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: "approved-supply-api-path" }),
        ]),
      );
    }
  });

  it("rejects direct authored writes to inventory and procurement documents", () => {
    const tables = [
      "storageLocations",
      "inventoryItems",
      "inventoryReservations",
      "ingredientDemands",
      "purchaseNeeds",
      "vendors",
      "vendorOrders",
      "vendorOrderLines",
    ];
    for (const table of tables) {
      const violations = inspectSupplySource(
        `convex/lib/rogue-${table}.ts`,
        `async function bypass(ctx: any) { await ctx.db.insert("${table}", {}); }`,
      );
      expect(violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ rule: "generated-supply-writes-only" }),
        ]),
      );
    }
  });

  it("rejects locally recreated supply lifecycle tables", () => {
    const violations = inspectSupplySource(
      "src/features/inventory/LocalLifecycle.ts",
      'const transitions = [{ property: "status", from: "open", to: "ordered" }];',
    );
    expect(violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: "generated-supply-lifecycle" }),
      ]),
    );
  });
});
