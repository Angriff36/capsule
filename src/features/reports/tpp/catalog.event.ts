import {
  DATE_RANGE_PARAMETER,
  DOCUMENT_OUTPUTS,
  EVENT_PARAMETER,
  LABEL_OUTPUTS,
  PRINT_EXCEL_OUTPUTS,
  PRINT_TABLE_OUTPUTS,
  report,
} from "./catalog.shared";
import type { TppReportDefinition } from "./types";

const eventDocument = (
  id: string,
  name: string,
  description: string,
): TppReportDefinition =>
  report({
    id,
    name,
    description,
    category: "event",
    parameters: EVENT_PARAMETER,
    renderer: "event_document",
    outputs: DOCUMENT_OUTPUTS,
  });

const eventWorksheet = (
  id: string,
  name: string,
  description: string,
): TppReportDefinition =>
  report({
    id,
    name,
    description,
    category: "event",
    parameters: EVENT_PARAMETER,
    renderer: "worksheet",
    outputs: DOCUMENT_OUTPUTS,
  });

const datedTable = (
  id: string,
  name: string,
  description: string,
): TppReportDefinition =>
  report({
    id,
    name,
    description,
    category: "event",
    parameters: DATE_RANGE_PARAMETER,
    outputs: PRINT_TABLE_OUTPUTS,
  });

export const TPP_EVENT_REPORTS: readonly TppReportDefinition[] = [
  datedTable(
    "beverage-order-list-by-vendor",
    "Beverage Order List by Vendor",
    "Beverages to order for an event or date range, grouped by assigned Vendor.",
  ),
  report({
    id: "contact-worksheet-blank",
    name: "Contact Worksheet (Blank)",
    description:
      "Blank working template which can be used prior to data entry.",
    category: "event",
    parameters: [],
    renderer: "worksheet",
    outputs: DOCUMENT_OUTPUTS,
  }),
  eventWorksheet(
    "equipment-summary",
    "Equipment Summary",
    "Look at all of your equipment for the day in one view",
  ),
  eventDocument(
    "event-beo",
    "Event BEO",
    "Banquet Event Order Report - Detailing Event Date, contact information, set up notes",
  ),
  eventDocument(
    "event-booking",
    "Event Booking",
    "Events booked by selected event or time frame.",
  ),
  datedTable(
    "event-changes",
    "Event Changes",
    "Recent changes to Events as of a selected date",
  ),
  datedTable(
    "event-delivery-addresses",
    "Event Delivery Addresses",
    "View all of your delivery addresses and times printed by date range.",
  ),
  datedTable(
    "event-list",
    "Event List",
    "Summary listing of event date, status, invoice number, contact, and guest count.",
  ),
  report({
    id: "event-menu-item-labels",
    name: "Event Menu Item Labels",
    description:
      "Pre-print container labels for event menu items. Prints event date, contact name, and menu item name.",
    category: "event",
    parameters: EVENT_PARAMETER,
    renderer: "labels",
    outputs: LABEL_OUTPUTS,
  }),
  eventWorksheet(
    "event-menu-item-production",
    "Event Menu Item Production",
    "Kitchen list of menu items to prepare along with counts & yields. Print for a single event or date range.",
  ),
  datedTable(
    "event-schedule",
    "Event Schedule",
    "Shows the scheduled events for a specific date range and statuses.",
  ),
  datedTable(
    "event-tasks-notes",
    "Event Tasks & Notes",
    "List of Last Selected or Date Range Event's Tasks and Notes.",
  ),
  eventDocument(
    "event-timeline",
    "Event Timeline",
    "Complete timeline of important event details.",
  ),
  report({
    ...eventWorksheet(
      "event-worksheet",
      "Event Worksheet",
      "Summarizes every facet of the event (food, beverage, rental, misc, and staffing) in one condensed view. Many also refer to this report as a BEO.",
    ),
    evidence: [
      {
        kind: "mangia_sample",
        reference: "work/training docs/binder-docs/event-worksheet.pdf",
      },
      {
        kind: "published",
        reference:
          "https://doczz.net/doc/6489186/total-party-planner-desktop-version-8.1-building-your-fir...",
      },
    ],
  }),
  report({
    id: "heating-serving-labels",
    name: "Heating & Serving - Labels",
    description:
      "Container labels showing heating and serving instruction per menu item.",
    category: "event",
    parameters: EVENT_PARAMETER,
    renderer: "labels",
    outputs: LABEL_OUTPUTS,
  }),
  eventDocument(
    "heating-serving-event-menu",
    "Heating and Serving Event Menu",
    "Listing of Menu Items and their Heating and Serving Instructions",
  ),
  datedTable(
    "invoice-number-history",
    "Invoice Number History",
    "Historical list of all invoice numbers in use.",
  ),
  eventWorksheet(
    "kitchen-labor",
    "Kitchen Labor",
    "Kitchen Labor detailing the amount of hours and cost to prepare Menu items.",
  ),
  report({
    id: "master-food-production-worksheet",
    name: "Master Food Production Worksheet",
    description:
      "A great resource for your food production needs and how you want it to look",
    category: "event",
    parameters: DATE_RANGE_PARAMETER,
    renderer: "worksheet",
    outputs: PRINT_EXCEL_OUTPUTS,
    evidence: [
      {
        kind: "published",
        reference: "https://support.galleysolutions.com/tpp-workflow",
      },
      {
        kind: "mangia_sample",
        reference: "work/training docs/Prep/menu-with-prep.pdf",
      },
    ],
  }),
  eventWorksheet(
    "menu-item-recipes",
    "Menu Item Recipes",
    "Cookbook style recipe report with preparation method.",
  ),
  report({
    id: "menu-item-table-tents",
    name: "Menu Item Table Tents",
    description: "Print out menu item table tents (Avery Medium Tent Card)",
    category: "event",
    parameters: EVENT_PARAMETER,
    renderer: "labels",
    outputs: LABEL_OUTPUTS,
  }),
  datedTable(
    "miscellaneous-order-list-by-vendor",
    "Miscellaneous Order List By Vendor",
    "Miscellaneous items (floral, dj, photographer, etc.) to order for an event or date range, grouped by assigned Vendor.",
  ),
  report({
    id: "order-list",
    name: "Order List",
    description:
      "Menu Item Recipe Ingredients to order. Ingredients sorted by vendor.",
    category: "event",
    parameters: DATE_RANGE_PARAMETER,
    renderer: "worksheet",
    outputs: PRINT_EXCEL_OUTPUTS,
  }),
  datedTable(
    "other-inventory-order-list-by-vendor",
    "Other Inventory Order List by Vendor",
    "Other Inventory to order for an event or date range, grouped by assigned Vendor.",
  ),
  report({
    ...eventWorksheet(
      "pack-list",
      "Pack List",
      "All inventory/equipment items required to bring 'on site' for an event. The packing list is generated based on associations created.",
    ),
    evidence: [
      {
        kind: "mangia_sample",
        reference: "work/training docs/binder-docs/pack-list-by-item.pdf",
      },
      {
        kind: "mangia_sample",
        reference: "work/training docs/binder-docs/REF-pack-list.pdf",
      },
    ],
  }),
  eventWorksheet(
    "production-summary",
    "Production Summary",
    "Checklist summary of event menu items and kitchen notes.",
  ),
  datedTable(
    "rental-order-list-by-vendor",
    "Rental Order List by Vendor",
    "Rentals to order for an event or date range, grouped by assigned Vendor.",
  ),
  eventWorksheet(
    "shopping-list",
    "Shopping List",
    "Show a list of ingredients and beverages needed for upcoming event(s)",
  ),
  datedTable(
    "staff-schedules",
    "Staff Schedules",
    "Staff schedules by event, staff member, or date.",
  ),
];
