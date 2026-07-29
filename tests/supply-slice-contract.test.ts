import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) => readFileSync(relativePath, "utf8");

describe("Demand, stock, and purchasing slice contract", () => {
  it("wires the Inventory route family to authored supply screens", () => {
    const app = read("src/app/App.tsx");
    expect(app).toContain('path="/inventory/demand"');
    expect(app).toContain('path="/inventory/stock"');
    expect(app).toContain('path="/inventory/purchasing"');
    expect(app).toContain('path="/inventory/orders/:id"');
  });

  it("uses generated reads and governed command hooks", () => {
    const demand = read("src/features/inventory/DemandLedgerPage.tsx");
    const stock = read("src/features/inventory/StockBookPage.tsx");
    const purchasing = read("src/features/inventory/PurchasingPage.tsx");
    const order = read("src/features/inventory/VendorOrderPage.tsx");

    for (const hook of [
      "useListIngredientDemand",
      "useCreateIngredientDemand",
    ]) {
      expect(demand).toContain(hook);
    }
    expect(demand).not.toContain("usePurchaseNeedCreate");
    expect(demand).not.toContain("Create need →");
    for (const hook of [
      "useListInventoryItem",
      "useCreateInventoryItem",
      "useCreateInventoryReservation",
      "useInventoryItemReceiveStock",
    ]) {
      expect(stock).toContain(hook);
    }
    for (const hook of [
      "useListPurchaseNeed",
      "useCreateVendor",
      "useCreateVendorOrder",
      "useListVendorOrder",
    ]) {
      expect(purchasing).toContain(hook);
    }
    expect(purchasing).not.toContain("useCreateVendorOrderLine");
    expect(purchasing).not.toContain("usePurchaseNeedAssignToDraft");
    for (const hook of [
      "useGetVendorOrder",
      "useCreateVendorOrderLine",
      "useVendorOrderLineRecordReceipt",
    ]) {
      expect(order).toContain(hook);
    }
    expect(purchasing).toContain("Auto-maintained drafts");
    expect(purchasing).not.toContain("Generate prep-list draft");
    expect(purchasing).not.toContain("PrepPurchaseDraftCoordinator");
    expect(order).toContain("vendorOrderLineId === line._id");
  });

  it("uses only generated client surfaces and states approve→purchase handoff", () => {
    for (const file of [
      "DemandLedgerPage.tsx",
      "StockBookPage.tsx",
      "PurchasingPage.tsx",
      "VendorOrderPage.tsx",
    ]) {
      const source = read(`src/features/inventory/${file}`);
      expect(source).toContain('from "../../lib/manifest-convex-react"');
      expect(source).not.toContain("ctx.db.");
      expect(source).not.toContain("useMutation(");
    }
    expect(read("src/features/inventory/DemandLedgerPage.tsx")).toContain(
      "Approve releases purchasing",
    );
    expect(read("src/features/inventory/VendorOrderPage.tsx")).toContain(
      "Marking an order received does not update your stock counts",
    );
  });

  it("derives authored lifecycle offers from generated metadata", () => {
    const policy = read("src/features/inventory/SupplyLifecyclePolicy.ts");
    expect(policy).toContain('from "../../generated/manifest-wiring-bindings"');
    for (const metadata of [
      "IngredientDemandConfirmLifecycle",
      "InventoryReservationConsumeLifecycle",
      "PurchaseNeedMarkOrderedLifecycle",
      "VendorOrderSubmitLifecycle",
      "VendorOrderMarkReceivedLifecycle",
    ]) {
      expect(policy).toContain(metadata);
    }
  });
});
