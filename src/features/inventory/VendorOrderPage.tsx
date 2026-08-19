import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { AttachmentsSection } from "../attachments/AttachmentsSection";
import { formatMoneyExact } from "../../lib/format";
import { useRouteRecord } from "../../lib/routeRecord";
import {
  useCreateVendorOrderLine,
  useGetVendorOrder,
  useListEvent,
  useListIngredient,
  useListInventoryLot,
  useListPurchaseNeed,
  useListStorageLocation,
  useListVendor,
  useListVendorContact,
  useListVendorOrderLine,
  useVendorOrderApprove,
  useVendorOrderCancel,
  useVendorOrderConfirm,
  useVendorOrderLineRecordReceipt,
  useVendorOrderMarkPartiallyReceived,
  useVendorOrderMarkReceived,
  useVendorOrderRequestChanges,
  useVendorOrderSubmit,
  useVendorOrderSubmitForApproval,
  useVendorOrderUpdateTotals,
} from "../../lib/manifest-convex-react";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import { QueryLoadState } from "../../ui/QueryLoadState";
import { useSlowQuery } from "../../ui/useSlowQuery";
import { ErrorState, StatusChip, TableSkeleton } from "../../ui/primitives";
import { InventoryWorkspaceNav } from "./InventoryWorkspaceNav";
import { SupplyFailureBanner } from "./SupplyFailureBanner";
import { SupplyLifecyclePolicy } from "./SupplyLifecyclePolicy";
import { vendorContactRoleLabel } from "./vendorContactRoles";

const policy = new SupplyLifecyclePolicy();

export function VendorOrderPage() {
  const { id } = useParams();
  const order = useRouteRecord(useGetVendorOrder, id);
  const vendors = useListVendor();
  const vendorContacts = useListVendorContact();
  const lines = useListVendorOrderLine();
  const needs = useListPurchaseNeed();
  const events = useListEvent();
  const ingredients = useListIngredient();
  const inventoryLots = useListInventoryLot();
  const locations = useListStorageLocation();
  const createLine = useCreateVendorOrderLine();
  const submitOrder = useVendorOrderSubmit();
  const submitForApproval = useVendorOrderSubmitForApproval();
  const approveOrder = useVendorOrderApprove();
  const requestChanges = useVendorOrderRequestChanges();
  const confirmOrder = useVendorOrderConfirm();
  const markPartial = useVendorOrderMarkPartiallyReceived();
  const markReceived = useVendorOrderMarkReceived();
  const cancelOrder = useVendorOrderCancel();
  const updateTotals = useVendorOrderUpdateTotals();
  const recordReceipt = useVendorOrderLineRecordReceipt();
  const [showLineForm, setShowLineForm] = useState(false);
  const [receivingLineId, setReceivingLineId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { prompt, host } = useActionPrompt(busy != null);
  const { loadingTooLong } = useSlowQuery(order);

  if (!id)
    return (
      <ErrorState title="Order not found" detail="No order id was provided." />
    );
  if (order === undefined) {
    return (
      <div className="operations-stage supply-stage order-folio">
        <Link className="text-link" to="/inventory/purchasing">
          ← Purchase queue
        </Link>
        <InventoryWorkspaceNav />
        <QueryLoadState
          title="Order data is not loading"
          detail="The workspace did not return this vendor order. Check the session or backend connection, then retry."
          loadingTooLong={loadingTooLong}
        />
      </div>
    );
  }
  if (order === null)
    return (
      <ErrorState
        title="Order not found"
        detail="This order is unavailable in the current workspace."
        onRetry={() => window.location.reload()}
      />
    );

  const orderLines = (lines ?? []).filter(
    (line) => line.deletedAt == null && line.vendorOrderId === order._id,
  );
  const openNeeds = (needs ?? []).filter(
    (need) => need.deletedAt == null && need.status === "open",
  );
  const vendor = vendors?.find((item) => item._id === order.vendorId);
  const orderContacts = (vendorContacts ?? []).filter(
    (contact) =>
      contact.deletedAt == null && contact.vendorId === order.vendorId,
  );
  const ingredientName = (ingredientId: string) =>
    ingredients?.find((item) => item._id === ingredientId)?.name ??
    "Unknown ingredient";
  const eventName = (eventId: string) =>
    events?.find((item) => item._id === eventId)?.title ?? "Unknown event";
  const locationName = (locationId?: string | null) =>
    locations?.find((item) => item._id === locationId)?.name ?? "Unassigned";

  // Spend-approval gate: Manifest-derived VendorOrder.needsSpendApproval
  // (hydrates tenant-singleton WeeklyPurchasingConfig by tenantId).
  const needsApproval = Boolean(order.needsSpendApproval);
  const isPendingApproval = Boolean(order.isPendingApproval);
  const isDraft = Boolean(order.isDraft);
  const isOpenForReceiving = Boolean(order.isOpenForReceiving);
  const orderActions = policy
    .orderActions(String(order.status))
    .filter((action) => {
      if (action.key === "submit") return !needsApproval;
      if (action.key === "submitForApproval") return needsApproval;
      // approve/requestChanges share the draft→submitted / →draft transitions
      // in the generated lifecycle; they only make sense while pending.
      if (action.key === "approve" || action.key === "requestChanges")
        return isPendingApproval;
      return true;
    });

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

  const submitLine = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const element = event.currentTarget;
    const data = new FormData(element);
    const need = openNeeds.find(
      (candidate) => candidate._id === String(data.get("purchaseNeedId")),
    );
    if (!need) {
      setFailure(new Error("Choose an open purchase need first."));
      return;
    }
    void run("create-line", async () => {
      await createLine({
        vendorOrderId: order._id,
        ingredientId: need.ingredientId,
        ingredientDemandId: need.ingredientDemandId,
        orderedQuantity: Number(data.get("orderedQuantity")),
        unit: need.unit,
        unitCost: Number(data.get("unitCost")),
        locationId: String(data.get("locationId")) || undefined,
      });
      element.reset();
      setShowLineForm(false);
    });
  };

  const submitReceipt = (event: FormEvent<HTMLFormElement>, line: any) => {
    event.preventDefault();
    const element = event.currentTarget;
    const data = new FormData(element);
    const discrepancy = String(data.get("discrepancyQuantity") ?? "").trim();
    void run(`${line._id}:receipt`, async () => {
      await recordReceipt({
        docId: line._id,
        version: line.version,
        quantity: Number(data.get("quantity")),
        locationId: String(data.get("locationId")),
        unitPrice: Number(data.get("unitPrice")),
        supplierLotNumber: String(data.get("supplierLotNumber") ?? "").trim(),
        discrepancyQuantity: discrepancy ? Number(discrepancy) : undefined,
        discrepancyNotes:
          String(data.get("discrepancyNotes") ?? "").trim() || undefined,
      });
      setReceivingLineId(null);
    });
  };

  const invokeOrderAction = (key: string) => {
    void (async () => {
      if (key === "cancel") {
        const reason = await prompt.askReason({
          ...ReasonCopy.cancelOrder,
          tone: "danger",
        });
        if (!reason) return;
        void run(`order:${key}`, async () => {
          await cancelOrder({
            docId: order._id,
            version: order.version,
            reason,
          });
        });
        return;
      }
      if (key === "requestChanges") {
        const notes = await prompt.askReason(ReasonCopy.requestOrderChanges);
        if (!notes) return;
        void run(`order:${key}`, async () => {
          await requestChanges({
            docId: order._id,
            version: order.version,
            notes,
          });
        });
        return;
      }
      void run(`order:${key}`, async () => {
        const args = { docId: order._id, version: order.version };
        if (key === "submit") await submitOrder(args);
        if (key === "submitForApproval") await submitForApproval(args);
        if (key === "approve") await approveOrder(args);
        if (key === "confirm") await confirmOrder(args);
        if (key === "markPartiallyReceived") await markPartial(args);
        if (key === "markReceived") await markReceived(args);
      });
    })();
  };

  const reviseTotals = () => {
    void (async () => {
      const values = await prompt.askFields({
        title: "Revise order totals",
        description: "Update subtotal, tax, and shipping for this order.",
        fields: [
          {
            name: "subtotal",
            label: "Subtotal",
            defaultValue: String(order.subtotal),
            inputType: "number",
            required: true,
          },
          {
            name: "taxAmount",
            label: "Tax",
            defaultValue: String(order.taxAmount),
            inputType: "number",
            required: true,
          },
          {
            name: "shippingAmount",
            label: "Shipping",
            defaultValue: String(order.shippingAmount),
            inputType: "number",
            required: true,
          },
        ],
        confirmLabel: "Save totals",
      });
      if (!values) return;
      const subtotal = Number(values.subtotal);
      const taxAmount = Number(values.taxAmount);
      const shippingAmount = Number(values.shippingAmount);
      if (
        ![subtotal, taxAmount, shippingAmount].every(
          (value) => Number.isFinite(value) && value >= 0,
        )
      )
        return;
      void run("order:totals", async () => {
        await updateTotals({
          docId: order._id,
          version: order.version,
          subtotal,
          taxAmount,
          shippingAmount,
        });
      });
    })();
  };

  return (
    <div className="operations-stage supply-stage order-folio">
      <Link className="text-link" to="/inventory/purchasing">
        ← Purchase queue
      </Link>
      <header className="order-folio-masthead">
        <div>
          <p className="eyebrow">Vendor order · {order._id.slice(-8)}</p>
          <h1 className="display-title mt-2">
            {order.orderNumber || "Unnumbered order"}
          </h1>
          <p className="mt-3 text-ink-2">
            {vendor?.name ?? "Unknown vendor"} ·{" "}
            {order.eventId ? "Event order" : "General stock"}
          </p>
        </div>
        <div className="order-state">
          <StatusChip status={String(order.status)} />
          <strong>{formatMoneyExact(Number(order.totalAmount))}</strong>
          <span>Order total</span>
        </div>
      </header>
      <InventoryWorkspaceNav />
      <aside className="supply-degraded" role="note">
        <strong>
          Marking an order received does not update your stock counts
        </strong>
        <span>
          Record the receipt here, then log the delivery in the Stock book once
          the goods are physically put away.
        </span>
      </aside>
      {failure ? <SupplyFailureBanner error={failure} /> : null}
      {host}

      {orderContacts.length > 0 ? (
        <aside className="supply-degraded" role="note">
          <strong>
            Vendor contacts — who to call about lead time or substitutions
          </strong>
          {orderContacts.map((contact) => (
            <span key={contact._id}>
              {vendorContactRoleLabel(String(contact.role))} · {contact.name}
              {contact.phone ? (
                <>
                  {" · "}
                  <a className="text-link" href={`tel:${contact.phone}`}>
                    {contact.phone}
                  </a>
                </>
              ) : null}
              {contact.email ? (
                <>
                  {" · "}
                  <a className="text-link" href={`mailto:${contact.email}`}>
                    {contact.email}
                  </a>
                </>
              ) : null}
            </span>
          ))}
        </aside>
      ) : null}

      {isPendingApproval ? (
        <aside className="supply-degraded" role="note">
          <strong>Awaiting manager approval before it is sent</strong>
          <span>
            This order total ({formatMoneyExact(Number(order.totalAmount))}) is
            above the spend approval threshold. A manager can approve it in one
            click or request modifications.
          </span>
        </aside>
      ) : null}
      {isDraft && order.approvalNotes ? (
        <aside className="supply-degraded" role="note">
          <strong>Changes requested by a manager</strong>
          <span>{order.approvalNotes}</span>
        </aside>
      ) : null}
      {isOpenForReceiving && order.hasIncompleteLines ? (
        <aside className="supply-degraded" role="note">
          <strong>Receiving still open</strong>
          <span>
            One or more lines still have quantity left to receive. Record each
            receipt below until every line is complete.
          </span>
        </aside>
      ) : null}

      <section className="order-controls">
        <div className="supply-row-actions">
          {orderActions.map((action) => (
            <button
              key={action.key}
              className="btn btn-ghost"
              disabled={busy != null}
              onClick={() => invokeOrderAction(action.key)}
            >
              {busy === `order:${action.key}` ? "Working…" : action.label}
            </button>
          ))}
        </div>
        <div className="supply-row-actions">
          <button
            className="btn btn-ghost"
            disabled={busy != null}
            onClick={reviseTotals}
          >
            Revise totals
          </button>
          <button
            className="btn btn-primary"
            disabled={busy != null}
            onClick={() => setShowLineForm((value) => !value)}
          >
            {showLineForm ? "Close line form" : "Add order line"}
          </button>
        </div>
      </section>

      {showLineForm ? (
        <form className="supply-form" onSubmit={submitLine}>
          <div className="supply-form-heading">
            <div>
              <p className="eyebrow">Demand-backed line</p>
              <h2>Add to order</h2>
            </div>
            <button className="btn btn-primary" disabled={busy != null}>
              {busy === "create-line" ? "Adding…" : "Add line"}
            </button>
          </div>
          <div className="supply-form-grid">
            <label className="field-label supply-span-2">
              Open purchase need
              <select name="purchaseNeedId" className="input" required>
                <option value="">Select need</option>
                {openNeeds.map((need) => (
                  <option key={need._id} value={need._id}>
                    {ingredientName(need.ingredientId)} ·{" "}
                    {need.requiredQuantity} {need.unit} ·{" "}
                    {need.eventId.slice(-8)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              Ordered quantity
              <input
                name="orderedQuantity"
                className="input"
                type="number"
                min={0.0001}
                step="any"
                required
              />
            </label>
            <label className="field-label">
              Unit cost
              <input
                name="unitCost"
                className="input"
                type="number"
                min={0}
                step="any"
                defaultValue={0}
                required
              />
            </label>
            <label className="field-label">
              Receipt location
              <select name="locationId" className="input">
                <option value="">Assign on receipt</option>
                {(locations ?? [])
                  .filter(
                    (item) =>
                      item.deletedAt == null && item.status === "active",
                  )
                  .map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </form>
      ) : null}

      <section className="working-ledger order-lines">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Receipt progress</p>
            <h2>Order lines</h2>
          </div>
          <span>{orderLines.length} lines</span>
        </div>
        {lines === undefined ||
        needs === undefined ||
        events === undefined ||
        ingredients === undefined ||
        inventoryLots === undefined ||
        locations === undefined ? (
          <TableSkeleton rows={6} />
        ) : orderLines.length === 0 ? (
          <div className="document-empty">
            <p>No lines have been added.</p>
            <span>
              Choose an open purchase need so the order stays tied to the event
              that created it.
            </span>
          </div>
        ) : (
          <ul>
            {orderLines.map((line) => {
              const lineNeeds = needs.filter(
                (item) =>
                  item.deletedAt == null && item.vendorOrderLineId === line._id,
              );
              const lineLots = inventoryLots
                .filter(
                  (item) =>
                    item.deletedAt == null &&
                    item.vendorOrderLineId === line._id,
                )
                .sort(
                  (left, right) =>
                    Number(right.receivedAt ?? 0) -
                    Number(left.receivedAt ?? 0),
                );
              return (
                <li key={line._id}>
                  <div className="order-line-summary">
                    <div>
                      <strong>{ingredientName(line.ingredientId)}</strong>
                      <span>
                        {lineNeeds.length
                          ? `${lineNeeds.length} contributing purchase need${lineNeeds.length === 1 ? "" : "s"}`
                          : "Not tied to a purchase need"}
                      </span>
                      {lineNeeds.map((need) => (
                        <small key={need._id}>
                          {eventName(need.eventId)} · {need.requiredQuantity}{" "}
                          {need.unit}
                        </small>
                      ))}
                    </div>
                    <div className="order-line-quantity">
                      <strong>
                        {line.receivedQuantity} / {line.orderedQuantity}
                      </strong>
                      <span>
                        {line.unit} received
                        {line.isFullyReceived
                          ? " · complete"
                          : ` · ${line.remainingQuantity} remaining`}
                      </span>
                      <small>
                        {formatMoneyExact(Number(line.lineTotal))} line ·{" "}
                        {formatMoneyExact(Number(line.unitCost))} / {line.unit}
                        {line.hasReceivingDiscrepancy
                          ? ` · discrepancy ${line.discrepancyQuantity}`
                          : ""}
                      </small>
                    </div>
                    <div>
                      <StatusChip status={String(line.status)} />
                      <span>{locationName(line.locationId)}</span>
                    </div>
                    <button
                      className="btn btn-ghost btn-sm"
                      disabled={
                        busy != null ||
                        !isOpenForReceiving ||
                        Boolean(line.isFullyReceived)
                      }
                      onClick={() =>
                        setReceivingLineId((value) =>
                          value === line._id ? null : line._id,
                        )
                      }
                    >
                      Record receipt
                    </button>
                  </div>
                  {lineLots.length > 0 ? (
                    <div
                      className="receipt-lot-history"
                      aria-label="Receipt lot history"
                    >
                      <span>Supplier lots</span>
                      <ul>
                        {lineLots.map((lot) => (
                          <li key={lot._id}>
                            <strong>{lot.supplierLotNumber}</strong>
                            <span>
                              {lot.receiptQuantity} {lot.unit} · PO line{" "}
                              {line._id.slice(-8)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {receivingLineId === line._id ? (
                    <form
                      className="receipt-form"
                      onSubmit={(event) => submitReceipt(event, line)}
                    >
                      <label className="field-label">
                        Receipt quantity
                        <input
                          name="quantity"
                          type="number"
                          min={0.0001}
                          step="any"
                          className="input"
                          required
                        />
                      </label>
                      <label className="field-label">
                        Location
                        <select
                          name="locationId"
                          className="input"
                          defaultValue={line.locationId ?? ""}
                          required
                        >
                          <option value="">Select location</option>
                          {(locations ?? [])
                            .filter(
                              (item) =>
                                item.deletedAt == null &&
                                item.status === "active",
                            )
                            .map((item) => (
                              <option key={item._id} value={item._id}>
                                {item.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="field-label">
                        Confirmed unit price
                        <input
                          name="unitPrice"
                          type="number"
                          min={0}
                          step="0.01"
                          defaultValue={Number(line.unitCost)}
                          className="input"
                          required
                        />
                      </label>
                      <label className="field-label">
                        Supplier lot number
                        <input
                          name="supplierLotNumber"
                          className="input"
                          autoComplete="off"
                          required
                        />
                      </label>
                      <label className="field-label">
                        Discrepancy quantity
                        <input
                          name="discrepancyQuantity"
                          type="number"
                          min={0}
                          step="any"
                          className="input"
                        />
                      </label>
                      <label className="field-label">
                        Discrepancy notes
                        <input name="discrepancyNotes" className="input" />
                      </label>
                      <button
                        className="btn btn-primary"
                        disabled={busy != null}
                      >
                        {busy === `${line._id}:receipt`
                          ? "Recording…"
                          : "Record"}
                      </button>
                    </form>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <AttachmentsSection parentType="vendor" parentId={order.vendorId} />
    </div>
  );
}
