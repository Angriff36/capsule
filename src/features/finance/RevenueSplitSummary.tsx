import { useMemo, useState } from "react";
import { formatMoneyExact } from "../../lib/format";
import {
  revenueSplitMeasures,
  type SplitEvent,
  type SplitRow,
} from "./revenueSplitMeasures";

const monthValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

function monthRange(value: string): [number, number] {
  const [year, month] = value.split("-").map(Number);
  return [
    new Date(year, month - 1, 1).getTime(),
    new Date(year, month, 1).getTime(),
  ];
}

/** Gross, venue-produced, splits, retained and not-split revenue for a month. */
export function RevenueSplitSummary({
  events,
  splits,
}: {
  readonly events: readonly SplitEvent[];
  readonly splits: readonly SplitRow[];
}) {
  const [month, setMonth] = useState(() => monthValue(new Date()));
  const measures = useMemo(() => {
    const [start, end] = monthRange(month);
    return revenueSplitMeasures(events, splits, start, end);
  }, [events, splits, month]);
  const rows: Array<[string, number, string]> = [
    [
      "Booked revenue",
      measures.gross,
      "Quoted revenue of the month's events, cancelled ones out.",
    ],
    [
      "Venue-produced revenue",
      measures.venueProduced,
      "Revenue of events that carry a venue commission.",
    ],
    ["Splits handed out", measures.splits, "Approved and applied splits."],
    [
      "of which venue commission",
      measures.venueCommission,
      "The venue commission part of the splits.",
    ],
    ["Revenue kept", measures.retained, "Booked revenue less the splits."],
    ["Not split", measures.unsplit, "Revenue of events with no split at all."],
    [
      "Splits waiting for approval",
      measures.waiting,
      "Drafts and splits waiting for approval; not counted above.",
    ],
  ];
  return (
    <section className="card p-5" data-testid="revenue-split-summary">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">Revenue and splits</h2>
          <p className="text-sm text-ink-3">
            {measures.eventCount} event{measures.eventCount === 1 ? "" : "s"} in
            this month.
          </p>
        </div>
        <label className="field-label">
          Month
          <input
            type="month"
            className="input"
            value={month}
            onChange={(event) =>
              event.target.value && setMonth(event.target.value)
            }
          />
        </label>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value, hint]) => (
          <div key={label}>
            <dt className="text-sm text-ink-2">{label}</dt>
            <dd className="text-base font-semibold text-ink">
              {formatMoneyExact(value)}
            </dd>
            <dd className="text-xs text-ink-3">{hint}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
