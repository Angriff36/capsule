import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateVendor,
  useCreateVendorOrder,
  useCreateVendorOrderLine,
  useCreateVendorOrderLineDemand,
  useListEvent,
  useListIngredient,
  useListPurchaseNeed,
  useListVendor,
  useListVendorOrder,
  useListVendorOrderLine,
  useListVendorOrderLineDemand,
  usePurchaseNeedCancel,
  usePurchaseNeedAssignToDraft,
  usePurchaseNeedMarkFulfilled,
  usePurchaseNeedMarkOrdered,
  useVendorOrderCancel,
  useVendorOrderLineCancelLine,
  useVendorOrderLineDemandRetire,
  useVendorOrderLineReviseQuantity,
} from "../../lib/manifest-convex-react";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { InventoryWorkspaceNav } from "./InventoryWorkspaceNav";
import { PurchasingCommandForm } from "./PurchasingCommandForm";
import { PurchasingQueueSplit } from "./PurchasingQueueSplit";
import { endOfDay, startOfDay } from "./PurchasingFormHelpers";
import { SupplyFailureBanner } from "./SupplyFailureBanner";
import { SupplyLifecyclePolicy } from "./SupplyLifecyclePolicy";
import { PrepPurchaseDraftCoordinator } from "./PrepPurchaseDraftCoordinator";

const policy = new SupplyLifecyclePolicy();

export function PurchasingPage() {
  const needs = useListPurchaseNeed();
  const vendors = useListVendor();
  const orders = useListVendorOrder();
  const lines = useListVendorOrderLine();
  const demandLinks = useListVendorOrderLineDemand();
  const ingredients = useListIngredient();
  const events = useListEvent();
  const createVendor = useCreateVendor();
  const createOrder = useCreateVendorOrder();
  const createOrderLine = useCreateVendorOrderLine();
  const createDemandLink = useCreateVendorOrderLineDemand();
  const reviseOrderLine = useVendorOrderLineReviseQuantity();
  const cancelOrder = useVendorOrderCancel();
  const cancelOrderLine = useVendorOrderLineCancelLine();
  const retireDemandLink = useVendorOrderLineDemandRetire();
  const assignNeedToDraft = usePurchaseNeedAssignToDraft();
  const markOrdered = usePurchaseNeedMarkOrdered();
  const markFulfilled = usePurchaseNeedMarkFulfilled();
  const cancelNeed = usePurchaseNeedCancel();
  const [form, setForm] = useState<"vendor" | "order" | "prepDraft" | null>(
    null,
  );
  const [selectedNeedIds, setSelectedNeedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [generatedOrderId, setGeneratedOrderId] = useState<string | null>(null);
  const [draftRange, setDraftRange] = useState({ start: "", end: "" });
  const { prompt, host } = useActionPrompt(busy != null);

  const activeNeeds = (needs ?? []).filter((item) => item.deletedAt == null);
  const activeVendors = (vendors ?? []).filter(
    (item) => item.deletedAt == null,
  );
  const activeOrders = (orders ?? []).filter((item) => item.deletedAt == null);
  const ingredientName = (id: string) =>
    ingredients?.find((item) => item._id === id)?.name ?? "Unknown ingredient";
  const eventName = (id: string) =>
    events?.find((item) => item._id === id)?.title ?? "Unknown event";
  const vendorName = (id: string) =>
    vendors?.find((item) => item._id === id)?.name ?? "Unknown vendor";
  const linkedLine = (need: any) =>
    lines?.find((line) => {
      if (line.deletedAt != null || line.status === "cancelled") return false;
      if (line.ingredientDemandId === need.ingredientDemandId) return true;
      return demandLinks?.some(
        (link) =>
          link.deletedAt == null &&
          link.vendorOrderLineId === line._id &&
          link.ingredientDemandId === need.ingredientDemandId,
      );
    });
  const needCanCancel = (need: any) =>
    policy
      .purchaseNeedActions(String(need.status))
      .some((action) => action.key === "cancel");
  const openCancellableNeeds = activeNeeds.filter(
    (need) => String(need.status) === "open" && needCanCancel(need),
  );

  const run = async (key: string, work: () => Promise<void>) => {
    setFailure(null);
    setBusy(key);
    try {
      await work();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(null);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const current = form;
    if (!current) return;
    const element = event.currentTarget;
    const data = new FormData(element);
    void run(`create-${current}`, async () => {
      if (current === "vendor") {
        await createVendor({
          name: String(data.get("name") ?? "").trim(),
          email: String(data.get("email") ?? "").trim() || undefined,
          phone: String(data.get("phone") ?? "").trim() || undefined,
          paymentTermsDays: Number(data.get("paymentTermsDays")),
          notes: String(data.get("notes") ?? "").trim() || undefined,
        });
      } else if (current === "order") {
        await createOrder({
          vendorId: String(data.get("vendorId")),
          eventId: String(data.get("eventId")) || undefined,
          orderNumber:
            String(data.get("orderNumber") ?? "").trim() || undefined,
          notes: String(data.get("notes") ?? "").trim() || undefined,
        });
      } else {
        if (
          orders === undefined ||
          lines === undefined ||
          demandLinks === undefined
        ) {
          throw new Error(
            "Purchasing data is still loading. Try again shortly.",
          );
        }
        const rangeStart = startOfDay(String(data.get("rangeStart") ?? ""));
        const rangeEnd = endOfDay(String(data.get("rangeEnd") ?? ""));
        if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd)) {
          throw new Error("Select both dates for the purchase draft range.");
        }
        const coordinator = new PrepPurchaseDraftCoordinator({
          openOrder: (input) =>
            createOrder(input) as Promise<{ docId: string }>,
          addLine: (input) =>
            createOrderLine(input) as Promise<{ docId: string }>,
          reviseLine: (input) => reviseOrderLine(input),
          linkDemand: (input) => createDemandLink(input),
          assignNeedToDraft: (input) =>
            assignNeedToDraft(input as Parameters<typeof assignNeedToDraft>[0]),
          cancelOrder: (input) => cancelOrder(input),
          cancelLine: (input) => cancelOrderLine(input),
          retireDemandLink: (input) => retireDemandLink(input),
        });
        const result = await coordinator.generate({
          vendorId: String(data.get("vendorId")),
          rangeStart,
          rangeEnd,
          needs: activeNeeds.map((need) => ({
            id: need._id,
            version: need.version,
            eventId: need.eventId,
            ingredientDemandId: need.ingredientDemandId,
            ingredientId: need.ingredientId,
            requiredQuantity: Number(need.requiredQuantity),
            unit: String(need.unit),
            status: String(need.status),
            vendorOrderId: need.vendorOrderId,
            vendorOrderLineId: need.vendorOrderLineId,
            deletedAt: need.deletedAt,
          })),
          events: (events ?? []).map((item) => ({
            id: item._id,
            startsAt: item.startsAt,
            deletedAt: item.deletedAt,
          })),
          orders: activeOrders.map((order) => ({
            id: order._id,
            vendorId: order.vendorId,
            sourceRangeStart: order.sourceRangeStart,
            sourceRangeEnd: order.sourceRangeEnd,
            status: order.status,
            deletedAt: order.deletedAt,
          })),
          lines: (lines ?? []).map((line) => ({
            id: line._id,
            vendorOrderId: line.vendorOrderId,
            ingredientId: line.ingredientId,
            orderedQuantity: Number(line.orderedQuantity),
            unit: String(line.unit),
            status: line.status,
            version: line.version,
            deletedAt: line.deletedAt,
          })),
          demandLinks: (demandLinks ?? []).map((link) => ({
            id: link._id,
            vendorOrderLineId: link.vendorOrderLineId,
            ingredientDemandId: link.ingredientDemandId,
            contributionQuantity: Number(link.contributionQuantity),
            unit: String(link.unit),
            version: link.version,
            deletedAt: link.deletedAt,
          })),
        });
        setGeneratedOrderId(result.orderId);
      }
      element.reset();
      setForm(null);
    });
  };

  const needAction = (need: any, key: string) => {
    void (async () => {
      if (key === "cancel") {
        const reason = await prompt.askReason({
          ...ReasonCopy.cancelNeed,
          tone: "danger",
        });
        if (!reason) return;
        void run(`${need._id}:${key}`, async () => {
          await cancelNeed({
            docId: need._id,
            version: need.version,
            reason,
          });
        });
        return;
      }
      void run(`${need._id}:${key}`, async () => {
        const args = { docId: need._id, version: need.version };
        if (key === "markOrdered") {
          const line = linkedLine(need);
          if (!line)
            throw new Error("Add an order line linked to this demand first.");
          await markOrdered({
            ...args,
            vendorOrderId: line.vendorOrderId,
            vendorOrderLineId: line._id,
          });
        }
        if (key === "markFulfilled") await markFulfilled(args);
      });
    })();
  };

  const bulkCancelNeeds = () => {
    if (selectedNeedIds.size === 0) return;
    void (async () => {
      const reason = await prompt.askReason({
        ...ReasonCopy.cancelNeed,
        tone: "danger",
      });
      if (!reason) return;
      const targets = activeNeeds.filter(
        (need) => selectedNeedIds.has(need._id) && needCanCancel(need),
      );
      void run("bulk-cancel-needs", async () => {
        for (const need of targets) {
          await cancelNeed({
            docId: need._id,
            version: need.version,
            reason,
          });
        }
        setSelectedNeedIds(new Set());
      });
    })();
  };

  return (
    <div className="operations-stage supply-stage">
      <header className="supply-masthead">
        <div>
          <p className="eyebrow">Procurement · Purchase queue</p>
          <h1 className="display-title mt-2">What must be bought</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Keep each order line tied to its demand, event, and vendor from
            request through receipt.
          </p>
        </div>
        <div className="supply-masthead-actions">
          <button className="btn btn-ghost" onClick={() => setForm("vendor")}>
            Onboard vendor
          </button>
          <button className="btn btn-primary" onClick={() => setForm("order")}>
            Open order
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setForm("prepDraft")}
          >
            Generate prep-list draft
          </button>
        </div>
      </header>
      <InventoryWorkspaceNav />
      <aside className="supply-degraded" role="note">
        <strong>Weekly draft from approved events</strong>
        <span>
          Event approve opens PurchaseNeeds for calculated demand. Generate a
          prep-list draft for a vendor and date range to combine those open
          needs into one VendorOrder. Needs stay open until you submit the draft
          — then they mark ordered.
        </span>
      </aside>
      {failure ? <SupplyFailureBanner error={failure} /> : null}
      {host}
      {form ? (
        <PurchasingCommandForm
          form={form}
          busy={busy != null}
          activeVendors={activeVendors}
          events={events}
          draftRange={draftRange}
          setDraftRange={setDraftRange}
          onCancel={() => setForm(null)}
          onSubmit={submit}
        />
      ) : null}

      {generatedOrderId ? (
        <div className="card border-success/40 px-4 py-3" role="status">
          <p className="font-semibold text-success">Purchase draft generated</p>
          <Link
            className="text-link"
            to={`/inventory/orders/${generatedOrderId}`}
          >
            Open the combined order draft →
          </Link>
        </div>
      ) : null}

      <PurchasingQueueSplit
        needsLoading={
          needs === undefined ||
          ingredients === undefined ||
          events === undefined ||
          lines === undefined ||
          demandLinks === undefined
        }
        activeNeeds={activeNeeds}
        activeVendors={activeVendors}
        vendorsLoading={vendors === undefined}
        selectedNeedIds={selectedNeedIds}
        setSelectedNeedIds={setSelectedNeedIds}
        busy={busy}
        openCancellableNeeds={openCancellableNeeds}
        needCanCancel={needCanCancel}
        linkedLine={linkedLine}
        ingredientName={ingredientName}
        eventName={eventName}
        onNeedAction={needAction}
        onBulkCancel={bulkCancelNeeds}
        onOnboardVendor={() => setForm("vendor")}
      />

      <section className="working-ledger mt-10">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Order folios</p>
            <h2>Vendor orders</h2>
          </div>
          <span>{activeOrders.length} orders</span>
        </div>
        {orders === undefined || vendors === undefined ? (
          <TableSkeleton rows={5} />
        ) : activeOrders.length === 0 ? (
          <div className="document-empty">
            <p>No vendor orders are open.</p>
            <span>Open one against an active vendor.</span>
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!activeVendors.length}
                title={
                  activeVendors.length
                    ? undefined
                    : "Onboard a vendor before opening an order"
                }
                onClick={() => setForm("order")}
              >
                Open vendor order
              </button>
            </div>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Vendor</th>
                  <th>Event</th>
                  <th>Total</th>
                  <th>State</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {activeOrders.map((order) => (
                  <tr key={order._id}>
                    <td>
                      <strong>
                        {order.orderNumber || `Order ${order._id.slice(-8)}`}
                      </strong>
                    </td>
                    <td>{vendorName(order.vendorId)}</td>
                    <td>
                      {order.eventId
                        ? eventName(order.eventId)
                        : "General stock"}
                    </td>
                    <td className="supply-number">
                      ${Number(order.totalAmount).toFixed(2)}
                    </td>
                    <td>
                      <StatusChip status={String(order.status)} />
                    </td>
                    <td>
                      <Link
                        className="text-link"
                        to={`/inventory/orders/${order._id}`}
                      >
                        Open folio →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
