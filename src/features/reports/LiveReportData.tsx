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
} from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";
import type { ReportSubjectArea } from "./ReportCreateForm";
import { buildLiveReportModel } from "./liveReportBuilders";
import { canReadReportSubject } from "./liveReportSubjectAccess";
import type { LiveReportModel, ReportDateWindow } from "./liveReportModel";

interface LiveReportDataState {
  model: LiveReportModel | null;
  loading: boolean;
  sourceAvailable: boolean;
}

interface LiveReportDataProps {
  subject: ReportSubjectArea;
  dateWindow: ReportDateWindow;
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

function ResolvedData({
  rows,
  paymentRows,
  subject,
  dateWindow,
  children,
}: LiveReportDataProps & {
  rows: readonly unknown[] | undefined;
  paymentRows?: readonly unknown[] | undefined;
}) {
  const authStatus = useAuthStatus();
  const loading =
    rows === undefined ||
    authStatus === undefined ||
    (subject === "finance" && paymentRows === undefined);
  const sourceAvailable = loading
    ? false
    : canReadReportSubject(
        subject,
        String(authStatus?.role ?? ""),
        authStatus?.disabledCapabilities,
      );
  const model = useMemo(
    () =>
      !loading && sourceAvailable
        ? buildLiveReportModel(
            subject,
            subject === "finance"
              ? rowsWithActualPayments(rows ?? [], paymentRows ?? [])
              : (rows ?? []),
            dateWindow,
          )
        : null,
    [dateWindow, loading, paymentRows, rows, sourceAvailable, subject],
  );
  return children({
    loading,
    sourceAvailable,
    model,
  });
}
