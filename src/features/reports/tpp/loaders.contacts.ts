import type { TppReportId, TppReportRequest } from "./types";

export const TPP_CONTACT_LOADER_IDS = new Set<TppReportId>([
  "address-phone-list",
  "birthday-list",
  "contact-activity",
  "contact-event-envelope",
  "contact-letter-builder",
  "contract-for-service",
  "event-menu",
  "invoice-event",
  "order-activity-list",
  "packing-slip",
  "proposal-of-service",
]);

export function contactLoaderArgs(request: TppReportRequest) {
  if (!TPP_CONTACT_LOADER_IDS.has(request.reportId))
    throw new Error(`Unknown Contacts report: ${request.reportId}`);
  return { reportId: request.reportId, parameters: request.parameters };
}
