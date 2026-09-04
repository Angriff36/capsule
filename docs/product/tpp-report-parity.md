# TPP report parity matrix

**Catalog source:** Mangia TPP screenshot captured 2026-09-03  
**Contract:** 96 visible cards, 89 canonical reports, 7 Favorites aliases  
**Status vocabulary:** `sample` means a Mangia output exists under `work/`; `published` means a public report definition exists; `inferred` means the accepted first implementation follows the TPP catalog description until a stronger comparison is available.

The implementation source of truth is `src/features/reports/tpp/catalog.ts`. This matrix records parity evidence; it is not an allowlist and does not remove any report from the delivery.

## Contacts

| TPP report | Family | Capsule sources | Parameters | Outputs | Evidence |
| --- | --- | --- | --- | --- | --- |
| Address & Phone List | table | Client, ClientContact | none | print, PDF, CSV | inferred |
| Birthday List | table | ClientContact | month | print, PDF, CSV | inferred |
| Contact Activity | table | Client, ClientContact | date range | print, PDF, CSV | inferred |
| Contact Event Envelope | labels | Event, Client, Venue | event | print, PDF, #10 envelope | inferred |
| Contact Letter Builder | document | Client | contact, letter body | print, PDF | inferred |
| Contract For Service | event document | Contract, Event, Client | event | print, PDF | inferred |
| Event Menu | event document | Event, EventDish, Dish | event | print, PDF | sample: `work/training docs/binder-docs/event-menu.pdf` |
| Invoice Event | event document | Invoice, Event, Client, Payment | event, detail/summary, company block | print, PDF | published TPP 8.1 guide |
| Order Activity List | table | Client, Event | date range, status, occasion, service style, type | print, PDF, CSV | inferred |
| Packing Slip | event document | Invoice, Event, Client | event | print, PDF | inferred |
| Proposal of Service | event document | Proposal, Event, Client | event, company block | print, PDF | published TPP 8.1 guide |

## Event

| TPP report | Family | Capsule sources | Parameters | Outputs | Evidence |
| --- | --- | --- | --- | --- | --- |
| Beverage Order List by Vendor | table | Event, InventoryItem, PurchaseNeed, Vendor | date range, event, vendor | print, PDF, CSV | inferred |
| Contact Worksheet (Blank) | worksheet | none | none | print, PDF | inferred |
| Equipment Summary | worksheet | EquipmentReservation, Equipment, Event | date range | print, PDF | inferred |
| Event BEO | event document | Event and event execution records | event | print, PDF | existing Capsule BEO + inferred TPP order |
| Event Booking | event document | Event | event or date range | print, PDF | inferred |
| Event Changes | table | Event, manifest audit/events | selected date | print, PDF, CSV | inferred |
| Event Delivery Addresses | table | Delivery, Event, Venue | date range | print, PDF, CSV | inferred |
| Event List | table | Event, Invoice, Client | date range, status | print, PDF, CSV | inferred |
| Event Menu Item Labels | labels | Event, EventDish, Dish | event | print, PDF, labels | inferred |
| Event Menu Item Production | worksheet | EventDish, Dish, PrepTask | event or date range | print, PDF | inferred |
| Event Schedule | table | Event | date range, status | print, PDF, CSV | inferred |
| Event Tasks & Notes | table | Event, EventTimelineActivity, notes | event or date range | print, PDF, CSV | inferred |
| Event Timeline | event document | EventTimelineActivity, EventTimelineComment | event | print, PDF | inferred |
| Event Worksheet | worksheet | complete event bundle | event | print, PDF | sample: `work/training docs/binder-docs/event-worksheet.pdf` |
| Heating & Serving - Labels | labels | EventDish, Dish | event | print, PDF, labels | inferred |
| Heating and Serving Event Menu | event document | EventDish, Dish | event | print, PDF | inferred |
| Invoice Number History | table | Invoice | date range | print, PDF, CSV | inferred |
| Kitchen Labor | worksheet | PrepTask, TimeRecord, Person | event or date range | print, PDF | inferred |
| Master Food Production Worksheet | worksheet | Event, EventDish, Dish, components | date range, status, category, station, quantity basis | print, PDF, CSV, Excel | published Galley workflow + local prep sample |
| Menu Item Recipes | worksheet | Dish, DishIngredient, Component | event | print, PDF | inferred |
| Menu Item Table Tents | labels | EventDish, Dish | event | print, PDF, Avery tent cards | inferred |
| Miscellaneous Order List By Vendor | table | PurchaseNeed, VendorOrder, Vendor | event or date range | print, PDF, CSV | inferred |
| Order List | worksheet | IngredientDemand, PurchaseNeed, Vendor | date range | print, PDF, CSV, Excel | local TPP import fixture |
| Other Inventory Order List by Vendor | table | InventoryItem, PurchaseNeed, Vendor | event or date range | print, PDF, CSV | inferred |
| Pack List | worksheet | PackList, PackListItem, Event | event | print, PDF | samples: `pack-list-by-item.pdf`, `REF-pack-list.pdf` |
| Production Summary | worksheet | EventDish, Dish, PrepTask | event | print, PDF | inferred |
| Rental Order List by Vendor | table | EquipmentReservation, VendorOrder, Vendor | event or date range | print, PDF, CSV | inferred |
| Shopping List | worksheet | IngredientDemand, PurchaseNeed | event or date range | print, PDF | inferred |
| Staff Schedules | table | Shift, Event, Person | event, person, or date range | print, PDF, CSV | inferred |

## Financial

| TPP report | Family | Capsule sources | Parameters | Outputs | Evidence |
| --- | --- | --- | --- | --- | --- |
| A/R Aging Detail | financial | Invoice, Payment, Client | as-of date | print, PDF, CSV, Excel | inferred standard aging buckets |
| Accounts Receivable | financial | Invoice, Payment, Client | as-of date | print, PDF, CSV, Excel | inferred |
| Accounts Receivable - New | financial | Invoice, Payment, Client | as-of date | print, PDF, CSV, Excel | inferred |
| Average Event Spending per Guest | financial | Event, Invoice | date range | print, PDF, CSV, Excel | inferred |
| Beverage Costs | financial | Event beverage lines, InventoryItem | event or date range | print, PDF, CSV, Excel | inferred |
| Beverage Totals | financial | Event beverage lines, Invoice | date range | print, PDF, CSV, Excel | inferred |
| Contact Payments | financial | Payment, Invoice, Client | event or date range | print, PDF, CSV, Excel | inferred |
| Contact Statement/Receivables | financial | Invoice, Payment, Client | contact | print, PDF, CSV, Excel | inferred |
| Credit Card Transactions | financial | Payment, PaymentMethod | date range | print, PDF, CSV, Excel | inferred |
| Event Discount Summary | financial | Invoice, Proposal | date range | print, PDF, CSV, Excel | inferred |
| Event Food Costing Summary | financial | EventDish, Dish costs, Invoice | event or date range | print, PDF, CSV, Excel | inferred |
| Event Other Fee(s) | financial | ProposalLineItem, Invoice | date range | print, PDF, CSV, Excel | inferred |
| Event Revenue by Client | financial | Invoice, Event, Client | date range | print, PDF, CSV, Excel | inferred |
| Event Sales by Referral | financial | Event, Invoice, ReferralSource | date range | print, PDF, CSV, Excel | inferred |
| Event Scheduled Payments | financial | Invoice deposit/due schedule | date range, status | print, PDF, CSV, Excel | inferred |
| Inventory Cost Changes | financial | IngredientPriceObservation, InventoryItem | date range | print, PDF, CSV, Excel | inferred |
| Ledger / Food and Beverage Sales | financial | Invoice, proposal/event charge lines | date range | print, PDF, CSV, Excel | inferred |
| Lost Revenue by Cancellation Reason | financial | Event, Proposal, Invoice | date range | print, PDF, CSV, Excel | inferred |
| Menu Item Cost per Event | financial | EventDish, Dish costs | event or date range | print, PDF, CSV, Excel | inferred |
| Menu Item Costing | financial | Dish, DishIngredient, Component | date range | print, PDF, CSV, Excel | inferred |
| Menu Item Itemized Sales | financial | ProposalDishSelection, Invoice | date range | print, PDF, CSV, Excel | inferred |
| Menu Item Sales by Category | financial | Dish, ProposalDishSelection, Invoice | date range | print, PDF, CSV, Excel | inferred |
| Miscellaneous Totals | financial | ProposalLineItem, Invoice | date range | print, PDF, CSV, Excel | inferred |
| Outstanding Deposits | financial | Invoice | date range | print, PDF, CSV, Excel | inferred |
| Outstanding Proposals | financial | Proposal | date range | print, PDF, CSV, Excel | inferred |
| Payment Totals | financial | Payment, PaymentMethod | date range | print, PDF, CSV, Excel | inferred |
| Platform Fee + Gratuity Summary | financial | Payment, Invoice, event charges | date range | print, PDF, CSV, Excel | inferred |
| Profit Summary | financial | EventCloseout, Invoice, cost/labor summaries | event or date range, detail/summary | print, PDF, CSV, Excel | inferred |
| Rental Charges | financial | EquipmentReservation, ProposalLineItem, Invoice | event or date range | print, PDF, CSV, Excel | inferred |
| Sales Forecasting | financial | Proposal, Event, Client | date range | print, PDF, CSV, Excel | inferred |
| Snapshot Revenue | financial | Proposal, Invoice, Event | as-of date | print, PDF, CSV, Excel | inferred |
| Staff Earnings | financial | TimeRecord, Person pay-rate seam | date range | print, PDF, CSV, Excel | inferred |
| Staffing Charges | financial | Shift, TimeRecord, ProposalLineItem | event or date range | print, PDF, CSV, Excel | inferred |
| Tax Exempt - New | financial | Invoice, Client tax fields | date range | print, PDF, CSV, Excel | inferred |
| Taxable Sales | financial | Invoice | date range | print, PDF, CSV, Excel | inferred |
| Venue Sales | financial | Event, Venue, Invoice | date range | print, PDF, CSV, Excel | inferred |

## TPP General

| TPP report | Family | Capsule sources | Parameters | Outputs | Evidence |
| --- | --- | --- | --- | --- | --- |
| Contact Task & Notes | table | ClientCommunication, tasks | date range | print, PDF, CSV | inferred |
| Contact/Lead Opportunities | table | Lead, Proposal, Client | date range | print, PDF, CSV | inferred |
| Events Pending Final Confirmation | table | Event | date range | print, PDF, CSV | inferred |
| Inventory In-Stock | table | InventoryItem, InventoryLot | none | print, PDF, CSV, Excel | inferred |
| Mailing Labels | labels | Client, ClientContact | contact filters | print, PDF, Avery 5160 | inferred |
| Menu Item Listing Report | table | Dish | category/status | print, PDF, CSV | inferred |
| Menu Item Packages | table | Menu, MenuDish, Dish | package/status | print, PDF, CSV | inferred |
| Menu Item Popularity | table | EventDish, Dish, Event | date range | print, PDF, CSV | inferred |
| Post Event Notes | table | Event, EventCloseout, notes | date range | print, PDF, CSV | inferred |
| Staff Address & Phone List | table | Person | none | print, PDF, CSV | inferred |
| Vendor Phone List | table | Vendor, VendorContact | none | print, PDF, CSV | inferred |
| Venue Detail | event document | Venue, VenueNote | venue | print, PDF | inferred |
| Venue Listing | table | Venue | none | print, PDF, CSV | inferred |

## Favorites aliases

Event Booking, Event Changes, Event List, Event Menu, Event Timeline, Event Worksheet, and Proposal of Service reference their canonical IDs. They do not count toward the 89 unique definitions.
