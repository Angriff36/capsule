import { useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  useCreateVendor,
  useCreateVendorContact,
  useCreateVendorOrder,
  useListIngredient,
  useListIngredientDemand,
  useListIngredientPriceObservation,
  useListItemUnitMapping,
  useListInventoryItem,
  useListPurchaseNeed,
  useListVendor,
  useListVendorContact,
  useListVendorOrder,
  useListVendorOrderLine,
  useListVendorOrderLineDemand,
  useCreateWeeklyPurchasingConfig,
  useListWeeklyPurchasingConfig,
  useWeeklyPurchasingConfigConfigure,
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
import { formatDate, formatMoneyExact } from "../../lib/format";
import { InventoryWorkspaceNav } from "./InventoryWorkspaceNav";
import {
  NEW_VENDOR_FIELD,
  PurchasingCommandForm,
} from "./PurchasingCommandForm";
import { findByName } from "./inlineCatalogChoice";
import { WeeklyDraftPanel } from "./WeeklyDraftPanel";
import { currentWeeklyDraft, weeklyDraftLines } from "./weeklyDraftView";
import { PurchasingQueueSplit } from "./PurchasingQueueSplit";
import { purchasingStockContext } from "./purchasingStockContext";
import { listOriginState, useListOrigin } from "../list-state/listOrigin";
import { SeasonalDemandForecast } from "./SeasonalDemandForecast";
import { VendorPriceListImport } from "./VendorPriceListImport";
import { SentOrderSurplusPanel } from "./SentOrderSurplusPanel";
import { sentOrderSurplus } from "./sentOrderSurplus";
import { SupplyFailureBanner } from "./SupplyFailureBanner";
import { SupplyLifecyclePolicy } from "./SupplyLifecyclePolicy";
import { vendorOrderHeaderTotal } from "./vendorOrderHeaderTotal";
import { vendorOrderTitle } from "./vendorOrderNumber";
import { byVendorScore, computeVendorPerformance } from "./vendorPerformance";
import { WorkingEventScopeNote } from "../events/WorkingEventScope";
import { usePickerAndNamedEvents } from "../facilities/usePickerAndNamedEvents";
import { usePurchasingScopeViewModel } from "./PurchasingScopeViewModel";

const policy = new SupplyLifecyclePolicy();

export function PurchasingPage() {
  const { eventScope, linkedEventId, scopedEventId, showAllEvents } =
    usePurchasingScopeViewModel();
  const listOrigin = useListOrigin();
  const needs = useListPurchaseNeed();
  const vendors = useListVendor();
  const orders = useListVendorOrder();
  const lines = useListVendorOrderLine();
  const demandLinks = useListVendorOrderLineDemand();
  const ingredients = useListIngredient();
  const inventoryItems = useListInventoryItem();
  const vendorContacts = useListVendorContact();
  const priceObservations = useListIngredientPriceObservation();
  const demands = useListIngredientDemand();
  const events = usePickerAndNamedEvents(
    needs && orders && demands
      ? [
          scopedEventId,
          ...needs.map((row) => row.eventId),
          ...orders.map((row) => row.eventId),
          ...demands.map((row) => row.eventId),
        ]
      : undefined,
  );
  const unitMappings = useListItemUnitMapping();
  const createVendor = useCreateVendor();
  const createOrder = useCreateVendorOrder();
  const createContact = useCreateVendorContact();
  const markOrdered = usePurchaseNeedMarkOrdered();
  const markFulfilled = usePurchaseNeedMarkFulfilled();
  const cancelNeed = usePurchaseNeedCancel();
  const purchasingConfigs = useListWeeklyPurchasingConfig();
  const setApprovalThreshold =
    useWeeklyPurchasingConfigSetOrderApprovalThreshold();
  const configureWeeklyPurchasing = useWeeklyPurchasingConfigConfigure();
  const createWeeklyPurchasingConfig = useCreateWeeklyPurchasingConfig();
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
  const shownNeeds = activeNeeds.filter(
    (item) => scopedEventId == null || String(item.eventId) === scopedEventId,
  );
  // Vendor scores use every order; operator-facing ledgers honor an explicit
  // cascade link before falling back to the working-event scope.
  const shownOrders = activeOrders.filter(
    (item) =>
      scopedEventId == null || String(item.eventId ?? "") === scopedEventId,
  );
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
  const shownWeeklyDrafts = weeklyDrafts.filter(
    (order) =>
      scopedEventId == null || String(order.eventId ?? "") === scopedEventId,
  );
  // Purchasing opens on the week's automatic draft (BE-10.6).
  const currentDraft = currentWeeklyDraft(weeklyDrafts, Date.now());
  const currentDraftLines =
    currentDraft &&
    lines !== undefined &&
    demandLinks !== undefined &&
    needs !== undefined &&
    demands !== undefined
      ? weeklyDraftLines({
          order: currentDraft,
          lines,
          links: demandLinks,
          needs,
          demands,
          mappings: unitMappings ?? [],
        })
      : null;
  const ingredientName = (id: string) =>
    ingredients?.find((item) => item._id === id)?.name ?? "Unknown ingredient";
  const eventName = (id: string) =>
    events?.find((item) => item._id === id)?.title ?? "Unknown event";
  const vendorName = (id: string) =>
    vendors?.find((item) => item._id === id)?.name ?? "Unknown vendor";
  const linkedLines = (need: { ingredientDemandId: string }) =>
    lines?.filter((line) => {
      if (line.deletedAt != null || line.status === "cancelled") return false;
      if (line.ingredientDemandId === need.ingredientDemandId) return true;
      return demandLinks?.some(
        (link) =>
          link.deletedAt == null &&
          link.vendorOrderLineId === line._id &&
          link.ingredientDemandId === need.ingredientDemandId,
      );
    });
  const linkedLine = (need: { ingredientDemandId: string }) =>
    linkedLines(need)?.[0];
  const linkedOrders = (need: { ingredientDemandId: string }) => {
    if (
      lines === undefined ||
      demandLinks === undefined ||
      orders === undefined ||
      vendors === undefined
    )
      return undefined;
    return [
      ...new Set(linkedLines(need)?.map((line) => line.vendorOrderId)),
    ].map((id) => {
      const order = orders.find((item) => item._id === id);
      return {
        id,
        label: order
          ? `${vendorName(order.vendorId)} ${order.orderNumber?.trim() || "order"}`
          : "View linked order",
      };
    });
  };
  const stockContext = (need: { ingredientId: string; unit: string }) =>
    purchasingStockContext(need, inventoryItems, Date.now());
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
  const selection = useBulkSelection(
    selectableNeeds.filter((need) => shownNeeds.includes(need)),
  );
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

  // A vendor named in the inline box is added first (or reused when a retry
  // or a teammate already added that name), then the order uses it.
  const addVendorByName = async (name: string) => {
    const existing = findByName(
      activeVendors.filter((vendor) => String(vendor.status) === "active"),
      name,
    );
    if (existing) return existing._id;
    const created = (await createVendor({
      name: name.trim(),
      paymentTermsDays: 30,
    })) as { docId: string };
    return String(created.docId);
  };
  const orderVendorId = async (data: FormData) => {
    const newName = String(data.get(NEW_VENDOR_FIELD) ?? "").trim();
    return newName
      ? await addVendorByName(newName)
      : String(data.get("vendorId"));
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
          vendorId: await orderVendorId(data),
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
  const defaultVendorId = purchasingConfig?.defaultVendorId ?? null;

  // The PurchaseNeedOpened → routeNeed reaction can only build the weekly
  // draft once a default vendor is configured; without this control the
  // WeeklyPurchasingConfig.configure command had no UI caller at all.
  const editDefaultVendor = () => {
    void (async () => {
      const vendorOptions = activeVendors
        .filter((vendor) => String(vendor.status) === "active")
        .map((vendor) => ({
          value: vendor._id,
          label: String(vendor.name ?? vendor._id),
        }));
      // No vendors yet: name one here instead of a dead end.
      const values = await prompt.askFields({
        title: "Default purchasing vendor",
        description:
          vendorOptions.length === 0
            ? "No vendors yet. Name the vendor you buy from most; add contact details later."
            : "Approved-event shortages route to this vendor's weekly draft order.",
        fields: [
          vendorOptions.length === 0
            ? { name: "vendorName", label: "Vendor name", required: true }
            : {
                name: "vendorId",
                label: "Vendor",
                required: true,
                defaultValue: defaultVendorId ?? undefined,
                options: vendorOptions,
              },
        ],
        confirmLabel: "Set usual vendor",
      });
      const typedName = String(values?.vendorName ?? "").trim();
      if (!values?.vendorId && !typedName) return;
      void run("default-vendor", async () => {
        const vendorId = values?.vendorId || (await addVendorByName(typedName));
        if (purchasingConfig) {
          await configureWeeklyPurchasing({
            docId: purchasingConfig._id,
            version: purchasingConfig.version,
            defaultVendorId: vendorId,
          });
        } else {
          await createWeeklyPurchasingConfig({
            defaultVendorId: vendorId,
          });
        }
      });
    })();
  };

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
      if (amount !== undefined && (!Number.isFinite(amount) || amount < 0)) {
        setFailure(
          new Error(
            "The approval threshold must be a number of 0 or more. Leave it empty for no threshold.",
          ),
        );
        return;
      }
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
              ? `Orders over ${formatMoneyExact(Number(approvalThreshold))} need approval`
              : "Orders need no approval"}
          </button>
          <button
            className="btn btn-ghost"
            disabled={busy != null}
            onClick={editDefaultVendor}
          >
            {defaultVendorId != null
              ? `Usual vendor: ${vendorName(defaultVendorId)}`
              : "Usual vendor: not set"}
          </button>
          <button className="btn btn-ghost" onClick={() => setForm("vendor")}>
            Add a vendor
          </button>
          <button className="btn btn-ghost" onClick={() => setForm("order")}>
            Start an extra order
          </button>
        </div>
      </header>
      <InventoryWorkspaceNav />
      <aside className="supply-degraded" role="note">
        <strong>Automatic weekly draft</strong>
        <span>
          Add dishes, set headcount, approve the event — Capsule rolls the
          ingredient shortages into one draft vendor order for the week. Mark
          the order sent, then email it to the vendor from the order page (or
          send it your own way).
        </span>
      </aside>
      {failure ? <SupplyFailureBanner error={failure} /> : null}
      {host}
      {form ? (
        <PurchasingCommandForm
          form={form}
          busy={busy != null}
          activeVendors={rankedVendors}
          vendorsLoading={vendors === undefined}
          events={events}
          contactVendorId={contactVendorId}
          onCancel={() => {
            setForm(null);
            setContactVendorId(null);
          }}
          onSubmit={submit}
        />
      ) : null}

      {currentDraft && currentDraftLines ? (
        <WeeklyDraftPanel
          order={currentDraft}
          vendorName={vendorName(currentDraft.vendorId)}
          lines={currentDraftLines}
          ingredientName={ingredientName}
          eventName={eventName}
        />
      ) : null}

      <section className="working-ledger mt-6">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">All weeks</p>
            <h2>Weekly drafts</h2>
          </div>
          <span>{shownWeeklyDrafts.length} drafts</span>
        </div>
        {orders === undefined || vendors === undefined ? (
          <TableSkeleton rows={3} />
        ) : shownWeeklyDrafts.length === 0 ? (
          <div className="document-empty">
            <p>No weekly drafts yet</p>
            <span>
              Each approved event with dishes adds what it needs to one weekly
              draft here by itself. Set a usual vendor so Capsule knows who the
              draft goes to.
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
                {shownWeeklyDrafts.map((order) => (
                  <tr key={order._id}>
                    <td>
                      <strong>
                        {order.sourceRangeStart
                          ? formatDate(order.sourceRangeStart)
                          : "—"}
                      </strong>
                    </td>
                    <td>{vendorName(order.vendorId)}</td>
                    <td className="supply-number">
                      {formatMoneyExact(vendorOrderHeaderTotal(order, lines))}
                    </td>
                    <td>
                      <StatusChip status={String(order.status)} />
                    </td>
                    <td>
                      <Link
                        className="text-link"
                        to={`/inventory/orders/${order._id}`}
                        state={listOriginState(listOrigin)}
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

      <SentOrderSurplusPanel
        rows={sentOrderSurplus({ needs: needs ?? [], orders: orders ?? [] })}
        eventName={eventName}
        ingredientName={ingredientName}
      />

      <PurchasingQueueSplit
        needsLoading={
          needs === undefined ||
          ingredients === undefined ||
          events === undefined ||
          lines === undefined ||
          demandLinks === undefined
        }
        activeNeeds={shownNeeds}
        activeVendors={rankedVendors}
        vendorPerformance={vendorPerformance}
        vendorsLoading={vendors === undefined}
        busy={busy}
        canSelectNeed={(need) => needCanCancel(need) || needCanFulfill(need)}
        isNeedSelected={selection.isSelected}
        onToggleNeed={selection.toggle}
        linkedLine={linkedLine}
        stockContext={stockContext}
        linkedOrders={linkedOrders}
        ingredientName={ingredientName}
        ingredients={ingredients}
        eventName={eventName}
        scopedEventName={
          scopedEventId == null ? undefined : eventName(scopedEventId)
        }
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

      {linkedEventId ? (
        <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-2">
          <span>
            Showing purchase work for{" "}
            <strong className="text-ink">{eventName(linkedEventId)}</strong>.
          </span>
          <button type="button" className="text-link" onClick={showAllEvents}>
            Show all events
          </button>
        </p>
      ) : (
        <WorkingEventScopeNote scope={eventScope} noun="purchase orders" />
      )}
      <section className="working-ledger mt-10">
        <div className="ledger-heading">
          <div>
            <p className="eyebrow">Order folios</p>
            <h2>All vendor orders</h2>
          </div>
          <span>{shownOrders.length} orders</span>
        </div>
        {orders === undefined || vendors === undefined ? (
          <TableSkeleton rows={5} />
        ) : shownOrders.length === 0 ? (
          <div className="document-empty">
            <p>No vendor orders yet</p>
            <span>
              Weekly drafts appear here automatically once you approve an event
              with dishes. Add a vendor to be ready.
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
                Add a vendor
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
                {shownOrders.map((order) => (
                  <tr key={order._id}>
                    <td>
                      <strong>{vendorOrderTitle(order)}</strong>
                    </td>
                    <td>{vendorName(order.vendorId)}</td>
                    <td>
                      {order.eventId
                        ? eventName(order.eventId)
                        : "Weekly / general"}
                    </td>
                    <td className="supply-number">
                      {formatMoneyExact(vendorOrderHeaderTotal(order, lines))}
                    </td>
                    <td>
                      <StatusChip status={String(order.status)} />
                    </td>
                    <td>
                      <Link
                        className="text-link"
                        to={`/inventory/orders/${order._id}`}
                        state={listOriginState(listOrigin)}
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

      <SeasonalDemandForecast />

      <VendorPriceListImport />

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
