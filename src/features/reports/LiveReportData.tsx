import { useMemo, useState, type ReactNode } from "react";
import { useListVenue } from "../../lib/manifest-convex-react";
import { useEventsById } from "../facilities/useEventsById";
import {
  useAllEventRowsOnRequest,
  useAllRowsOnRequest,
  useEventRowsInRange,
  usePaymentsForInvoices,
  useWindowRows,
  type PagedTable,
} from "../../lib/financeScopedQueries";
import { REPORT_DATE_FIELDS } from "./liveReportDates";
import { liveReportBounds } from "./liveReportBuilders";
import { useAuthStatus } from "../../lib/useAuthStatus";
import type { ReportSubjectArea } from "./ReportCreateForm";
import { buildLiveReportModel } from "./liveReportBuilders";
import { canReadReportSubject } from "./liveReportSubjectAccess";
import { rowsWithActualPayments } from "./liveReportPayments";
import { reportSourceAsOf } from "./reportSnapshot";
import type { LiveReportModel, ReportDateWindow } from "./liveReportModel";
import {
  applyReportEventFilters,
  hasEventFilter,
  reportFilterRange,
  type ReportFilterEvent,
  type ReportFilterLookups,
  type ReportFilters,
} from "./reportFilters";

export interface ReportLeftOut {
  /** Rows an event filter left out because they belong to no event. */
  noEvent: number;
  /** Rows the event filters left out. */
  filteredOut: number;
}

interface LiveReportDataState {
  model: LiveReportModel | null;
  loading: boolean;
  sourceAvailable: boolean;
  leftOut: ReportLeftOut;
  /** Newest change in the source records (reportSnapshot.ts). */
  sourceAsOf: number | null;
}

interface LiveReportDataProps {
  subject: ReportSubjectArea;
  dateWindow: ReportDateWindow;
  filters: ReportFilters;
  children: (state: LiveReportDataState) => ReactNode;
}

type Bounds = { from: number | null; to: number | null };

const OPEN_FROM = Number.MIN_SAFE_INTEGER;
const OPEN_TO = Number.MAX_SAFE_INTEGER;

/**
 * Only the rows dated in the report's period are read (the same dates and
 * bounds the builders count by). An all-time report reads every row, so it
 * waits until the user asks for it.
 */
export function LiveReportData(props: LiveReportDataProps) {
  // The period is fixed when the report opens, so the read does not move.
  const [now] = useState(() => Date.now());
  const [allTimeRequested, setAllTimeRequested] = useState(false);
  const bounds = liveReportBounds(
    props.dateWindow,
    reportFilterRange(props.filters),
    now,
  );
  if (bounds.from == null && bounds.to == null && !allTimeRequested) {
    return (
      <div className="document-empty">
        <p>This report covers all time.</p>
        <span>It adds up every record on file.</span>
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setAllTimeRequested(true)}
          >
            Run all-time report
          </button>
        </div>
      </div>
    );
  }
  return <SubjectData {...props} bounds={bounds} />;
}

type SubjectDataProps = LiveReportDataProps & { bounds: Bounds };

/** The subject's rows in the period, or all of them for an all-time report. */
function useReportRows(
  table: PagedTable,
  subject: ReportSubjectArea,
  bounds: Bounds,
) {
  const allTime = bounds.from == null && bounds.to == null;
  const windowed = useWindowRows(
    table,
    allTime
      ? null
      : {
          fields: [...REPORT_DATE_FIELDS[subject]],
          ranges: [
            { from: bounds.from ?? OPEN_FROM, to: bounds.to ?? OPEN_TO },
          ],
        },
  );
  const all = useAllRowsOnRequest(table, allTime);
  return allTime ? all : windowed;
}

function SubjectData(props: SubjectDataProps) {
  switch (props.subject) {
    case "events":
      return <EventsData {...props} />;
    case "sales":
      return <SalesData {...props} />;
    case "inventory":
      return <InventoryData {...props} />;
    case "production":
      return <ProductionData {...props} />;
    case "workforce":
      return <WorkforceData {...props} />;
    case "logistics":
      return <LogisticsData {...props} />;
    case "finance":
      return <FinanceData {...props} />;
  }
}

function EventsData(props: SubjectDataProps) {
  const { from, to } = props.bounds;
  const allTime = from == null && to == null;
  // Undated events come too: the report dates them by when they were made.
  const windowed = useEventRowsInRange(
    allTime ? null : { from: from ?? OPEN_FROM, to: to ?? OPEN_TO },
  );
  const all = useAllEventRowsOnRequest(allTime);
  return <ResolvedData {...props} rows={allTime ? all : windowed} />;
}

function SalesData(props: SubjectDataProps) {
  const rows = useReportRows("proposals", "sales", props.bounds);
  return <ResolvedData {...props} rows={rows} />;
}

function InventoryData(props: SubjectDataProps) {
  const rows = useReportRows("ingredientDemands", "inventory", props.bounds);
  return <ResolvedData {...props} rows={rows} />;
}

function ProductionData(props: SubjectDataProps) {
  const rows = useReportRows("prepTasks", "production", props.bounds);
  return <ResolvedData {...props} rows={rows} />;
}

function WorkforceData(props: SubjectDataProps) {
  const rows = useReportRows("shifts", "workforce", props.bounds);
  return <ResolvedData {...props} rows={rows} />;
}

function LogisticsData(props: SubjectDataProps) {
  const rows = useReportRows("deliveries", "logistics", props.bounds);
  return <ResolvedData {...props} rows={rows} />;
}

function FinanceData(props: SubjectDataProps) {
  const rows = useReportRows("invoices", "finance", props.bounds);
  // The payments of the invoices in the report only.
  const paymentRows = usePaymentsForInvoices(rows?.map((row) => row._id));
  return <ResolvedData {...props} rows={rows} paymentRows={paymentRows} />;
}

type ResolvedDataProps = SubjectDataProps & {
  rows: readonly unknown[] | undefined;
  paymentRows?: readonly unknown[] | undefined;
};

/** Events and venues load only when an event filter needs them. */
function ResolvedData(props: ResolvedDataProps) {
  return hasEventFilter(props.filters) ? (
    <WithEventLookups {...props} />
  ) : (
    <ResolvedModel {...props} lookups={null} lookupsLoading={false} />
  );
}

function WithEventLookups(props: ResolvedDataProps) {
  // Only the events the report's rows belong to.
  const events = useEventsById(
    props.rows?.map((row) => {
      const record = row as { _id?: unknown; eventId?: unknown };
      const id = props.subject === "events" ? record._id : record.eventId;
      return typeof id === "string" ? id : null;
    }),
  );
  const venues = useListVenue();
  const lookups = useMemo<ReportFilterLookups>(
    () => ({
      events: new Map(
        (events ?? []).map((event) => [
          String(event._id),
          event as unknown as ReportFilterEvent,
        ]),
      ),
      venueOnPremise: new Map(
        (venues ?? []).map((venue) => [String(venue._id), venue.onPremise]),
      ),
    }),
    [events, venues],
  );
  return (
    <ResolvedModel
      {...props}
      lookups={lookups}
      lookupsLoading={events === undefined || venues === undefined}
    />
  );
}

function ResolvedModel({
  rows,
  paymentRows,
  subject,
  dateWindow,
  filters,
  lookups,
  lookupsLoading,
  children,
}: ResolvedDataProps & {
  lookups: ReportFilterLookups | null;
  lookupsLoading: boolean;
}) {
  const authStatus = useAuthStatus();
  const loading =
    rows === undefined ||
    authStatus === undefined ||
    lookupsLoading ||
    (subject === "finance" && paymentRows === undefined);
  const sourceAvailable = loading
    ? false
    : canReadReportSubject(
        subject,
        String(authStatus?.role ?? ""),
        authStatus?.disabledCapabilities,
      );
  const result = useMemo(() => {
    if (loading || !sourceAvailable) return null;
    const subjectRows =
      subject === "finance"
        ? rowsWithActualPayments(rows ?? [], paymentRows ?? [])
        : (rows ?? []);
    const filtered = lookups
      ? applyReportEventFilters(subject, subjectRows, filters, lookups)
      : { rows: [...subjectRows], noEvent: 0, filteredOut: 0 };
    return {
      model: buildLiveReportModel(
        subject,
        filtered.rows,
        dateWindow,
        reportFilterRange(filters),
      ),
      leftOut: { noEvent: filtered.noEvent, filteredOut: filtered.filteredOut },
      sourceAsOf: reportSourceAsOf(
        rows,
        subject === "finance" ? paymentRows : undefined,
      ),
    };
  }, [
    dateWindow,
    filters,
    loading,
    lookups,
    paymentRows,
    rows,
    sourceAvailable,
    subject,
  ]);
  return children({
    loading,
    sourceAvailable,
    model: result?.model ?? null,
    leftOut: result?.leftOut ?? { noEvent: 0, filteredOut: 0 },
    sourceAsOf: result?.sourceAsOf ?? null,
  });
}
