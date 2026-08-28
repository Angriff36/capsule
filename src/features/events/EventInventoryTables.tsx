import { type ReactNode } from "react";
import { StatusChip } from "../../ui/primitives";

/** One ingredient-demand line for this event, with what is held against it. */
export type EventInventoryDemandRow = {
  readonly id: string;
  readonly ingredientName: string;
  readonly category: string;
  readonly required: number;
  readonly reserved: number;
  readonly unit: string;
  readonly status: string;
};

/** One inventory reservation (hold) standing against this event. */
export type EventInventoryHoldRow = {
  readonly id: string;
  readonly ingredientName: string;
  readonly location: string;
  readonly lot: string;
  readonly quantity: number;
  readonly status: string;
  readonly canIssue: boolean;
};

export const UNCATEGORISED = "Uncategorised";

/** Demand rows bucketed by ingredient category, groups sorted by size. */
export function groupDemandByCategory(
  rows: readonly EventInventoryDemandRow[],
): [string, EventInventoryDemandRow[]][] {
  const groups = new Map<string, EventInventoryDemandRow[]>();
  for (const row of rows) {
    const key = row.category || UNCATEGORISED;
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }
  return [...groups.entries()].sort(
    (left, right) =>
      right[1].length - left[1].length || left[0].localeCompare(right[0]),
  );
}

function CardHeader({
  title,
  trailing,
}: {
  title: string;
  trailing?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line bg-inset px-4 py-2.5">
      <h3 className="text-sm font-bold tracking-[0.06em] text-ink uppercase">
        {title}
      </h3>
      {trailing ? (
        <span className="font-mono text-xs text-ink-3">{trailing}</span>
      ) : null}
    </header>
  );
}

/** Demand grouped into one card per ingredient category. */
export function EventInventoryDemandGroups({
  rows,
}: {
  rows: readonly EventInventoryDemandRow[];
}) {
  const groups = groupDemandByCategory(rows);
  return (
    <>
      {groups.map(([category, groupRows]) => (
        <section
          key={category}
          className="card overflow-hidden"
          data-testid="event-inventory-demand-group"
        >
          <CardHeader
            title={category}
            trailing={`${groupRows.length} ingredient${groupRows.length === 1 ? "" : "s"}`}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-base">
              <thead>
                <tr>
                  <th className="th">Ingredient</th>
                  <th className="th text-right">Need</th>
                  <th className="th text-right">Reserved</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody>
                {groupRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-line last:border-b-0"
                  >
                    <td className="px-3 py-2 text-ink">{row.ingredientName}</td>
                    <td className="px-3 py-2 text-right font-mono text-ink-2 whitespace-nowrap">
                      {row.required} {row.unit}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono whitespace-nowrap ${
                        row.reserved >= row.required ? "text-ok" : "text-warn"
                      }`}
                    >
                      {row.reserved} {row.unit}
                    </td>
                    <td className="px-3 py-2">
                      <StatusChip status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );
}

/** Reservations standing against the event, with the issue action. */
export function EventInventoryHoldsTable({
  rows,
  busy,
  onIssue,
  lastIssue,
}: {
  rows: readonly EventInventoryHoldRow[];
  busy: boolean;
  onIssue: (reservationId: string) => void;
  lastIssue?: string | null;
}) {
  const active = rows.filter((row) => row.status === "active").length;
  return (
    <section className="card overflow-hidden">
      <CardHeader
        title="Event holds"
        trailing={`${active} active of ${rows.length}`}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-base" data-testid="event-inventory-holds">
          <thead>
            <tr>
              <th className="th">Ingredient</th>
              <th className="th">Location</th>
              <th className="th">Supplier lot</th>
              <th className="th text-right">Qty</th>
              <th className="th">Status</th>
              <th className="th text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-line last:border-b-0">
                <td className="px-3 py-2 text-ink">{row.ingredientName}</td>
                <td className="px-3 py-2 text-ink-2">{row.location}</td>
                <td className="px-3 py-2 font-mono text-xs text-ink-2">
                  {row.lot}
                </td>
                <td className="px-3 py-2 text-right font-mono text-ink">
                  {row.quantity}
                </td>
                <td className="px-3 py-2">
                  <StatusChip status={row.status} />
                </td>
                <td className="px-3 py-2 text-right">
                  {row.canIssue ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() => onIssue(row.id)}
                    >
                      Issue stock
                    </button>
                  ) : (
                    <span className="text-base text-ink-3">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {lastIssue ? (
        <p className="border-t border-line px-4 py-2.5 text-base text-ink-2">
          {lastIssue}
        </p>
      ) : null}
    </section>
  );
}
