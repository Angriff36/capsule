import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateVendor,
  useCreateVendorContact,
  useCreateVendorOrder,
  useListEvent,
  useListIngredient,
  useListIngredientPriceObservation,
  useListPurchaseNeed,
  useListVendor,
  useListVendorContact,
  useListVendorOrder,
  useListVendorOrderLine,
  useListVendorOrderLineDemand,
  useListWeeklyPurchasingConfig,
  usePurchaseNeedCancel,
  usePurchaseNeedMarkFulfilled,
  usePurchaseNeedMarkOrdered,
  useWeeklyPurchasingConfigSetOrderApprovalThreshold,
} from "../../lib/manifest-convex-react";
import { ReasonCopy, useActionPrompt } from "../../ui/action-prompt";
import {
  BulkActionBar,
  useBulkRun,
  useBulkSelection,
} from "../../ui/bulk-select";
import { StatusChip, TableSkeleton } from "../../ui/primitives";
import { InventoryWorkspaceNav } from "./InventoryWorkspaceNav";
import { PurchasingCommandForm } from "./PurchasingCommandForm";
import { PurchasingQueueSplit } from "./PurchasingQueueSplit";
import { SupplyFailureBanner } from "./SupplyFailureBanner";
import { SupplyLifecyclePolicy } from "./SupplyLifecyclePolicy";
import { byVendorScore, computeVendorPerformance } from "./vendorPerformance";

const policy = new SupplyLifecyclePolicy();

export function PurchasingPage() {
  const needs = useListPurchaseNeed();
  const vendors = useListVendor();
  const orders = useListVendorOrder();
  const lines = useListVendorOrderLine();
  const demandLinks = useListVendorOrderLineDemand();
  const ingredients = useListIngredient();
  const events = useListEvent();
  const vendorContacts = useListVendorContact();
  const priceObservations = useListIngredientPriceObservation();
  const createVendor = useCreateVendor();
  const createOrder = useCreateVendorOrder();
  const createContact = useCreateVendorContact();
  const markOrdered = usePurchaseNeedMarkOrdered();
  const markFulfilled = usePurchaseNeedMarkFulfilled();
  const cancelNeed = usePurchaseNeedCancel();
  const purchasingConfigs = useListWeeklyPurchasingConfig();
  const setApprovalThreshold =
    useWeeklyPurchasingConfigSetOrderApprovalThreshold();
  const [form, setForm] = useState<"vendor" | "order" | "contact" | null>(null);
  const [contactVendorId, setContactVendorId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { prompt, host } = useActionPrompt(busy != null);

  const activeNeeds = (needs ?? []).filter((item) => item.deletedAt == null);
  const activeVendors = (vendors ?? []).filter(
    (item) => item.deletedAt == null,
  );
  const activeOrders = (orders ?? []).filter((item) => item.deletedAt == null);
  const vendorPerformance = useMemo(
    () =>
      computeVendorPerformance(
        activeVendors.map((vendor) => vendor._id),
        orders ?? [],
        lines ?? [],
        priceObservations ?? [],
        Date.now(),
      ),
    [activeVendors, orders, lines, priceObservations],
  );
  const rankedVendors = useMemo(
    () => [...activeVendors].sort(byVendorScore(vendorPerformance)),
    [activeVendors, vendorPerformance],
  );
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
  const needCanFulfill = (need: any) =>
    policy
      .purchaseNeedActions(String(need.status))
      .some((action) => action.key === "markFulfilled");
  const selectableNeeds = activeNeeds.filter(
    (need) => needCanCancel(need) || needCanFulfill(need),
  );
  const selection = useBulkSelection(selectableNeeds);
  const bulk = useBulkRun();

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
      } else if (current === "contact") {
        await createContact({
          vendorId: String(data.get("vendorId")),
          name: String(data.get("name") ?? "").trim(),
          role: String(data.get("role") ?? "general"),
          email: String(data.get("email") ?? "").trim() || undefined,
          phone: String(data.get("phone") ?? "").trim() || undefined,
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
      setContactVendorId(null);
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
    const targets = selection.selected.filter(needCanCancel);
    if (targets.length === 0) return;
    void (async () => {
      const reason = await prompt.askReason({
        ...ReasonCopy.cancelNeed,
        tone: "danger",
      });
      if (!reason) return;
      void run("bulk-cancel-needs", async () => {
        await bulk.runBulk(targets, async (need) => {
          await cancelNeed({ docId: need._id, version: need.version, reason });
        });
        selection.clear();
      });
    })();
  };

  const purchasingConfig = (purchasingConfigs ?? []).find(
    (config) => config.deletedAt == null,
  );
  const approvalThreshold =
    purchasingConfig?.orderApprovalThresholdAmount ?? null;

  const editApprovalThreshold = () => {
    void (async () => {
      if (!purchasingConfig) {
        setFailure(
          new Error(
            "Weekly purchasing is not set up for this workspace yet — the approval threshold lives on that config.",
          ),
        );
        return;
      }
      const values = await prompt.askFields({
        title: "Order approval threshold",
        description:
          "Vendor orders above this total need manager approval before they are sent. Leave blank to turn the gate off.",
        fields: [
          {
            name: "amount",
            label: "Threshold ($)",
            defaultValue:
              approvalThreshold != null ? String(approvalThreshold) : "",
            inputType: "number",
            required: false,
          },
        ],
        confirmLabel: "Save threshold",
      });
      if (!values) return;
      const raw = String(values.amount ?? "").trim();
      const amount = raw === "" ? undefined : Number(raw);
      if (amount !== undefined && (!Number.isFinite(amount) || amount < 0))
        return;
      void run("approval-threshold", async () => {
        await setApprovalThreshold({
          docId: purchasingConfig._id,
          version: purchasingConfig.version,
          amount,
        });
      });
    })();
  };

  const bulkFulfillNeeds = () => {
    const targets = selection.selected.filter(needCanFulfill);
    if (targets.length === 0) return;
    void run("bulk-fulfill-needs", async () => {
      await bulk.runBulk(targets, async (need) => {
        await markFulfilled({ docId: need._id, version: need.version });
      });
      selection.clear();
    });
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
          <button
            className="btn btn-ghost"
            disabled={busy != null}
            onClick={editApprovalThreshold}
          >
            {approvalThreshold != null
              ? `Approval threshold: $${Number(approvalThreshold).toFixed(2)}`
              : "Approval threshold: off"}
          </button>
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
          activeVendors={rankedVendors}
          events={events}
          contactVendorId={contactVendorId}
          onCancel={() => {
            setForm(null);
            setContactVendorId(null);
          }}
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
            <p>No weekly drafts yet</p>
            <span>
              Approved events with dish demand consolidate into one weekly draft
              here — no manual step. Set a default vendor so purchasing knows
              where to route.
            </span>
            <div className="mt-3 flex justify-center gap-2">
              <Link to="/events" className="btn btn-primary btn-sm">
                Go to events
              </Link>
              <Link to="/inventory/demand" className="btn btn-ghost btn-sm">
                Demand ledger
              </Link>
            </div>
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
        activeVendors={rankedVendors}
        vendorPerformance={vendorPerformance}
        vendorsLoading={vendors === undefined}
        busy={busy}
        canSelectNeed={(need) => needCanCancel(need) || needCanFulfill(need)}
        isNeedSelected={selection.isSelected}
        onToggleNeed={selection.toggle}
        linkedLine={linkedLine}
        ingredientName={ingredientName}
        eventName={eventName}
        onNeedAction={needAction}
        onOnboardVendor={() => setForm("vendor")}
        vendorContacts={(vendorContacts ?? []).filter(
          (contact) => contact.deletedAt == null,
        )}
        onAddContact={(vendorId) => {
          setContactVendorId(vendorId);
          setForm("contact");
        }}
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
            <p>No vendor orders yet</p>
            <span>
              Weekly drafts appear here automatically once you approve an event
              with demand. Onboard a vendor to be ready.
            </span>
            <div className="mt-3 flex justify-center gap-2">
              <Link to="/events" className="btn btn-primary btn-sm">
                Go to events
              </Link>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setForm("vendor")}
              >
                Onboard vendor
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

      <BulkActionBar
        count={selection.count}
        noun="need"
        progress={bulk.progress}
        onClear={selection.clear}
      >
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={
            busy != null ||
            selection.selected.filter(needCanFulfill).length === 0
          }
          onClick={bulkFulfillNeeds}
        >
          Fulfill ({selection.selected.filter(needCanFulfill).length})
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={
            busy != null ||
            selection.selected.filter(needCanCancel).length === 0
          }
          onClick={bulkCancelNeeds}
        >
          Cancel ({selection.selected.filter(needCanCancel).length})
        </button>
      </BulkActionBar>
    </div>
  );
}
