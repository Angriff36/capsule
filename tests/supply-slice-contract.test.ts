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
      "usePurchaseNeedCreate",
    ]) {
      expect(demand).toContain(hook);
    }
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
    ]) {
      expect(purchasing).toContain(hook);
    }
    for (const hook of [
      "useGetVendorOrder",
      "useCreateVendorOrderLine",
      "useVendorOrderLineRecordReceipt",
    ]) {
      expect(order).toContain(hook);
    }
  });

  it("uses only generated client surfaces and makes blocked automation explicit", () => {
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
      "Automatic purchase creation is unavailable",
    );
    expect(read("src/features/inventory/VendorOrderPage.tsx")).toContain(
      "Receiving does not automatically update stock",
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
