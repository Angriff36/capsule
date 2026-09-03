import { useMemo, type ReactNode } from "react";
import {
  useListDelivery,
  useListEvent,
  useListIngredientDemand,
  useListInvoice,
  useListPrepTask,
  useListProposal,
  useListShift,
} from "../../lib/manifest-convex-react";
import { useAuthStatus } from "../../lib/useAuthStatus";
import { resolveManifestPolicies } from "../admin/rolePermissionAudit";
import type { ReportSubjectArea } from "./ReportCreateForm";
import { buildLiveReportModel } from "./liveReportBuilders";
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
  return <ResolvedData {...props} rows={useListInvoice()} />;
}

function ResolvedData({
  rows,
  subject,
  dateWindow,
  children,
}: LiveReportDataProps & { rows: readonly unknown[] | undefined }) {
  const authStatus = useAuthStatus();
  const loading = rows === undefined || authStatus === undefined;
  const sourceAvailable = loading
    ? false
    : canReadSubject(
        subject,
        String(authStatus?.role ?? ""),
        authStatus?.disabledCapabilities,
      );
  const model = useMemo(
    () =>
      !loading && sourceAvailable
        ? buildLiveReportModel(subject, rows ?? [], dateWindow)
        : null,
    [dateWindow, loading, rows, sourceAvailable, subject],
  );
  return children({
    loading,
    sourceAvailable,
    model,
  });
}

function canReadSubject(
  subject: ReportSubjectArea,
  role: string,
  disabledCapabilities: readonly string[] | undefined,
): boolean {
  if (disabledCapabilities?.includes(subject)) return false;
  const permissions = new Set(resolveManifestPolicies(role));
  if (subject === "events") {
    return permissions.has("eventAccess") || permissions.has("salesAccess");
  }
  if (subject === "sales") return permissions.has("salesAccess");
  if (subject === "inventory") {
    return (
      permissions.has("inventoryAccess") || permissions.has("manageAccess")
    );
  }
  if (subject === "production") {
    return permissions.has("kitchenAccess") || permissions.has("manageAccess");
  }
  if (subject === "workforce") return permissions.has("workforceAccess");
  if (subject === "logistics") {
    return (
      permissions.has("logisticsAccess") || permissions.has("manageAccess")
    );
  }
  return permissions.has("financeAccess") || permissions.has("manageAccess");
}
