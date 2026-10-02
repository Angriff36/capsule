import { useMemo, type ReactNode } from "react";
import {
  useListDelivery,
  useListEvent,
  useListIngredientDemand,
  useListInvoice,
  useListPayment,
  useListPrepTask,
  useListProposal,
  useListShift,
  useListVenue,
} from "../../lib/manifest-convex-react";
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

export function LiveReportData(props: LiveReportDataProps) {
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

function EventsData(props: LiveReportDataProps) {
  return <ResolvedData {...props} rows={useListEvent()} />;
}

function SalesData(props: LiveReportDataProps) {
  return <ResolvedData {...props} rows={useListProposal()} />;
}

function InventoryData(props: LiveReportDataProps) {
  return <ResolvedData {...props} rows={useListIngredientDemand()} />;
}

function ProductionData(props: LiveReportDataProps) {
  return <ResolvedData {...props} rows={useListPrepTask()} />;
}

function WorkforceData(props: LiveReportDataProps) {
  return <ResolvedData {...props} rows={useListShift()} />;
}

function LogisticsData(props: LiveReportDataProps) {
  return <ResolvedData {...props} rows={useListDelivery()} />;
}

function FinanceData(props: LiveReportDataProps) {
  return (
    <ResolvedData
      {...props}
      rows={useListInvoice()}
      paymentRows={useListPayment()}
    />
  );
}

type ResolvedDataProps = LiveReportDataProps & {
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
  const events = useListEvent();
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
