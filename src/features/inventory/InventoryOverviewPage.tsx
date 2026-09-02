import { Link } from "react-router-dom";
import {
  useListIngredient,
  useListInventoryItem,
  useListVendor,
  useListVendorOrder,
  useListVendorOrderLine,
} from "../../lib/manifest-convex-react";
import { formatCount, formatDate, formatMoneyExact } from "../../lib/format";
import { PageHeader, Skeleton, StatusChip } from "../../ui/primitives";
import { InventoryWorkspaceNav } from "./InventoryWorkspaceNav";
import {
  catalogUnitForStockLine,
  isBelowReorder,
  stockLineLink,
} from "./stockLevels";
import { vendorOrderHeaderTotal } from "./vendorOrderHeaderTotal";
import { IngredientCatalogLabel } from "../kitchen/IngredientCatalogLabel";

// Vendor orders that left draft but have not fully arrived yet.
const AWAITING_RECEIPT = new Set([
  "submitted",
  "po_sent",
  "partially_received",
]);
const CLOSED_ORDER = new Set(["received", "cancelled"]);

type Urgency = "now" | "soon" | "watch";

type AttentionRow = {
  key: string;
  to: string;
  urgency: Urgency;
  urgencyLabel: string;
  title: string;
  ingredientId?: string;
  reason: string;
  status: string;
  actionLabel: string;
};

const URGENCY_CHIP: Record<Urgency, string> = {
  now: "border-danger/30 bg-danger-soft text-danger",
  soon: "border-warn/30 bg-warn-soft text-warn",
  watch: "border-info/30 bg-info-soft text-info",
};

export function InventoryOverviewPage() {
  const items = useListInventoryItem();
  const orders = useListVendorOrder();
  const lines = useListVendorOrderLine();
  const vendors = useListVendor();
  const ingredients = useListIngredient();

  const loading =
    items === undefined ||
    orders === undefined ||
    lines === undefined ||
    vendors === undefined ||
    ingredients === undefined;

  const activeItems = (items ?? []).filter((item) => item.deletedAt == null);
  const activeOrders = (orders ?? []).filter(
    (order) => order.deletedAt == null,
  );

  const ingredientName = (id: string) =>
    ingredients?.find((item) => item._id === id)?.name ?? "Unknown ingredient";
  const vendorName = (id: string) =>
    vendors?.find((item) => item._id === id)?.name ?? "Unknown vendor";

  const lowStockItems = activeItems
    .filter((item) =>
      isBelowReorder({
        quantityOnHand: item.quantityOnHand,
        reorderThreshold: item.reorderThreshold,
      }),
    )
    .sort(
      (a, b) =>
        Number(a.quantityOnHand) / Math.max(1, Number(a.reorderThreshold)) -
        Number(b.quantityOnHand) / Math.max(1, Number(b.reorderThreshold)),
    );
  const openOrders = activeOrders.filter(
    (order) => !CLOSED_ORDER.has(String(order.status)),
  );
  const awaitingReceipt = openOrders.filter((order) =>
    AWAITING_RECEIPT.has(String(order.status)),
  );
  const weeklyDrafts = activeOrders.filter(
    (order) =>
      String(order.status) === "draft" && order.sourceRangeStart != null,
  );
  const weeklyDraftTotal = weeklyDrafts.reduce(
    (sum, order) => sum + vendorOrderHeaderTotal(order, lines),
    0,
  );

  const attention: AttentionRow[] = [
    ...lowStockItems.map((item) => {
      const onHand = Number(item.quantityOnHand);
      const out = onHand <= 0;
      return {
        key: item._id,
        to: stockLineLink(item._id),
        urgency: (out ? "now" : "soon") as Urgency,
        urgencyLabel: out ? "Out of stock" : "Low stock",
        title: ingredientName(item.ingredientId),
        ingredientId: item.ingredientId,
        reason: `${onHand} on hand · reorder at ${Number(item.reorderThreshold)} ${catalogUnitForStockLine(item, ingredients ?? [])}`,
        status: "reorder now",
        actionLabel: "Open stock line",
      };
    }),
    ...awaitingReceipt.map((order) => ({
      key: order._id,
      to: `/inventory/orders/${order._id}`,
      urgency: (String(order.status) === "partially_received"
        ? "soon"
        : "watch") as Urgency,
      urgencyLabel:
        String(order.status) === "partially_received"
          ? "Partly received"
          : "Awaiting receipt",
      title: `${vendorName(order.vendorId)} order`,
      reason: `${formatMoneyExact(vendorOrderHeaderTotal(order, lines))}${
        order.sourceRangeStart != null
          ? ` · week of ${formatDate(order.sourceRangeStart)}`
          : ""
      }`,
      status: String(order.status),
      actionLabel: "Receive order",
    })),
  ].slice(0, 8);

  const metrics: {
    label: string;
    value: string;
    hint: string;
    tone: "neutral" | "warn" | "info" | "ok";
    to: string;
  }[] = [
    {
      label: "Below reorder",
      value: formatCount(lowStockItems.length),
      hint:
        lowStockItems.length > 0
          ? "Stock lines under their reorder point"
          : "All tracked stock is at or above reorder",
      tone: lowStockItems.length > 0 ? "warn" : "ok",
      to: "/inventory/stock",
    },
    {
      label: "Open vendor orders",
      value: formatCount(openOrders.length),
      hint: "Drafts plus orders sent to vendors",
      tone: "neutral",
      to: "/inventory/purchasing",
    },
    {
      label: "Awaiting receipt",
      value: formatCount(awaitingReceipt.length),
      hint: "Sent orders not fully received",
      tone: awaitingReceipt.length > 0 ? "info" : "neutral",
      to: "/inventory/purchasing",
    },
    {
      label: "Weekly draft total",
      value: formatMoneyExact(weeklyDraftTotal),
      hint: `${formatCount(weeklyDrafts.length)} weekly draft${weeklyDrafts.length === 1 ? "" : "s"} waiting to send`,
      tone: "neutral",
      to: "/inventory/purchasing",
    },
  ];

  const toneClass = {
    neutral: "border-line",
    warn: "border-warn/50",
    info: "border-info/50",
    ok: "border-ok/50",
  } as const;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventory"
        lead="What is low, on order, or waiting to be received."
        actions={
          <Link to="/inventory/purchasing" className="btn btn-primary">
            Review purchasing
          </Link>
        }
      />
      <InventoryWorkspaceNav />

      <dl className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Link
            key={metric.label}
            to={metric.to}
            className={`card block border-t-4 px-5 py-4 transition-shadow hover:shadow-[0_4px_16px_-4px_rgb(30_40_36/0.18)] ${toneClass[metric.tone]}`}
          >
            <dt className="text-sm font-semibold text-ink-2">{metric.label}</dt>
            <dd className="mt-1 text-3xl font-bold tracking-tight text-ink">
              {loading ? <Skeleton className="h-9 w-20" /> : metric.value}
            </dd>
            <dd className="mt-1 text-sm text-ink-2">{metric.hint}</dd>
          </Link>
        ))}
      </dl>

      <section className="card" aria-labelledby="attention-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 id="attention-title" className="text-lg font-semibold text-ink">
              Needs attention
              {!loading ? (
                <span className="ml-2 text-base font-medium text-ink-2">
                  {attention.length}
                </span>
              ) : null}
            </h2>
            <p className="mt-0.5 text-sm text-ink-2">
              Stock under its reorder point and vendor orders waiting to be
              received, most urgent first.
            </p>
          </div>
        </div>
        {loading ? (
          <div className="space-y-2 p-5">
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
            <Skeleton className="h-12" />
          </div>
        ) : attention.length === 0 ? (
          <div className="grid gap-4 px-5 py-8 sm:grid-cols-[auto_1fr] sm:items-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-ok-soft text-xl font-bold text-ok">
              ✓
            </div>
            <div>
              <p className="text-base font-semibold text-ink">
                Nothing needs attention right now
              </p>
              <p className="mt-0.5 text-sm text-ink-2">
                Every tracked stock line is at or above its reorder point and no
                vendor order is waiting on receipt. Good time to run a count or
                review next week's draft.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/inventory/counts" className="btn btn-secondary">
                  Start a count
                </Link>
                <Link to="/inventory/stock" className="btn btn-ghost">
                  Open stock book
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {attention.map((row) => (
              <li
                key={row.key}
                className="grid items-center gap-x-4 gap-y-2 px-5 py-3 md:grid-cols-[130px_minmax(0,1fr)_auto_auto]"
              >
                <span
                  className={`chip justify-self-start ${URGENCY_CHIP[row.urgency]}`}
                >
                  {row.urgencyLabel}
                </span>
                <span className="min-w-0">
                  <Link
                    to={row.to}
                    className="block truncate text-base font-semibold text-ink hover:underline"
                  >
                    {row.ingredientId ? (
                      <IngredientCatalogLabel
                        ingredientId={row.ingredientId}
                        ingredients={ingredients}
                      />
                    ) : (
                      row.title
                    )}
                  </Link>
                  <span className="block text-sm text-ink-2">{row.reason}</span>
                </span>
                <StatusChip status={row.status} />
                <Link
                  to={row.to}
                  className="btn btn-secondary btn-sm justify-self-start md:justify-self-end"
                >
                  {row.actionLabel}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
