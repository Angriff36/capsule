import {
  CLIENT_PARAMETER,
  DATE_RANGE_PARAMETER,
  DOCUMENT_OUTPUTS,
  EVENT_PARAMETER,
  LABEL_OUTPUTS,
  PRINT_TABLE_OUTPUTS,
  report,
} from "./catalog.shared";
import type { TppReportDefinition } from "./types";

export const TPP_CONTACT_REPORTS: readonly TppReportDefinition[] = [
  report({
    id: "address-phone-list",
    name: "Address & Phone List",
    description: "Lists each contact's name, address and phone number.",
    category: "contacts",
    parameters: [],
  }),
  report({
    id: "birthday-list",
    name: "Birthday List",
    description: "Lists contacts with birthdays on selected month.",
    category: "contacts",
    parameters: [
      {
        key: "month",
        type: "enum",
        label: "Month",
        required: true,
        options: [
          "January",
          "February",
          "March",
          "April",
          "May",
          "June",
          "July",
          "August",
          "September",
          "October",
          "November",
          "December",
        ].map((label, index) => ({ value: String(index + 1), label })),
      },
    ],
  }),
  report({
    id: "contact-activity",
    name: "Contact Activity",
    description: "Look Up Contacts created within a given date range.",
    category: "contacts",
    parameters: DATE_RANGE_PARAMETER,
  }),
  report({
    id: "contact-event-envelope",
    name: "Contact Event Envelope",
    description:
      "Print out standard #10 envelopes with contact or venue address information.",
    category: "contacts",
    parameters: EVENT_PARAMETER,
    renderer: "labels",
    outputs: LABEL_OUTPUTS,
  }),
  report({
    id: "contact-letter-builder",
    name: "Contact Letter Builder",
    description: "Build structured letters designed to send to contacts.",
    category: "contacts",
    parameters: [
      ...CLIENT_PARAMETER,
      {
        key: "showCompanyInfo",
        type: "boolean",
        label: "Show company name and address",
        default: true,
      },
      {
        key: "letterDate",
        type: "date",
        label: "Letter date",
        required: false,
        default: "today",
      },
      {
        key: "noLetterDate",
        type: "boolean",
        label: "No letter date",
        default: false,
      },
      { key: "ref", type: "text", label: "Ref", required: false, lines: 1 },
      { key: "attn", type: "text", label: "Attn", required: false, lines: 1 },
      {
        key: "subject",
        type: "text",
        label: "Subject",
        required: false,
        lines: 1,
      },
      {
        key: "salutation",
        type: "text",
        label: "Greeting (for example: Dear Samantha,)",
        required: false,
        lines: 1,
      },
      {
        key: "body",
        type: "text",
        label: "Letter",
        required: true,
        savedTexts: true,
      },
      {
        key: "closing",
        type: "text",
        label: "Closing (for example: Sincerely,)",
        required: false,
        lines: 1,
      },
      {
        key: "senderName",
        type: "text",
        label: "Sender's name",
        required: false,
        lines: 1,
      },
      {
        key: "senderTitle",
        type: "text",
        label: "Job title",
        required: false,
        lines: 1,
      },
      {
        key: "senderCompany",
        type: "text",
        label: "Company",
        required: false,
        lines: 1,
      },
      { key: "cc", type: "text", label: "CC", required: false, lines: 2 },
    ],
    renderer: "event_document",
    outputs: DOCUMENT_OUTPUTS,
  }),
  report({
    id: "contract-for-service",
    name: "Contract For Service",
    description:
      "Event contract customizable with your specific terms and conditions. This is different than the Proposal of Service.",
    category: "contacts",
    parameters: EVENT_PARAMETER,
    renderer: "event_document",
    outputs: DOCUMENT_OUTPUTS,
  }),
  report({
    id: "event-menu",
    name: "Event Menu",
    description:
      "Lists only the menu (food) portion of an event without pricing. Summary event data such as event date, contact name, and venue also lists at the top.",
    category: "contacts",
    parameters: EVENT_PARAMETER,
    renderer: "event_document",
    outputs: DOCUMENT_OUTPUTS,
    evidence: [
      {
        kind: "mangia_sample",
        reference: "work/training docs/binder-docs/event-menu.pdf",
      },
      {
        kind: "mangia_sample",
        reference:
          "work/training docs/Ops-training/GMT20260420-161706_Recording.transcript.vtt",
      },
    ],
  }),
  report({
    id: "invoice-event",
    name: "Invoice Event",
    description: "Contact invoice for event. Select detailed or summary view.",
    category: "contacts",
    parameters: [
      ...EVENT_PARAMETER,
      {
        key: "view",
        type: "enum",
        label: "View",
        required: true,
        options: [
          { value: "detailed", label: "Detailed" },
          { value: "summary", label: "Summary" },
        ],
      },
      {
        key: "printCompany",
        type: "boolean",
        label: "Print My Company",
        default: true,
      },
    ],
    renderer: "event_document",
    outputs: DOCUMENT_OUTPUTS,
    evidence: [
      {
        kind: "published",
        reference:
          "https://doczz.net/doc/6489186/total-party-planner-desktop-version-8.1-building-your-fir...",
      },
    ],
  }),
  report({
    id: "order-activity-list",
    name: "Order Activity List",
    description:
      "Shows when a Contact last ordered within chosen parameters, including date range, event status, occasion, service style, and type.",
    category: "contacts",
    parameters: DATE_RANGE_PARAMETER,
  }),
  report({
    id: "packing-slip",
    name: "Packing Slip",
    description: "View of the invoice that does not list pricing information.",
    category: "contacts",
    parameters: EVENT_PARAMETER,
    renderer: "event_document",
    outputs: DOCUMENT_OUTPUTS,
  }),
  report({
    id: "proposal-of-service",
    name: "Proposal of Service",
    description:
      "Professional quote for an event. Shows detailed menu and price breakdown, along with special contact notes.",
    category: "contacts",
    parameters: [
      ...EVENT_PARAMETER,
      {
        key: "printCompany",
        type: "boolean",
        label: "Print My Company",
        default: true,
      },
    ],
    renderer: "event_document",
    outputs: DOCUMENT_OUTPUTS,
    evidence: [
      {
        kind: "published",
        reference:
          "https://doczz.net/doc/6489186/total-party-planner-desktop-version-8.1-building-your-fir...",
      },
    ],
  }),
];
