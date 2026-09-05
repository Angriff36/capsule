import { TPP_FINANCIAL_REPORTS } from "./catalog.financial";
import type { TppReportRequest } from "./types";

export const TPP_FINANCIAL_LOADER_IDS = new Set(
  TPP_FINANCIAL_REPORTS.map((report) => report.id),
);

export function financialLoaderArgs(request: TppReportRequest) {
  if (!TPP_FINANCIAL_LOADER_IDS.has(request.reportId))
    throw new Error(`Unknown Financial report: ${request.reportId}`);
  return { reportId: request.reportId, parameters: request.parameters };
}
