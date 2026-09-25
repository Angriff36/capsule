/**
 * Receive-side helpers for the AC-407 §6.5 partially-received slice of the
 * plan-vs-fact matrix runtime proof: confirm the weekly order, register a dry
 * store, book a partial delivery on an order line, mark the order partially
 * received, and read live inventory lot rows. Assertion-free; the test file
 * owns every expect().
 */
import { api } from "../../convex/_generated/api";
import {
  liveRows,
  readRow,
  rolesFor,
  runner,
  type Proof,
  type VendorOrderRow,
} from "./plan-vs-fact-matrix.runtime.helpers";

export type InventoryLotRow = {
  _id: string;
  vendorOrderLineId: string;
  receiptQuantity: number;
  cumulativeReceivedQuantity: number;
};

type OrderWithConfirm = VendorOrderRow & { confirmedAt: number | null };

/** Confirm a submitted weekly VendorOrder as procurement (version-checked).
 * Returns the same id — confirming keeps the document. */
export async function confirmWeeklyOrder(
  proof: Proof,
  tenantId: string,
  vendorOrderId: string,
): Promise<string> {
  const roles = rolesFor(proof, tenantId);
  const order = await readRow<OrderWithConfirm>(
    roles.procurement,
    vendorOrderId,
  );
  await proof.executeCommand(
    roles.procurement,
    api.mutations.VendorOrder_confirm,
    {
      docId: vendorOrderId,
      version: order.version,
    } as never,
  );
  return vendorOrderId;
}

/** Register a dry ambient storage location as inventory staff. Returns the
 * location id (deliveries land here). */
export async function registerDryStore(
  proof: Proof,
  tenantId: string,
  name: string,
): Promise<string> {
  const roles = rolesFor(proof, tenantId);
  const runInventory = runner(proof, roles.inventory);
  const location = await runInventory(
    api.mutations.StorageLocation_createViaRegister,
    { name, locationType: "dry", temperatureZone: "ambient" },
  );
  return location.docId;
}

/** Book a partial delivery on one order line as procurement staff: quantity
 * arrives, the rest stays pending supply, and a stock lot is created. */
export async function recordPartialReceipt(
  proof: Proof,
  tenantId: string,
  lineId: string,
  locationId: string,
  quantity: number,
  unitPrice: number,
  supplierLotNumber: string,
): Promise<void> {
  const roles = rolesFor(proof, tenantId);
  const runProcurement = runner(proof, roles.procurement);
  await runProcurement(api.mutations.VendorOrderLine_recordReceipt, {
    docId: lineId,
    quantity,
    locationId,
    unitPrice,
    supplierLotNumber,
  });
}

/** Move a confirmed order with a booked partial delivery to the
 * partially-received state, as procurement staff. */
export async function markPartiallyReceived(
  proof: Proof,
  tenantId: string,
  vendorOrderId: string,
): Promise<void> {
  const roles = rolesFor(proof, tenantId);
  const runProcurement = runner(proof, roles.procurement);
  await runProcurement(api.mutations.VendorOrder_markPartiallyReceived, {
    docId: vendorOrderId,
  });
}

/** Live (not deleted) inventory lot rows for the tenant. */
export function liveLots(
  actor: Parameters<typeof liveRows>[0],
  tenantId: string,
): Promise<InventoryLotRow[]> {
  return liveRows<InventoryLotRow & { tenantId: string; deletedAt?: unknown }>(
    actor,
    "inventoryLots",
    tenantId,
  );
}
