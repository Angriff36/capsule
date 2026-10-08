/**
 * The supplied TPP report archive (PR11-01, AC-140): every one of the 90
 * exported workbooks and every report named in its index, and where each
 * report's purpose lives in Capsule now.
 *
 * A workbook maps to a native report only when it IS that TPP report (same
 * TPP report name), never because a name looks alike. `sourceHeading` is the
 * heading printed inside the workbook (null when it opens with the company
 * letterhead, a label sheet or bare column headings); the archive check in
 * tests/tpp-catalog-workbook-inventory.test.ts reads it back from the files.
 * The workbooks themselves are the owner's private TPP export and stay out of
 * the repo; their figures remain the historical source for their dates.
 */

import { TPP_ARCHIVE_COMPANY_WORKBOOKS } from "./workbookInventory.company";
import { TPP_ARCHIVE_EVENT_WORKBOOKS } from "./workbookInventory.event";
import { TPP_ARCHIVE_FINANCIAL_WORKBOOKS } from "./workbookInventory.financial";
import type { TppArchiveWorkbook } from "./workbookInventory.shared";

export type {
  TppArchiveUse,
  TppArchiveWorkbook,
} from "./workbookInventory.shared";

export const TPP_ARCHIVE_WORKBOOKS: readonly TppArchiveWorkbook[] = [
  ...TPP_ARCHIVE_EVENT_WORKBOOKS,
  ...TPP_ARCHIVE_COMPANY_WORKBOOKS,
  ...TPP_ARCHIVE_FINANCIAL_WORKBOOKS,
];

/**
 * Reports the archive index names that have no workbook among the 90: files
 * the owner already had in another format, reports TPP returned empty, the
 * blank template, and the ones TPP timed out on.
 */
export const TPP_INDEX_WITHOUT_WORKBOOK: readonly {
  tppReport: string;
  why: string;
  reportId: string;
}[] = [
  {
    tppReport: "Address & Phone List",
    why: "Owner already had it (ContactAddressPhoneList.xlsx).",
    reportId: "address-phone-list",
  },
  {
    tppReport: "Birthday List",
    why: "Owner already had it (PDF).",
    reportId: "birthday-list",
  },
  {
    tppReport: "Order Activity List",
    why: "Owner already had it (contact-order-history.xlsx).",
    reportId: "order-activity-list",
  },
  {
    tppReport: "Contact Letter Builder",
    why: "Owner already had it (screenshot).",
    reportId: "contact-letter-builder",
  },
  {
    tppReport: "Contract For Service",
    why: "Owner already had it (PDF).",
    reportId: "contract-for-service",
  },
  {
    tppReport: "Menu Item Recipes",
    why: "Too large for TPP in one run; exported by category instead.",
    reportId: "menu-item-recipes",
  },
  {
    tppReport: "Menu Item Table Tents",
    why: "Too large for TPP in one run; not exported.",
    reportId: "menu-item-table-tents",
  },
  {
    tppReport: "Heating & Serving - Labels",
    why: "TPP returned no data.",
    reportId: "heating-serving-labels",
  },
  {
    tppReport: "Kitchen Labor",
    why: "TPP returned no data.",
    reportId: "kitchen-labor",
  },
  {
    tppReport: "Other Inventory Order List by Vendor",
    why: "TPP returned no data.",
    reportId: "other-inventory-order-list-by-vendor",
  },
  {
    tppReport: "Contact/Lead Opportunities",
    why: "TPP returned no data.",
    reportId: "contact-lead-opportunities",
  },
  {
    tppReport: "Post Event Notes",
    why: "TPP returned no data.",
    reportId: "post-event-notes",
  },
  {
    tppReport: "Inventory Cost Changes",
    why: "TPP returned no data.",
    reportId: "inventory-cost-changes",
  },
  {
    tppReport: "Contact Worksheet (Blank)",
    why: "Blank template; nothing to export.",
    reportId: "contact-worksheet-blank",
  },
];
