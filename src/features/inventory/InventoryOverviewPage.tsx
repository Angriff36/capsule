import { Link } from "react-router-dom";
import {
  useListIngredient,
  useListInventoryItem,
  useListVendor,
  useListVendorOrder,
  useListVendorOrderLine,
} from "../../lib/manifest-convex-react";
import { formatCount, formatDate, formatMoneyExact } from "../../lib/format";
import {
  EmptyState,
  PageHeader,
  Section,
  Skeleton,
  StatusChip,
  TableSkeleton,
} from "../../ui/primitives";
import { InventoryWorkspaceNav } from "./InventoryWorkspaceNav";
import {
  catalogUnitForStockLine,
  isBelowReorder,
  stockLineLink,
} from "./stockLevels";
import { vendorOrderHeaderTotal } from "./vendorOrderHeaderTotal";

// Vendor orders that left draft but have not fully arrived yet.
const AWAITING_RECEIPT = new Set([
  "submitted",
  "po_sent",
  "partially_received",
]);
const CLOSED_ORDER = new Set(["received", "cancelled"]);

const QUICK_LINKS = [
  {
    label: "Demand ledger",
    path: "/inventory/demand",
    description:
      "Event-scoped ingredient requirements flowing into purchasing.",
  },
  {
    label: "Stock book",
    path: "/inventory/stock",
    description:
      "Stock by ingredient and location, reorder alerts, reservations.",
  },
  {
    label: "Counts",
    path: "/inventory/counts",
    description: "Physical count sessions reconciled against the book.",
  },
  {
    label: "Audit log",
    path: "/inventory/audit",
    description: "Every stock movement and where it came from.",
  },
  {
    label: "Waste",
    path: "/inventory/waste",
    description: "Spoilage and loss records with reasons and cost impact.",
  },
  {
    label: "Lot trace",
    path: "/inventory/traceability",
    description: "Supplier lots traced from receipt through consumption.",
  },
  {
    label: "Purchasing",
    path: "/inventory/purchasing",
    description: "Weekly drafts, purchase needs, and vendor order folios.",
  },
  {
    label: "Contracts",
    path: "/inventory/contracts",
    description: "Vendor agreements and negotiated pricing terms.",
  },
] as const;

type AttentionRow = {
  key: string;
  to: string;
  kind: "Low stock" | "On order";
  title: string;
  detail: string;
  status: string;
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
    ...lowStockItems.map((item) => ({
      key: item._id,
      to: stockLineLink(item._id),
      kind: "Low stock" as const,
      title: ingredientName(item.ingredientId),
      detail: `${Number(item.quantityOnHand)} of reorder ${Number(item.reorderThreshold)} ${catalogUnitForStockLine(item, ingredients ?? [])} on hand`,
      status: "reorder now",
    })),
    ...awaitingReceipt.map((order) => ({
      key: order._id,
      to: `/inventory/orders/${order._id}`,
      kind: "On order" as const,
      title: `${vendorName(order.vendorId)} order`,
      detail: `${formatMoneyExact(vendorOrderHeaderTotal(order, lines))}${
        order.sourceRangeStart != null
          ? ` · week of ${formatDate(order.sourceRangeStart)}`
          : ""
      }`,
      status: String(order.status),
    })),
  ].slice(0, 8);

  const kpis = [
    { label: "Below reorder", value: formatCount(lowStockItems.length) },
    { label: "Open vendor orders", value: formatCount(openOrders.length) },
    { label: "Awaiting receipt", value: formatCount(awaitingReceipt.length) },
    { label: "Weekly draft total", value: formatMoneyExact(weeklyDraftTotal) },
  ];

  return (
    <div className="operations-stage supply-stage">
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

      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="bg-panel px-3 py-2">
            <dt className="text-xs font-semibold text-ink-2">{kpi.label}</dt>
            <dd className="mt-0.5 text-xl font-semibold text-ink">
              {loading ? <Skeleton className="h-7 w-16" /> : kpi.value}
            </dd>
          </div>
        ))}
      </dl>

      <Section
        title="Needs attention"
        count={loading ? undefined : attention.length}
      >
        {loading ? (
          <TableSkeleton rows={4} />
        ) : attention.length === 0 ? (
          <EmptyState
            title="Nothing needs attention"
            hint="Tracked stock is at or above its reorder point and no vendor orders are waiting on receipt."
            action={
              <>
                <Link to="/inventory/stock" className="btn btn-ghost btn-sm">
                  Open stock book
                </Link>
                <Link
                  to="/inventory/purchasing"
                  className="btn btn-primary btn-sm"
                >
                  Review purchasing
                </Link>
              </>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Type</th>
                  <th className="th w-full">Item</th>
                  <th className="th">Detail</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {attention.map((row) => (
                  <tr key={row.key} className="hover:bg-inset">
                    <td className="td text-ink-2">{row.kind}</td>
                    <td className="td w-full max-w-0 truncate">
                      <Link
                        to={row.to}
                        className="font-semibold text-ink hover:underline"
                      >
                        {row.title}
                      </Link>
                    </td>
                    <td className="td text-ink-2">{row.detail}</td>
                    <td className="td">
                      <StatusChip status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Workspace">
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_LINKS.map((link) => (
            <li key={link.path} className="border-b border-line sm:border-r">
              <Link to={link.path} className="block px-3 py-2 hover:bg-inset">
                <span className="block text-sm font-semibold text-ink">
                  {link.label}
                </span>
                <span className="block text-xs text-ink-2">
                  {link.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}
