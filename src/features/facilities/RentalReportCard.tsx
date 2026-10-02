import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "../../lib/api";
import {
  useListEquipment,
  useListEquipmentIssue,
  useListEquipmentReservation,
  useListRentalOrderLine,
} from "../../lib/manifest-convex-react";
import { useEventsById, useEventsInRange } from "./useEventsById";
import { formatMoneyExact } from "../../lib/format";
import { rentalReport, type RentalReport } from "../logistics/rentalReporting";

const monthValue = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

function monthRange(value: string): [number, number] {
  const [year, month] = value.split("-").map(Number);
  return [
    new Date(year, month - 1, 1).getTime(),
    new Date(year, month, 1).getTime(),
  ];
}

const percent = (share: number) => `${Math.round(share * 100)}%`;

/** Rows to print for one month's rental and equipment roll-up. */
export function rentalReportRows(
  report: RentalReport,
): Array<[string, string, string]> {
  return [
    [
      "Equipment charged to clients",
      formatMoneyExact(report.equipmentCharged),
      [
        report.soldEvents > 0
          ? `${report.soldEvents} event(s) at the price the client accepted; others at list price.`
          : "At list price for what is held.",
        report.unpricedHolds > 0
          ? `${report.unpricedHolds} hold(s) on items with no client price - not counted.`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    ],
    [
      "Vendor rental cost",
      formatMoneyExact(report.vendorCost),
      `${report.vendorLines} rental line(s) from vendors.`,
    ],
    [
      "Lost or damaged",
      `${report.lostOrDamagedUnits} unit(s), ${formatMoneyExact(report.lossCost)}`,
      report.lossCostUnknown > 0
        ? `${report.lossCostUnknown} problem(s) with no cost on file - not counted.`
        : "Every problem has a cost on file.",
    ],
    [
      "Charged back to client or vendor",
      formatMoneyExact(report.recovered),
      "Lost or damaged items someone else pays for.",
    ],
    [
      "Our equipment in use",
      report.averageUse == null ? "No owned items" : percent(report.averageUse),
      report.busiest.length > 0
        ? `Busiest: ${report.busiest
            .slice(0, 3)
            .map((row) => `${row.name} ${percent(row.share)}`)
            .join(", ")}`
        : "Share of the month each item was out on events.",
    ],
  ];
}

/** Rental revenue, vendor cost, loss and damage, and equipment use by month. */
export function RentalReportCard() {
  const equipment = useListEquipment();
  const holds = useListEquipmentReservation();
  const lines = useListRentalOrderLine();
  const issues = useListEquipmentIssue();
  const [month, setMonth] = useState(() => monthValue(new Date()));
  const [periodStart, periodEnd] = monthRange(month);
  // Events that start in the month, plus the events of holds that overlap the
  // month (a hold can reach into the month from an event that started before).
  const monthEvents = useEventsInRange({ from: periodStart, to: periodEnd });
  const holdEventIds = useMemo(
    () =>
      holds
        ?.filter(
          (hold) =>
            hold.startsAt != null &&
            hold.endsAt != null &&
            hold.startsAt < periodEnd &&
            hold.endsAt > periodStart,
        )
        .map((hold) => String(hold.eventId)),
    [holds, periodStart, periodEnd],
  );
  const holdEvents = useEventsById(holdEventIds);
  const events = useMemo(
    () =>
      monthEvents && holdEvents ? [...monthEvents, ...holdEvents] : undefined,
    [monthEvents, holdEvents],
  );
  const sales = useQuery(api.rentalSales.acceptedRentalSales, {
    periodStart,
    periodEnd,
  });
  const report = useMemo(() => {
    if (!events || !equipment || !holds || !lines || !issues || !sales)
      return null;
    const [start, end] = monthRange(month);
    return rentalReport(
      {
        events: events.map((row) => ({ ...row, _id: String(row._id) })),
        equipment: equipment.map((row) => ({
          ...row,
          _id: String(row._id),
          quantity: Number(row.quantity),
        })),
        holds: holds.map((row) => ({
          ...row,
          equipmentId: String(row.equipmentId),
          eventId: String(row.eventId),
          quantity: Number(row.quantity),
        })),
        lines: lines.map((row) => ({
          ...row,
          eventId: String(row.eventId),
          vendorCost: Number(row.vendorCost),
        })),
        issues: issues.map((row) => ({
          ...row,
          quantity: Number(row.quantity),
        })),
        sales,
      },
      start,
      end,
    );
  }, [events, equipment, holds, lines, issues, sales, month]);

  return (
    <section className="card p-5" data-testid="rental-report-card">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold text-ink">
          Rentals and equipment
        </h2>
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
      {report == null ? (
        <p className="mt-3 text-sm text-ink-3">Loading...</p>
      ) : (
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {rentalReportRows(report).map(([label, value, hint]) => (
            <div key={label}>
              <dt className="text-sm text-ink-2">{label}</dt>
              <dd className="text-base font-semibold text-ink">{value}</dd>
              <dd className="text-xs text-ink-3">{hint}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
