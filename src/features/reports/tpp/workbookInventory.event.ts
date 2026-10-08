import { report, type TppArchiveWorkbook } from "./workbookInventory.shared";

const E = "event_specific/";

export const TPP_ARCHIVE_EVENT_WORKBOOKS: readonly TppArchiveWorkbook[] = [
  // Event scope (one event: invoice 6014).
  report(
    `${E}Beverage_Order_List_by_Vendor.xlsx`,
    "Beverage Order List by Vendor",
    "beverage-order-list-by-vendor",
    "Beverage Order List by Vendor",
  ),
  report(
    `${E}Equipment_Summary.xlsx`,
    "Equipment Summary",
    "equipment-summary",
    "Equipment Summary Report",
  ),
  report(`${E}Event_BEO.xlsx`, "Event BEO", "event-beo", "Banquet Event Order"),
  report(
    `${E}Event_Booking.xlsx`,
    "Event Booking",
    "event-booking",
    "Event Booking",
  ),
  report(
    `${E}Event_Changes.xlsx`,
    "Event Changes",
    "event-changes",
    "Event changes as of",
  ),
  report(
    `${E}Event_Delivery_Addresses.xlsx`,
    "Event Delivery Addresses",
    "event-delivery-addresses",
    "Event Delivery Addresses",
  ),
  report(`${E}Event_List.xlsx`, "Event List", "event-list", "Event(s) List"),
  report(`${E}Event_Menu.xlsx`, "Event Menu", "event-menu", null),
  report(
    `${E}Event_Menu_Item_Labels.xlsx`,
    "Event Menu Item Labels",
    "event-menu-item-labels",
    null,
  ),
  report(
    `${E}Event_Menu_Item_Production.xlsx`,
    "Event Menu Item Production",
    "event-menu-item-production",
    null,
  ),
  report(
    `${E}Event_Schedule.xlsx`,
    "Event Schedule",
    "event-schedule",
    "Event Schedule",
  ),
  report(
    `${E}Event_Tasks_&_Notes.xlsx`,
    "Event Tasks & Notes",
    "event-tasks-notes",
    "Event Tasks",
  ),
  report(
    `${E}Event_Timeline.xlsx`,
    "Event Timeline",
    "event-timeline",
    "Event Timeline",
  ),
  report(
    `${E}Event_Worksheet.xlsx`,
    "Event Worksheet",
    "event-worksheet",
    "Event Worksheet",
  ),
  report(
    `${E}Heating_and_Serving_Event_Menu.xlsx`,
    "Heating and Serving Event Menu",
    "heating-serving-event-menu",
    "Heating & Serving Instructions",
  ),
  report(`${E}Invoice_Event.xlsx`, "Invoice Event", "invoice-event", null),
  report(
    `${E}Master_Food_Production_Worksheet.xlsx`,
    "Master Food Production Worksheet",
    "master-food-production-worksheet",
    null,
  ),
  report(
    `${E}Menu_Item_Cost_per_Event.xlsx`,
    "Menu Item Cost per Event",
    "menu-item-cost-per-event",
    "Event Menu Item Cost",
  ),
  report(
    `${E}Miscellaneous_Order_List_By_Vendor.xlsx`,
    "Miscellaneous Order List By Vendor",
    "miscellaneous-order-list-by-vendor",
    "Miscellaneous Order List by Vendor",
  ),
  report(`${E}Order_List.xlsx`, "Order List", "order-list", "Order List"),
  report(`${E}Pack_List.xlsx`, "Pack List", "pack-list", "Pack List"),
  report(
    `${E}Packing_Slip.xlsx`,
    "Packing Slip",
    "packing-slip",
    "Packing Slip",
  ),
  report(
    `${E}Production_Summary.xlsx`,
    "Production Summary",
    "production-summary",
    "Production Summary Worksheet by Event",
  ),
  report(
    `${E}Proposal_of_Service.xlsx`,
    "Proposal of Service",
    "proposal-of-service",
    null,
  ),
  report(
    `${E}Rental_Order_List_by_Vendor.xlsx`,
    "Rental Order List by Vendor",
    "rental-order-list-by-vendor",
    "Rental Order List by Vendor",
  ),
  report(
    `${E}Shopping_List.xlsx`,
    "Shopping List",
    "shopping-list",
    "Shopping List By: Vendor",
  ),
  report(
    `${E}Staff_Schedules.xlsx`,
    "Staff Schedules",
    "staff-schedules",
    "Staff Schedules",
  ),
];
