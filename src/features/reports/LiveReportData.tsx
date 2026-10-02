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

/**
 * Project the Payment ledger onto invoices before the generic builder runs.
 * PaymentSettled is the only cash event: pending/processing/failed payments
 * have not been received, while refunded payments no longer count. The
 * invoice.amountPaid field is a command-maintained balance, useful as
 * evidence, but the live finance report's Collected KPI is sourced from these
 * payment rows rather than inferred from Invoice.total - Invoice.amountDue.
 */
function rowsWithActualPayments(
  invoiceRows: readonly unknown[],
  paymentRows: readonly unknown[],
): readonly unknown[] {
  const paidByInvoice = new Map<string, number>();
  for (const payment of paymentRows) {
    if (!isRecord(payment) || payment.deletedAt != null) continue;
    if (payment.status !== "completed") continue;
    const invoiceId = String(payment.invoiceId ?? "");
    if (!invoiceId) continue;
    paidByInvoice.set(
      invoiceId,
      (paidByInvoice.get(invoiceId) ?? 0) + numberValue(payment.amount),
    );
  }
  return invoiceRows.map((invoice) => {
    if (!isRecord(invoice)) return invoice;
    const invoiceId = String(invoice._id ?? invoice.id ?? "");
    return {
      ...invoice,
      amountPaid: paidByInvoice.get(invoiceId) ?? 0,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function numberValue(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
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
  });
}
