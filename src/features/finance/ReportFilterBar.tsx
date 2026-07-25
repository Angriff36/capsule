// Reusable filter bar component for finance reports
import {
  useFinanceReportFilters,
  type FinanceReportFilters,
} from "./useFinanceReportFilters";

interface ReportFilterBarProps {
  filters?: Partial<FinanceReportFilters>;
  showGranularity?: boolean;
  showBreakdown?: boolean;
  showVenuePremise?: boolean;
  showStatus?: boolean;
  showTarget?: boolean;
  showView?: boolean;
}

export function ReportFilterBar({
  filters: customDefaults,
  showGranularity = true,
  showBreakdown = false,
  showVenuePremise = false,
  showStatus = false,
  showTarget = false,
  showView = false,
}: ReportFilterBarProps) {
  const { filters, setFilter, clearFilters, hasActiveFilters } =
    useFinanceReportFilters(customDefaults);

  return (
    <div className="mb-4 rounded-md bg-gray-50 p-4">
      <div className="flex flex-wrap items-center gap-4">
        {/* Date Range */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">
            Date Range:
          </label>
          <input
            type="date"
            value={filters.rangeStart}
            onChange={(e) => setFilter("rangeStart", e.target.value)}
            className="rounded border-gray-300 text-sm"
          />
          <span className="text-gray-500">to</span>
          <input
            type="date"
            value={filters.rangeEnd}
            onChange={(e) => setFilter("rangeEnd", e.target.value)}
            className="rounded border-gray-300 text-sm"
          />
        </div>

        {/* Granularity */}
        {showGranularity && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">By:</label>
            <select
              value={filters.granularity}
              onChange={(e) =>
                setFilter(
                  "granularity",
                  e.target.value as "week" | "month" | "quarter",
                )
              }
              className="rounded border-gray-300 text-sm"
            >
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="quarter">Quarter</option>
            </select>
          </div>
        )}

        {/* Breakdown */}
        {showBreakdown && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">
              Breakdown:
            </label>
            <select
              value={filters.breakdown}
              onChange={(e) =>
                setFilter(
                  "breakdown",
                  e.target.value as FinanceReportFilters["breakdown"],
                )
              }
              className="rounded border-gray-300 text-sm"
            >
              <option value="event_type">Event Type</option>
              <option value="client">Client</option>
              <option value="service_line">Service Line</option>
              <option value="venue">Venue</option>
              <option value="salesperson">Salesperson</option>
            </select>
          </div>
        )}

        {/* View */}
        {showView && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">View:</label>
            <select
              value={filters.view}
              onChange={(e) =>
                setFilter(
                  "view",
                  e.target.value as FinanceReportFilters["view"],
                )
              }
              className="rounded border-gray-300 text-sm"
            >
              <option value="event">By Event</option>
              <option value="client">By Client</option>
              <option value="period">By Period</option>
            </select>
          </div>
        )}

        {/* Venue Premise */}
        {showVenuePremise && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Venue:</label>
            <select
              value={filters.venuePremise}
              onChange={(e) =>
                setFilter(
                  "venuePremise",
                  e.target.value as "on" | "off" | "all",
                )
              }
              className="rounded border-gray-300 text-sm"
            >
              <option value="all">All</option>
              <option value="on">On-Premise</option>
              <option value="off">Off-Premise</option>
            </select>
          </div>
        )}

        {/* Status */}
        {showStatus && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Status:</label>
            <select
              value={filters.status}
              onChange={(e) =>
                setFilter(
                  "status",
                  e.target.value as FinanceReportFilters["status"],
                )
              }
              className="rounded border-gray-300 text-sm"
            >
              <option value="all">All</option>
              <option value="planning">Planning</option>
              <option value="pending_approval">Pending Approval</option>
              <option value="approved">Approved</option>
              <option value="executing">Executing</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>
        )}

        {/* Target */}
        {showTarget && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">
              Target %:
            </label>
            <input
              type="number"
              min="1"
              max="100"
              value={filters.target}
              onChange={(e) => setFilter("target", Number(e.target.value))}
              className="w-20 rounded border-gray-300 text-sm"
            />
          </div>
        )}

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button
            onClick={() => clearFilters()}
            className="ml-auto text-sm text-blue-600 hover:text-blue-800"
          >
            Clear Filters
          </button>
        )}
      </div>
    </div>
  );
}
