import type { ReactNode } from "react";
import { StatCard, type StatCardProps } from "@/ui/charts/StatCard";
import { TableDisplay } from "@/ui/charts/TableDisplay";
import { formatMoney } from "@/lib/format";
import { NOT_KNOWN } from "../dashboardRecordSets";

/** The report's look, kept from the old sales report: a titled section with
 * the dates it covers, rows of four figures, notes and dense tables. */

export function ReportSection({
  title,
  period,
  children,
}: {
  title: string;
  period: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-6 first:mt-0">
      <h2 className="border-b border-line pb-1.5 text-base font-semibold text-ink">
        {title}{" "}
        <span className="text-xs font-normal text-ink-3">({period})</span>
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

export function SubHeading({
  title,
  period,
}: {
  title: string;
  period?: string;
}) {
  return (
    <h3 className="text-sm font-semibold text-ink-2">
      {title}
      {period ? (
        <span className="ml-2 text-xs font-normal text-ink-3">{period}</span>
      ) : null}
    </h3>
  );
}

export interface Figure {
  readonly title: string;
  readonly value: string;
  readonly detail: string;
  readonly period: string;
  readonly tone?: StatCardProps["tone"];
}

/** A row of figures: two across on a phone, four on a wide screen. */
export function FigureRow({ figures }: { figures: readonly Figure[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {figures.map((figure) => (
        <StatCard
          key={figure.title}
          title={figure.title}
          tone={figure.tone ?? "ink"}
          size="compact"
          main={{ value: figure.value }}
          rows={[
            { label: figure.detail, value: "" },
            { label: figure.period, value: "" },
          ]}
        />
      ))}
    </div>
  );
}

/** One big annual figure with how it was worked out. */
export function PaceBox({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-sm border border-line bg-inset px-4 py-3">
      <p className="text-xs font-semibold text-ink-2">{title}</p>
      <p className="font-mono text-2xl font-semibold text-ink">{value}</p>
      <p className="text-xs text-ink-3">{detail}</p>
    </div>
  );
}

export interface Signal {
  readonly title: string;
  readonly value: string;
  readonly detail: string;
  readonly good: boolean | null;
}

/** The four "how are we doing" signals under the health check. */
export function SignalStrip({ signals }: { signals: readonly Signal[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {signals.map((signal) => (
        <div
          key={signal.title}
          className={`rounded-sm border px-3 py-2 ${
            signal.good == null
              ? "border-line bg-inset"
              : signal.good
                ? "border-ok/40 bg-ok-soft"
                : "border-warn/40 bg-warn-soft"
          }`}
        >
          <p className="text-xs font-semibold text-ink-2">{signal.title}</p>
          <p className="font-mono text-lg font-semibold text-ink">
            {signal.value}
          </p>
          <p className="text-xs text-ink-2">{signal.detail}</p>
        </div>
      ))}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-sm border-l-2 border-brand bg-inset px-3 py-2 text-xs text-ink-2">
      {children}
    </p>
  );
}

/** A table whose cells are already worded; the first column is the name. */
export function FigureTable({
  headers,
  rows,
}: {
  headers: readonly string[];
  rows: readonly (readonly string[])[];
}) {
  return (
    <TableDisplay
      columns={headers.map((header, index) => ({
        key: String(index),
        header,
        align: index === 0 ? "left" : "right",
      }))}
      data={rows.map((row) =>
        Object.fromEntries(row.map((cell, index) => [String(index), cell])),
      )}
    />
  );
}

export const money = (value: number | null | undefined) =>
  value == null ? NOT_KNOWN : formatMoney(value);

export const count = (value: number) => value.toLocaleString("en-US");

/** "1 event", "3 events". */
export const plural = (value: number, noun: string) =>
  `${count(value)} ${noun}${value === 1 ? "" : "s"}`;

export const percent = (value: number | null) =>
  value == null ? NOT_KNOWN : `${value.toFixed(1)}%`;

/** +12.3% / -4.0%, or "—" with nothing to compare. */
export const change = (value: number | null) =>
  value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

export const dayText = (time: number | Date) =>
  new Date(time).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
