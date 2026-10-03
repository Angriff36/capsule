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

function csvCell(value: string | number): string {
  if (typeof value === "number") return String(value);
  const safe = /^[=+\-@]/u.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/**
 * The month's roll-up as a spreadsheet file: the totals with their notes,
 * then every owned item with the share of the month it was out on events.
 * Money and shares are plain numbers so a spreadsheet can add them up.
 */
export function rentalReportCsv(report: RentalReport, month: string): string {
  const notes = new Map(
    rentalReportRows(report).map(([label, , hint]) => [label, hint]),
  );
  const rows: Array<Array<string | number>> = [
    ["Month", "Measure", "Amount", "Note"],
    [
      month,
      "Equipment charged to clients",
      report.equipmentCharged,
      notes.get("Equipment charged to clients") ?? "",
    ],
    [
      month,
      "Vendor rental cost",
      report.vendorCost,
      notes.get("Vendor rental cost") ?? "",
    ],
    [
      month,
      "Lost or damaged units",
      report.lostOrDamagedUnits,
      notes.get("Lost or damaged") ?? "",
    ],
    [month, "Lost or damaged cost", report.lossCost, ""],
    [
      month,
      "Charged back to client or vendor",
      report.recovered,
      notes.get("Charged back to client or vendor") ?? "",
    ],
    [
      month,
      "Our equipment in use (%)",
      report.averageUse == null ? "" : Math.round(report.averageUse * 100),
      report.averageUse == null ? "No owned items" : "",
    ],
    [],
    ["Month", "Item", "Out on events (%)", ""],
    ...report.itemUse.map((row) => [
      month,
      row.name,
      Math.round(row.share * 1000) / 10,
      "",
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function downloadRentalReport(report: RentalReport, month: string) {
  const blob = new Blob(["﻿", rentalReportCsv(report, month)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `rentals-and-equipment-${month}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
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
        <div className="flex flex-wrap items-end gap-2">
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
          <button
            type="button"
            className="btn btn-ghost"
            disabled={report == null}
            onClick={() => report && downloadRentalReport(report, month)}
          >
            Download
          </button>
        </div>
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
