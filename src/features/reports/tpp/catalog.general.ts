import {
  DATE_RANGE_PARAMETER,
  LABEL_OUTPUTS,
  PRINT_EXCEL_OUTPUTS,
  report,
} from "./catalog.shared";
import type { TppReportDefinition } from "./types";

export const TPP_GENERAL_REPORTS: readonly TppReportDefinition[] = [
  report({
    id: "contact-task-notes",
    name: "Contact Task & Notes",
    description: "List of tasks & notes associated with contacts.",
    category: "tpp_general",
    parameters: DATE_RANGE_PARAMETER,
  }),
  report({
    id: "contact-lead-opportunities",
    name: "Contact/Lead Opportunities",
    description: "",
    category: "tpp_general",
    parameters: DATE_RANGE_PARAMETER,
  }),
  report({
    id: "events-pending-final-confirmation",
    name: "Events Pending Final Confirmation",
    description: "",
    category: "tpp_general",
    parameters: DATE_RANGE_PARAMETER,
  }),
  report({
    id: "inventory-in-stock",
    name: "Inventory In-Stock",
    description:
      "Listing of database inventory, by category, and it's corresponding monetary value.",
    category: "tpp_general",
    parameters: [],
    outputs: PRINT_EXCEL_OUTPUTS,
  }),
  report({
    id: "mailing-labels",
    name: "Mailing Labels",
    description:
      'Print standard Avery 1" x 2 5/8" labels for selected contact parameters.',
    category: "tpp_general",
    parameters: [],
    renderer: "labels",
    outputs: LABEL_OUTPUTS,
  }),
  report({
    id: "menu-item-listing-report",
    name: "Menu Item Listing Report",
    description:
      "Listing of all current menu items offered. Listing is by category (appetizers, entrees, desserts, etc.).",
    category: "tpp_general",
    parameters: [],
  }),
  report({
    id: "menu-item-packages",
    name: "Menu Item Packages",
    description: "Listing of all menu items associated to a defined package.",
    category: "tpp_general",
    parameters: [],
  }),
  report({
    id: "menu-item-popularity",
    name: "Menu Item Popularity",
    description: "Listing of Menu Items and their popularity by date range.",
    category: "tpp_general",
    parameters: DATE_RANGE_PARAMETER,
  }),
  report({
    id: "post-event-notes",
    name: "Post Event Notes",
    description:
      "Gather all notes listed under 'post event notes' in a single report for a specified date range.",
    category: "tpp_general",
    parameters: DATE_RANGE_PARAMETER,
  }),
  report({
    id: "staff-address-phone-list",
    name: "Staff Address & Phone List",
    description: "Lists each staff members name, address and phone number.",
    category: "tpp_general",
    parameters: [],
  }),
  report({
    id: "vendor-phone-list",
    name: "Vendor Phone List",
    description: "List of Vendor names & phone numbers.",
    category: "tpp_general",
    parameters: [],
  }),
  report({
    id: "venue-detail",
    name: "Venue Detail",
    description:
      "Print venue name, address, phone, directions, and special notes.",
    category: "tpp_general",
    parameters: [
      {
        key: "venueId",
        type: "entity",
        entity: "venue",
        label: "Venue",
        required: true,
      },
    ],
    renderer: "event_document",
  }),
  report({
    id: "venue-listing",
    name: "Venue Listing",
    description: "Listing of all active venues in database.",
    category: "tpp_general",
    parameters: [],
  }),
];
