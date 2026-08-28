import { type ReactNode } from "react";
import type { EventStockShortage } from "./EventStockReservationCoordinator";
import {
  groupDemandByCategory,
  type EventInventoryDemandRow,
  type EventInventoryHoldRow,
} from "./EventInventoryTables";

function AsideCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="card px-3.5 py-3">
      <h3 className="mb-2.5 text-sm font-bold tracking-[0.06em] text-ink uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}

function StatRow({
  label,
  value,
  tone = "text-ink",
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="text-base text-ink-3">{label}</span>
      <span className={`font-mono text-base font-semibold ${tone}`}>
        {value}
      </span>
    </div>
  );
}

/** Right-hand rail for the Inventory tab: demand counts, cover, shortages. */
export function EventInventorySummaryAside({
  demandRows,
  holdRows,
  shortages,
  ingredientName,
}: {
  demandRows: readonly EventInventoryDemandRow[];
  holdRows: readonly EventInventoryHoldRow[];
  shortages: readonly EventStockShortage[];
  ingredientName: (ingredientId: string) => string;
}) {
  const fulfilled = demandRows.filter(
    (row) => row.status === "fulfilled",
  ).length;
  const confirmed = demandRows.filter(
    (row) => row.status === "confirmed",
  ).length;
  const covered = demandRows.filter(
    (row) => row.required > 0 && row.reserved >= row.required,
  ).length;
  const activeHolds = holdRows.filter((row) => row.status === "active").length;
  const consumedHolds = holdRows.filter(
    (row) => row.status === "consumed",
  ).length;
  const coveredPct =
    demandRows.length === 0
      ? 0
      : Math.round((covered / demandRows.length) * 100);
  const categories = groupDemandByCategory(demandRows);

  return (
    <div className="flex flex-col gap-3" data-testid="event-inventory-aside">
      <AsideCard title="Inventory status">
        <div className="divide-y divide-line">
          <div className="pb-1">
            <StatRow label="Demand lines" value={demandRows.length} />
            <StatRow
              label="Confirmed"
              value={confirmed}
              tone={confirmed > 0 ? "text-info" : "text-ink-3"}
            />
            <StatRow
              label="Fulfilled"
              value={fulfilled}
              tone={fulfilled > 0 ? "text-ok" : "text-ink-3"}
            />
          </div>
          <div className="pt-1">
            <StatRow label="Active holds" value={activeHolds} />
            <StatRow
              label="Issued"
              value={consumedHolds}
              tone={consumedHolds > 0 ? "text-ok" : "text-ink-3"}
            />
          </div>
        </div>
      </AsideCard>

      {demandRows.length > 0 ? (
        <AsideCard title="Cover from stock">
          <p className="flex items-baseline justify-between gap-3">
            <span className="text-base text-ink-3">Lines fully held</span>
            <span className="font-mono text-base font-semibold text-ink">
              {covered}/{demandRows.length}
            </span>
          </p>
          <span
            className="mt-2 block h-1.5 overflow-hidden rounded-full bg-line"
            aria-hidden="true"
          >
            <span
              className="block h-full rounded-full bg-ok"
              style={{ width: `${coveredPct}%` }}
            />
          </span>
          <p className="mt-1.5 font-mono text-xs text-ink-3">
            {coveredPct}% of demand covered by active holds
          </p>
        </AsideCard>
      ) : null}

      {categories.length > 0 ? (
        <AsideCard title="By category">
          <ul className="flex flex-col gap-1.5">
            {categories.map(([category, rows]) => (
              <li
                key={category}
                className="flex items-center justify-between gap-3 rounded-sm border border-line px-2.5 py-1.5"
              >
                <span className="min-w-0 truncate text-base text-ink">
                  {category}
                </span>
                <span className="font-mono text-xs font-semibold text-ink-2">
                  {rows.length}
                </span>
              </li>
            ))}
          </ul>
        </AsideCard>
      ) : null}

      {shortages.length > 0 ? (
        <section className="rounded-md border border-danger/40 bg-danger-soft px-3.5 py-3">
          <h3 className="text-sm font-bold tracking-[0.06em] text-danger uppercase">
            Shortages
          </h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {shortages.map((row) => (
              <li
                key={`${row.ingredientId}:${row.unit}`}
                className="text-base text-ink-2"
              >
                <span className="font-medium text-ink">
                  {ingredientName(row.ingredientId)}
                </span>
                <p className="font-mono text-xs text-danger">
                  short {row.shortageQuantity} {row.unit} · need{" "}
                  {row.requiredQuantity} · held {row.reservedQuantity}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
