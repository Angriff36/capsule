import type { ReportSubjectArea } from "./ReportCreateForm";
import { REPORT_DATE_OF } from "./liveReportDates";

type SourceRow = Record<string, unknown>;

/** Rows a live report did not count, by reason (PR11-06). */
export interface ReportPeriodLeftOut {
  /** Deleted records. */
  deleted: number;
  /** Dated outside the chosen period. */
  outsidePeriod: number;
  /** No date at all, so a bounded period cannot place them. */
  noDate: number;
  /** Counted rows that share their number with another counted row. */
  repeatedNumbers: number;
}

export const NO_LEFT_OUT: ReportPeriodLeftOut = {
  deleted: 0,
  outsidePeriod: 0,
  noDate: 0,
  repeatedNumbers: 0,
};

/** The number a person calls the record by, where the subject has one. */
const NUMBER_KEY: Partial<Record<ReportSubjectArea, string>> = {
  events: "eventNumber",
  sales: "proposalNumber",
  finance: "invoiceNumber",
};

export function countLeftOut(
  subject: ReportSubjectArea,
  rows: readonly SourceRow[],
  from: number | null,
  to: number | null,
): ReportPeriodLeftOut {
  const dateOf = REPORT_DATE_OF[subject];
  const bounded = from != null || to != null;
  const counts = { ...NO_LEFT_OUT };
  const numbers = new Map<string, number>();
  for (const row of rows) {
    if (row.deletedAt != null) {
      counts.deleted += 1;
      continue;
    }
    const when = dateOf(row);
    if (when == null) {
      if (bounded) {
        counts.noDate += 1;
        continue;
      }
    } else if ((from != null && when < from) || (to != null && when >= to)) {
      counts.outsidePeriod += 1;
      continue;
    }
    const key = NUMBER_KEY[subject];
    const number = key ? String(row[key] ?? "").trim() : "";
    if (number) numbers.set(number, (numbers.get(number) ?? 0) + 1);
  }
  for (const count of numbers.values()) {
    if (count > 1) counts.repeatedNumbers += count;
  }
  return counts;
}
