import {
  report,
  recipeSlice,
  type TppArchiveWorkbook,
} from "./workbookInventory.shared";

const C = "company_wide/";

export const TPP_ARCHIVE_COMPANY_WORKBOOKS: readonly TppArchiveWorkbook[] = [
  // Company-wide lists.
  report(
    `${C}Contact_Activity.xlsx`,
    "Contact Activity",
    "contact-activity",
    "Lead Contact Activity",
  ),
  report(
    `${C}Contact_Event_Envelope.xlsx`,
    "Contact Event Envelope",
    "contact-event-envelope",
    null,
  ),
  report(
    `${C}Contact_Task_&_Notes.xlsx`,
    "Contact Task & Notes",
    "contact-task-notes",
    "Contact Tasks & Notes",
  ),
  report(
    `${C}Events_Pending_Final_Confirmation.xlsx`,
    "Events Pending Final Confirmation",
    "events-pending-final-confirmation",
    "Events Pending Final Confirmation",
  ),
  report(
    `${C}Inventory_In-Stock.xlsx`,
    "Inventory In-Stock",
    "inventory-in-stock",
    "Inventory In-Stock",
  ),
  report(
    `${C}Invoice_Number_History.xlsx`,
    "Invoice Number History",
    "invoice-number-history",
    "Invoice Number History",
  ),
  report(`${C}Mailing_Labels.xlsx`, "Mailing Labels", "mailing-labels", null),
  report(
    `${C}Menu_Item_Costing.xlsx`,
    "Menu Item Costing",
    "menu-item-costing",
    "Menu Item Costing",
    "Costed from each dish's recipe and ingredient costs. TPP's separate labor cost column has no Capsule figure per dish.",
  ),
  report(
    `${C}Menu_Item_Listing_Report.xlsx`,
    "Menu Item Listing Report",
    "menu-item-listing-report",
    null,
  ),
  report(
    `${C}Menu_Item_Packages.xlsx`,
    "Menu Item Packages",
    "menu-item-packages",
    "Menu Item Packages",
  ),
  report(
    `${C}Menu_Item_Popularity.xlsx`,
    "Menu Item Popularity",
    "menu-item-popularity",
    "Popular Menu Items",
  ),
  report(
    `${C}Staff_Address_&_Phone_List.xlsx`,
    "Staff Address & Phone List",
    "staff-address-phone-list",
    "Active Staff Address & Phone List",
  ),
  report(
    `${C}Vendor_Phone_List.xlsx`,
    "Vendor Phone List",
    "vendor-phone-list",
    "Vendor Phone List",
  ),
  report(
    `${C}Venue_Detail.xlsx`,
    "Venue Detail",
    "venue-detail",
    "Venue Details:",
  ),
  report(
    `${C}Venue_Listing.xlsx`,
    "Venue Listing",
    "venue-listing",
    "Venue Listing",
  ),
  ...[
    "10_Pizzas",
    "Air_Catering",
    "Apps_-_Passed_-_Finish_at_Event",
    "Buffet_Style",
    "Desserts_-_Finish_at_Event",
    "Heart_City",
    "Heart_City_Menu",
    "Hors_d_oeuvres",
    "Pizza_Items",
    "Pizza_Salad_Bread",
    "Salad",
    "Salad_Dressing",
    "Sauces",
    "Side_Dish",
    "Side_Items",
    "Soup",
  ].map(recipeSlice),
];
