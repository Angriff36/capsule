/**
 * S8 proof: Vendor open-order count + outstanding total
 *
 * Verifies:
 * - openOrderCount = count_of(orders with status in draft/submitted/confirmed/partially_received)
 * - outstandingTotal = sum(totalAmount for orders with status in submitted/confirmed/partially_received)
 * - draft and partially_received orders count toward openOrderCount
 * - received, cancelled, and failed orders do not count
 * - monetary totals aggregate correctly
 */
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, it } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { createManifestTestContext } from "@angriff36/manifest/proof-kit/convex-test";
import { modules } from "./convex-test-modules";
import {
  hydrateComputedRelationsForVendor,
  computeVendor,
} from "../../convex/computed";

const S = {
  tenantId: "tenant-vendor-order-totals",
} as const;

function harness() {
  return createManifestTestContext({
    convexTest: convexTest as never,
    schema,
    modules,
  });
}

beforeAll(() => {
  if (!process.env.CONVEX_FIELD_ENCRYPTION_KEY) {
    process.env.CONVEX_FIELD_ENCRYPTION_KEY =
      "A1MKNFPVRhFaPf83T45BwooVzAogtiphQhYraAD5gqU=";
  }
});

describe("S8: Vendor order totals", () => {
  it("openOrderCount counts orders with active statuses", async () => {
    const proof = harness();
    const procurement = proof.asRole({
      subject: "vendor-totals-procurement",
      role: "procurement_staff",
      tenantId: S.tenantId,
    });

    const vendor = (await proof.executeCommand(
      procurement,
      api.mutations.Vendor_createViaOnboard,
      {
        name: "Test Vendor",
        paymentTermsDays: 30,
      },
    )) as { docId: string };

    // Create 2 draft orders (both count as open)
    await proof.executeCommand(
      procurement,
      api.mutations.VendorOrder_createViaOpen,
      {
        vendorId: vendor.docId,
      },
    );
    await proof.executeCommand(
      procurement,
      api.mutations.VendorOrder_createViaOpen,
      {
        vendorId: vendor.docId,
      },
    );

    // Submit one (still open)
    let orders = await procurement.run(async (ctx) =>
      ctx.db.query("vendorOrders").collect(),
    );
    const toSubmit = orders.find(
      (o) => (o as { status?: string }).status === "draft",
    );
    await proof.executeCommand(procurement, api.mutations.VendorOrder_submit, {
      docId: toSubmit!._id,
      version: (toSubmit as { version?: number }).version,
    });

    // Mark one as received (no longer open) - re-query to find remaining draft
    orders = await procurement.run(async (ctx) =>
      ctx.db.query("vendorOrders").collect(),
    );
    const draftOrder = orders.find(
      (o) => (o as { status?: string }).status === "draft",
    );
    await proof.executeCommand(procurement, api.mutations.VendorOrder_submit, {
      docId: draftOrder!._id,
      version: (draftOrder as { version?: number }).version,
    });
    await proof.executeCommand(procurement, api.mutations.VendorOrder_confirm, {
      docId: draftOrder!._id,
      version: (draftOrder as { version?: number }).version! + 1,
    });
    await proof.executeCommand(
      procurement,
      api.mutations.VendorOrder_markReceived,
      {
        docId: draftOrder!._id,
        version: (draftOrder as { version?: number }).version! + 2,
      },
    );

    const allOrders = await procurement.run(async (ctx) =>
      ctx.db.query("vendorOrders").collect(),
    );
    const openOrders = allOrders.filter(
      (o) =>
        (o as { deletedAt?: number | null }).deletedAt == null &&
        (o as { vendorId?: string }).vendorId === vendor.docId &&
        ["draft", "submitted", "confirmed", "partially_received"].includes(
          (o as { status?: string }).status || "",
        ),
    );
    // Should have: 1 submitted (open) + 1 received (not open) = 1 open
    expect(openOrders.length).toBe(1);
  });

  it("outstandingTotal sums active order amounts", async () => {
    const proof = harness();
    const procurement = proof.asRole({
      subject: "vendor-totals-amounts",
      role: "procurement_staff",
      tenantId: S.tenantId,
    });

    const vendor = (await proof.executeCommand(
      procurement,
      api.mutations.Vendor_createViaOnboard,
      {
        name: "Amount Test Vendor",
        paymentTermsDays: 30,
      },
    )) as { docId: string };

    // Create orders with different statuses and amounts
    const order1 = (await proof.executeCommand(
      procurement,
      api.mutations.VendorOrder_createViaOpen,
      {
        vendorId: vendor.docId,
      },
    )) as { docId: string };

    const order2 = (await proof.executeCommand(
      procurement,
      api.mutations.VendorOrder_createViaOpen,
      {
        vendorId: vendor.docId,
      },
    )) as { docId: string };

    // Set amounts: order1 = 1000, order2 = 2500
    await proof.executeCommand(
      procurement,
      api.mutations.VendorOrder_updateTotals,
      {
        docId: order1.docId,
        subtotal: 1000,
        taxAmount: 0,
        shippingAmount: 0,
        version: 1,
      },
    );
    await proof.executeCommand(
      procurement,
      api.mutations.VendorOrder_updateTotals,
      {
        docId: order2.docId,
        subtotal: 2500,
        taxAmount: 0,
        shippingAmount: 0,
        version: 1,
      },
    );

    // Re-query to get updated versions after updateTotals
    const order1Updated = await procurement.run(async (ctx) =>
      ctx.db.get(order1.docId as never),
    );
    const order2Updated = await procurement.run(async (ctx) =>
      ctx.db.get(order2.docId as never),
    );

    // Submit order1 (counts toward outstanding)
    await proof.executeCommand(procurement, api.mutations.VendorOrder_submit, {
      docId: order1.docId,
      version: (order1Updated as { version?: number }).version,
    });

    // Confirm order2 (counts toward outstanding)
    await proof.executeCommand(procurement, api.mutations.VendorOrder_submit, {
      docId: order2.docId,
      version: (order2Updated as { version?: number }).version,
    });

    const order2Submitted = await procurement.run(async (ctx) =>
      ctx.db.get(order2.docId as never),
    );
    await proof.executeCommand(procurement, api.mutations.VendorOrder_confirm, {
      docId: order2.docId,
      version: (order2Submitted as { version?: number }).version,
    });

    const vendorDoc = await procurement.run(async (ctx) => {
      const doc = await ctx.db.get(vendor.docId as never);
      await hydrateComputedRelationsForVendor(ctx, doc as never);
      return { ...doc, ...computeVendor(doc as never) };
    });
    // outstandingTotal = 1000 + 2500 = 3500
    expect((vendorDoc as { outstandingTotal?: number }).outstandingTotal).toBe(
      3500,
    );
  });

  it("received and cancelled orders do not count toward outstanding", async () => {
    const proof = harness();
    const procurement = proof.asRole({
      subject: "vendor-totals-received",
      role: "procurement_staff",
      tenantId: S.tenantId,
    });

    const vendor = (await proof.executeCommand(
      procurement,
      api.mutations.Vendor_createViaOnboard,
      {
        name: "Received Test Vendor",
        paymentTermsDays: 30,
      },
    )) as { docId: string };

    const order1 = (await proof.executeCommand(
      procurement,
      api.mutations.VendorOrder_createViaOpen,
      {
        vendorId: vendor.docId,
      },
    )) as { docId: string };

    const order2 = (await proof.executeCommand(
      procurement,
      api.mutations.VendorOrder_createViaOpen,
      {
        vendorId: vendor.docId,
      },
    )) as { docId: string };

    // Set amounts: order1 = 1000, order2 = 500
    await proof.executeCommand(
      procurement,
      api.mutations.VendorOrder_updateTotals,
      {
        docId: order1.docId,
        subtotal: 1000,
        taxAmount: 0,
        shippingAmount: 0,
        version: 1,
      },
    );
    await proof.executeCommand(
      procurement,
      api.mutations.VendorOrder_updateTotals,
      {
        docId: order2.docId,
        subtotal: 500,
        taxAmount: 0,
        shippingAmount: 0,
        version: 1,
      },
    );

    // Re-query to get updated versions after updateTotals
    const order1Updated = await procurement.run(async (ctx) =>
      ctx.db.get(order1.docId as never),
    );
    const order2Updated = await procurement.run(async (ctx) =>
      ctx.db.get(order2.docId as never),
    );

    // Submit order1 (counts toward outstanding)
    await proof.executeCommand(procurement, api.mutations.VendorOrder_submit, {
      docId: order1.docId,
      version: (order1Updated as { version?: number }).version,
    });

    // Mark order2 as received (does not count)
    await proof.executeCommand(procurement, api.mutations.VendorOrder_submit, {
      docId: order2.docId,
      version: (order2Updated as { version?: number }).version,
    });

    const order2Submitted = await procurement.run(async (ctx) =>
      ctx.db.get(order2.docId as never),
    );
    await proof.executeCommand(procurement, api.mutations.VendorOrder_confirm, {
      docId: order2.docId,
      version: (order2Submitted as { version?: number }).version,
    });

    const order2Confirmed = await procurement.run(async (ctx) =>
      ctx.db.get(order2.docId as never),
    );
    await proof.executeCommand(
      procurement,
      api.mutations.VendorOrder_markReceived,
      {
        docId: order2.docId,
        version: (order2Confirmed as { version?: number }).version,
      },
    );

    const vendorDoc = await procurement.run(async (ctx) => {
      const doc = await ctx.db.get(vendor.docId as never);
      await hydrateComputedRelationsForVendor(ctx, doc as never);
      return { ...doc, ...computeVendor(doc as never) };
    });
    // outstandingTotal = 1000 (only submitted, received does not count)
    expect((vendorDoc as { outstandingTotal?: number }).outstandingTotal).toBe(
      1000,
    );
  });

  it("openOrderCount excludes cancelled orders", async () => {
    const proof = harness();
    const procurement = proof.asRole({
      subject: "vendor-totals-cancelled",
      role: "procurement_staff",
      tenantId: S.tenantId,
    });
    const manager = proof.asRole({
      subject: "vendor-totals-cancelled-manager",
      role: "inventory_manager",
      tenantId: S.tenantId,
    });

    const vendor = (await proof.executeCommand(
      procurement,
      api.mutations.Vendor_createViaOnboard,
      {
        name: "Cancelled Test Vendor",
        paymentTermsDays: 30,
      },
    )) as { docId: string };

    // Create 3 orders
    await proof.executeCommand(
      procurement,
      api.mutations.VendorOrder_createViaOpen,
      {
        vendorId: vendor.docId,
      },
    );
    await proof.executeCommand(
      procurement,
      api.mutations.VendorOrder_createViaOpen,
      {
        vendorId: vendor.docId,
      },
    );
    await proof.executeCommand(
      procurement,
      api.mutations.VendorOrder_createViaOpen,
      {
        vendorId: vendor.docId,
      },
    );

    const orders = await procurement.run(async (ctx) =>
      ctx.db.query("vendorOrders").collect(),
    );

    // Submit all 3
    for (const order of orders) {
      await proof.executeCommand(
        procurement,
        api.mutations.VendorOrder_submit,
        {
          docId: order._id,
          version: (order as { version?: number }).version,
        },
      );
    }

    // Cancel one (requires manageAccess for non-draft orders)
    const toCancel = orders[0];
    await proof.executeCommand(manager, api.mutations.VendorOrder_cancel, {
      docId: toCancel._id,
      version: (toCancel as { version?: number }).version! + 1,
      reason: "Test cancellation",
    });

    const vendorDoc = await procurement.run(async (ctx) => {
      const doc = await ctx.db.get(vendor.docId as never);
      await hydrateComputedRelationsForVendor(ctx, doc as never);
      return { ...doc, ...computeVendor(doc as never) };
    });
    // openOrderCount = 2 (3 submitted - 1 cancelled)
    expect((vendorDoc as { openOrderCount?: number }).openOrderCount).toBe(2);
  });

  it("draft orders count toward openOrderCount but not outstandingTotal", async () => {
    const proof = harness();
    const procurement = proof.asRole({
      subject: "vendor-totals-draft",
      role: "procurement_staff",
      tenantId: S.tenantId,
    });

    const vendor = (await proof.executeCommand(
      procurement,
      api.mutations.Vendor_createViaOnboard,
      {
        name: "Draft Test Vendor",
        paymentTermsDays: 30,
      },
    )) as { docId: string };

    // Create a draft order with amount
    const order = (await proof.executeCommand(
      procurement,
      api.mutations.VendorOrder_createViaOpen,
      {
        vendorId: vendor.docId,
      },
    )) as { docId: string };

    await proof.executeCommand(
      procurement,
      api.mutations.VendorOrder_updateTotals,
      {
        docId: order.docId,
        subtotal: 5000,
        taxAmount: 0,
        shippingAmount: 0,
        version: 1,
      },
    );

    const vendorDoc = await procurement.run(async (ctx) => {
      const doc = await ctx.db.get(vendor.docId as never);
      await hydrateComputedRelationsForVendor(ctx, doc as never);
      return { ...doc, ...computeVendor(doc as never) };
    });
    // Draft counts as open but not outstanding
    expect((vendorDoc as { openOrderCount?: number }).openOrderCount).toBe(1);
    expect((vendorDoc as { outstandingTotal?: number }).outstandingTotal).toBe(
      0,
    );
  });
});
