import type { TppReportId, TppReportRequest } from "./types";

export const TPP_GENERAL_LOADER_IDS = new Set<TppReportId>([
  "contact-task-notes",
  "contact-lead-opportunities",
  "events-pending-final-confirmation",
  "inventory-in-stock",
  "mailing-labels",
  "menu-item-listing-report",
  "menu-item-packages",
  "menu-item-popularity",
  "post-event-notes",
  "staff-address-phone-list",
  "vendor-phone-list",
  "venue-detail",
  "venue-listing",
]);

export function generalLoaderArgs(request: TppReportRequest) {
  if (!TPP_GENERAL_LOADER_IDS.has(request.reportId))
    throw new Error(`Unknown TPP General report: ${request.reportId}`);
  return { reportId: request.reportId, parameters: request.parameters };
}
