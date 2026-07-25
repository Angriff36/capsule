// Shared filter hook for finance report pages
// Uses URLSearchParams for shareable, bookmarkable filter state

import { useSearchParams } from "react-router-dom";

const DEFAULT_GRANULARITY = "month";
const DEFAULT_PERIOD_COUNT = 12;

// Default date range: last 12 months
const defaultStartDate = (): string => {
  const date = new Date();
  date.setMonth(date.getMonth() - DEFAULT_PERIOD_COUNT);
  return date.toISOString().split("T")[0];
};

const defaultEndDate = (): string => {
  return new Date().toISOString().split("T")[0];
};

export interface FinanceReportFilters {
  // Date range
  rangeStart: string;
  rangeEnd: string;

  // Time granularity for grouping
  granularity: "week" | "month" | "quarter";

  // Breakdown dimension (for trends/comparison reports)
  breakdown: "event_type" | "client" | "service_line" | "venue" | "salesperson";

  // View mode (for multi-view reports)
  view: "event" | "client" | "period";

  // Target percentage (for food cost reports)
  target: number;

  // On/Off premise venue filter
  venuePremise: "on" | "off" | "all";

  // Event status filter
  status:
    | "all"
    | "planning"
    | "pending_approval"
    | "approved"
    | "executing"
    | "completed"
    | "cancelled";
}

export interface UseFinanceReportFiltersReturn {
  filters: FinanceReportFilters;
  setFilter: (key: keyof FinanceReportFilters, value: string | number) => void;
  clearFilters: () => void;
  hasActiveFilters: boolean;
}

export function useFinanceReportFilters(
  customDefaults?: Partial<FinanceReportFilters>,
): UseFinanceReportFiltersReturn {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: FinanceReportFilters = {
    rangeStart:
      searchParams.get("rangeStart") ||
      customDefaults?.rangeStart ||
      defaultStartDate(),
    rangeEnd:
      searchParams.get("rangeEnd") ||
      customDefaults?.rangeEnd ||
      defaultEndDate(),
    granularity:
      (searchParams.get(
        "granularity",
      ) as FinanceReportFilters["granularity"]) ||
      customDefaults?.granularity ||
      DEFAULT_GRANULARITY,
    breakdown:
      (searchParams.get("breakdown") as FinanceReportFilters["breakdown"]) ||
      customDefaults?.breakdown ||
      "event_type",
    view:
      (searchParams.get("view") as FinanceReportFilters["view"]) ||
      customDefaults?.view ||
      "event",
    target: Number(searchParams.get("target")) || customDefaults?.target || 30,
    venuePremise:
      (searchParams.get(
        "venuePremise",
      ) as FinanceReportFilters["venuePremise"]) ||
      customDefaults?.venuePremise ||
      "all",
    status:
      (searchParams.get("status") as FinanceReportFilters["status"]) ||
      customDefaults?.status ||
      "all",
  };

  const setFilter = (
    key: keyof FinanceReportFilters,
    value: string | number,
  ) => {
    const next = new URLSearchParams(searchParams);
    if (value === "" || value === "all" || value === undefined) {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
    setSearchParams(next, { replace: true });
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const hasActiveFilters = !!Array.from(searchParams.keys()).length;

  return {
    filters,
    setFilter,
    clearFilters,
    hasActiveFilters,
  };
}

// Helper to parse date range for queries
export function parseDateRange(
  rangeStart: string,
  rangeEnd: string,
): {
  start: Date;
  end: Date;
} {
  return {
    start: new Date(rangeStart),
    end: new Date(rangeEnd),
  };
}

// Helper to get period count based on granularity
export function getPeriodCount(granularity: string): number {
  const counts: Record<string, number> = {
    week: 52,
    month: 12,
    quarter: 4,
  };
  return counts[granularity] ?? 12;
}
