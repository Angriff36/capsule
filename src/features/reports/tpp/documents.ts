import type { TppDocumentSection, TppReportResult } from "./types";

export function tppDocument(
  title: string,
  template: string,
  sections: readonly TppDocumentSection[],
): TppReportResult {
  return { kind: "document", title, template, sections };
}

export const TPP_DOCUMENT_HEADINGS = {
  "event-beo": "Banquet Event Order",
  "event-booking": "Event Booking",
  "event-timeline": "Event Timeline",
  "event-worksheet": "Event Worksheet",
  "heating-serving-event-menu": "Heating and Serving Event Menu",
  "contact-worksheet-blank": "Contact Worksheet",
} as const;
