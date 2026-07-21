import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateVendor,
  useCreateVendorOrder,
  useListEvent,
  useListIngredient,
  useListPurchaseNeed,
  useListVendor,
  useListVendorOrder,
  useListVendorOrderLine,
  useListVendorOrderLineDemand,
  usePurchaseNeedCancel,
  usePurchaseNeedMarkFulfilled,
  usePurchaseNeedMarkOrdered,
} from "../../lib/manifest-convex-react";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { InventoryWorkspaceNav } from "./InventoryWorkspaceNav";
import { PurchasingCommandForm } from "./PurchasingCommandForm";
import { PurchasingQueueSplit } from "./PurchasingQueueSplit";
import { SupplyFailureBanner } from "./SupplyFailureBanner";
import { SupplyLifecyclePolicy } from "./SupplyLifecyclePolicy";

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
  const markOrdered = usePurchaseNeedMarkOrdered();
  const markFulfilled = usePurchaseNeedMarkFulfilled();
  const cancelNeed = usePurchaseNeedCancel();
  const [form, setForm] = useState<"vendor" | "order" | null>(null);
  const [selectedNeedIds, setSelectedNeedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const activeNeeds = (needs ?? []).filter((item) => item.deletedAt == null);
  const activeVendors = (vendors ?? []).filter(
    (item) => item.deletedAt == null,
  );
  const activeOrders = (orders ?? []).filter((item) => item.deletedAt == null);
  const weeklyDrafts = useMemo(
    () =>
      activeOrders.filter(
        (order) =>
          String(order.status) === "draft" && order.sourceRangeStart != null,
      ),
    [activeOrders],
  );
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
      } else {
        await createOrder({
          vendorId: String(data.get("vendorId")),
          eventId: String(data.get("eventId")) || undefined,
          orderNumber:
            String(data.get("orderNumber") ?? "").trim() || undefined,
          notes: String(data.get("notes") ?? "").trim() || undefined,
        });
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
            throw new Error("This need is not linked to a weekly draft line.");
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
          <h1 className="display-title mt-2">Weekly purchasing drafts</h1>
          <p className="mt-3 max-w-160 text-ink-2">
            Approved events automatically maintain a shared weekly draft. Review
            quantities, adjust if needed, then submit.
          </p>
        </div>
        <div className="supply-masthead-actions">
          <button className="btn btn-ghost" onClick={() => setForm("vendor")}>
            Onboard vendor
          </button>
          <button className="btn btn-ghost" onClick={() => setForm("order")}>
            Open ad-hoc order
          </button>
        </div>
      </header>
      <InventoryWorkspaceNav />
      <aside className="supply-degraded" role="note">
        <strong>Automatic weekly draft</strong>
        <span>
          Add dishes, set headcount, approve the event — Manifest consolidates
          ingredient shortages into one DRAFT VendorOrder for the purchasing
          week. Approval never auto-submits.
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
          onCancel={() => setForm(null)}
          onSubmit={submit}
        />
      ) : null}

      <section className="working-ledger mt-6">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">This week</p>
            <h2>Auto-maintained drafts</h2>
          </div>
          <span>{weeklyDrafts.length} drafts</span>
        </div>
        {orders === undefined || vendors === undefined ? (
          <TableSkeleton rows={3} />
        ) : weeklyDrafts.length === 0 ? (
          <div className="document-empty">
            <p>No weekly drafts yet.</p>
            <span>
              Approve an event with dish demand after configuring a default
              vendor — the draft appears here.
            </span>
          </div>
        ) : (
          <div className="supply-table-wrap">
            <table className="supply-table">
              <thead>
                <tr>
                  <th>Week start</th>
                  <th>Vendor</th>
                  <th>Total</th>
                  <th>State</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {weeklyDrafts.map((order) => (
                  <tr key={order._id}>
                    <td>
                      <strong>
                        {order.sourceRangeStart
                          ? new Date(
                              order.sourceRangeStart,
                            ).toLocaleDateString()
                          : "—"}
                      </strong>
                    </td>
                    <td>{vendorName(order.vendorId)}</td>
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
                        Review &amp; submit →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
            <h2>All vendor orders</h2>
          </div>
          <span>{activeOrders.length} orders</span>
        </div>
        {orders === undefined || vendors === undefined ? (
          <TableSkeleton rows={5} />
        ) : activeOrders.length === 0 ? (
          <div className="document-empty">
            <p>No vendor orders are open.</p>
            <span>Weekly drafts appear after event approval.</span>
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
                        : "Weekly / general"}
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
