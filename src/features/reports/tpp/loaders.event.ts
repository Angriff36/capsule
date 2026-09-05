import { TPP_EVENT_REPORTS } from "./catalog.event";
import type { TppReportRequest } from "./types";

export const TPP_EVENT_LOADER_IDS = new Set(
  TPP_EVENT_REPORTS.map((report) => report.id),
);

export function eventLoaderArgs(request: TppReportRequest) {
  if (!TPP_EVENT_LOADER_IDS.has(request.reportId))
    throw new Error(`Unknown Event report: ${request.reportId}`);
  return { reportId: request.reportId, parameters: request.parameters };
}
