import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateVendor,
  useCreateVendorOrder,
  useCreateVendorOrderLine,
  useListEvent,
  useListIngredient,
  useListPurchaseNeed,
  useListVendor,
  useListVendorOrder,
  useListVendorOrderLine,
  usePurchaseNeedCancel,
  usePurchaseNeedAssignToDraft,
  usePurchaseNeedMarkFulfilled,
  usePurchaseNeedMarkOrdered,
} from "../../lib/manifest-convex-react";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { InventoryWorkspaceNav } from "./InventoryWorkspaceNav";
import { SupplyFailureBanner } from "./SupplyFailureBanner";
import { SupplyLifecyclePolicy } from "./SupplyLifecyclePolicy";
import { PrepPurchaseDraftCoordinator } from "./PrepPurchaseDraftCoordinator";

const policy = new SupplyLifecyclePolicy();

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function startOfDay(value: string) {
  return new Date(`${value}T00:00:00`).getTime();
}

function endOfDay(value: string) {
  return new Date(`${value}T23:59:59.999`).getTime();
}

export function PurchasingPage() {
  const needs = useListPurchaseNeed();
  const vendors = useListVendor();
  const orders = useListVendorOrder();
  const lines = useListVendorOrderLine();
  const ingredients = useListIngredient();
  const events = useListEvent();
  const createVendor = useCreateVendor();
  const createOrder = useCreateVendorOrder();
  const createOrderLine = useCreateVendorOrderLine();
  const assignNeedToDraft = usePurchaseNeedAssignToDraft();
  const markOrdered = usePurchaseNeedMarkOrdered();
  const markFulfilled = usePurchaseNeedMarkFulfilled();
  const cancelNeed = usePurchaseNeedCancel();
  const [form, setForm] = useState<"vendor" | "order" | "prepDraft" | null>(
    null,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const [generatedOrderId, setGeneratedOrderId] = useState<string | null>(null);
  const [draftRange, setDraftRange] = useState({ start: "", end: "" });

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
    lines?.find(
      (line) =>
        line.deletedAt == null &&
        line.ingredientDemandId === need.ingredientDemandId &&
        line.status !== "cancelled",
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
          assignNeedToDraft: (input) =>
            assignNeedToDraft(input as Parameters<typeof assignNeedToDraft>[0]),
        });
        const result = await coordinator.generate({
          vendorId: String(data.get("vendorId")),
          rangeStart,
          rangeEnd,
          needs: activeNeeds.map((need) => ({
            id: need._id,
            version: need.version,
            eventId: need.eventId,
            ingredientId: need.ingredientId,
            requiredQuantity: Number(need.requiredQuantity),
            unit: String(need.unit),
            status: String(need.status),
            deletedAt: need.deletedAt,
          })),
          events: (events ?? []).map((item) => ({
            id: item._id,
            startsAt: item.startsAt,
            deletedAt: item.deletedAt,
          })),
        });
        setGeneratedOrderId(result.orderId);
      }
      element.reset();
      setForm(null);
    });
  };

  const needAction = (need: any, key: string) => {
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
      if (key === "cancel") {
        const reason = window.prompt("Cancellation reason")?.trim();
        if (!reason) return;
        await cancelNeed({ ...args, reason });
      }
    });
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
        <strong>Demand provenance stays explicit</strong>
        <span>
          The generated add-line reaction does not yet prove PurchaseNeed
          ordering. Link a line to demand in the order folio, then apply the
          separate governed “Mark ordered” command here.
        </span>
      </aside>
      {failure ? <SupplyFailureBanner error={failure} /> : null}
      {form ? (
        <form className="supply-form" onSubmit={submit}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">Governed procurement command</p>
              <h2>
                {form === "vendor"
                  ? "Onboard vendor"
                  : form === "order"
                    ? "Open vendor order"
                    : "Generate prep-list draft"}
              </h2>
            </div>
            <div className="supply-row-actions">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setForm(null)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy != null}>
                {busy ? "Working…" : "Create"}
              </button>
            </div>
          </div>
          <div className="supply-form-grid">
            {form === "vendor" ? (
              <>
                <label className="field-label">
                  Vendor name
                  <input name="name" className="input" required autoFocus />
                </label>
                <label className="field-label">
                  Email
                  <input name="email" type="email" className="input" />
                </label>
                <label className="field-label">
                  Phone
                  <input name="phone" className="input" />
                </label>
                <label className="field-label">
                  Payment terms (days)
                  <input
                    name="paymentTermsDays"
                    type="number"
                    min={0}
                    defaultValue={30}
                    className="input"
                    required
                  />
                </label>
                <label className="field-label supply-span-2">
                  Notes
                  <textarea name="notes" className="input min-h-20 py-2" />
                </label>
              </>
            ) : form === "order" ? (
              <>
                <label className="field-label">
                  Vendor
                  <select name="vendorId" className="input" required>
                    <option value="">Select vendor</option>
                    {activeVendors
                      .filter((item) => item.status === "active")
                      .map((item) => (
                        <option key={item._id} value={item._id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field-label">
                  Event (optional)
                  <select name="eventId" className="input">
                    <option value="">No event</option>
                    {(events ?? [])
                      .filter((item) => item.deletedAt == null)
                      .map((item) => (
                        <option key={item._id} value={item._id}>
                          {item.title}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="field-label">
                  Order number
                  <input name="orderNumber" className="input" />
                </label>
                <label className="field-label supply-span-2">
                  Notes
                  <textarea name="notes" className="input min-h-20 py-2" />
                </label>
              </>
            ) : (
              <>
                <label className="field-label">
                  Vendor
                  <select name="vendorId" className="input" required>
                    <option value="">Select vendor</option>
                    {activeVendors
                      .filter((item) => item.status === "active")
                      .map((item) => (
                        <option key={item._id} value={item._id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="field-label">
                  Quick range
                  <div className="supply-row-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        const today = new Date();
                        const start = new Date(today);
                        start.setDate(today.getDate() - 7);
                        setDraftRange({
                          start: isoDate(start),
                          end: isoDate(today),
                        });
                      }}
                    >
                      Last 7 days
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        const today = new Date();
                        const end = new Date(today);
                        end.setDate(today.getDate() + 7);
                        setDraftRange({
                          start: isoDate(today),
                          end: isoDate(end),
                        });
                      }}
                    >
                      Upcoming 7 days
                    </button>
                  </div>
                </div>
                <label className="field-label">
                  From
                  <input
                    name="rangeStart"
                    type="date"
                    className="input"
                    required
                    value={draftRange.start}
                    onChange={(event) =>
                      setDraftRange((range) => ({
                        ...range,
                        start: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field-label">
                  Through
                  <input
                    name="rangeEnd"
                    type="date"
                    className="input"
                    required
                    value={draftRange.end}
                    onChange={(event) =>
                      setDraftRange((range) => ({
                        ...range,
                        end: event.target.value,
                      }))
                    }
                  />
                </label>
                <p className="supply-span-2 text-[12px] text-ink-2">
                  Combines open prep-list purchase needs across every event in
                  the selected inclusive range. The generated order remains a
                  draft until you submit it.
                </p>
              </>
            )}
          </div>
        </form>
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

      <div className="supply-split">
        <section className="working-ledger">
          <div className="ledger-heading">
            <div>
              <p className="eyebrow">Open demand</p>
              <h2>Purchase needs</h2>
            </div>
            <span>{activeNeeds.length} needs</span>
          </div>
          {needs === undefined ||
          ingredients === undefined ||
          events === undefined ||
          lines === undefined ? (
            <TableSkeleton rows={6} />
          ) : activeNeeds.length === 0 ? (
            <div className="document-empty">
              <p>No purchase needs are open.</p>
              <span>Confirmed demand can create the first governed need.</span>
            </div>
          ) : (
            <ul className="purchase-queue">
              {activeNeeds.map((need) => {
                const line = linkedLine(need);
                return (
                  <li key={need._id}>
                    <div>
                      <strong>{ingredientName(need.ingredientId)}</strong>
                      <span>
                        {eventName(need.eventId)} · {need.requiredQuantity}{" "}
                        {need.unit}
                      </span>
                    </div>
                    <StatusChip status={String(need.status)} />
                    <div className="supply-row-actions">
                      {policy
                        .purchaseNeedActions(String(need.status))
                        .map((action) => (
                          <button
                            key={action.key}
                            className="btn btn-ghost btn-sm"
                            disabled={
                              busy != null ||
                              (action.key === "markOrdered" && !line)
                            }
                            title={
                              action.key === "markOrdered" && !line
                                ? "Add an order line linked to this demand first"
                                : undefined
                            }
                            onClick={() => needAction(need, action.key)}
                          >
                            {busy === `${need._id}:${action.key}`
                              ? "Working…"
                              : action.label}
                          </button>
                        ))}
                    </div>
                    {line ? (
                      <small>
                        Line {line._id.slice(-8)} · order{" "}
                        {line.vendorOrderId.slice(-8)}
                      </small>
                    ) : (
                      <small>No linked order line</small>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <aside className="vendor-index">
          <div className="ledger-heading">
            <div>
              <p className="eyebrow">Supplier book</p>
              <h2>Vendors</h2>
            </div>
            <span>{activeVendors.length}</span>
          </div>
          {vendors === undefined ? (
            <TableSkeleton rows={4} />
          ) : activeVendors.length === 0 ? (
            <div className="document-empty">
              <p>No vendors onboarded.</p>
            </div>
          ) : (
            <ul>
              {activeVendors.map((vendor) => (
                <li key={vendor._id}>
                  <div>
                    <strong>{vendor.name}</strong>
                    <span>
                      {vendor.email || vendor.phone || "No contact shown"}
                    </span>
                  </div>
                  <StatusChip status={String(vendor.status)} />
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

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
