# CapsuleX system map

This is the authoritative inventory of CapsuleX operator systems, entity ownership, and UI status. Domain meaning remains in the canonical Manifest source; experience details live in the linked owner document.

Historical generated inventory: **43 governed business entities**, **219 command capabilities**, and **99 relationships** from 36 canonical proofs. These counts and the shipping labels below are not a current full-product qualification. Recount from the active generated registry when needed; the [2026-09-05 production-readiness requirements](../product/production-readiness.md) distinguish current evidence from remaining gaps.

## Operator systems

| System owner                  | Governed entities                                                                                                    | Workspace / route family                            | UI status                                                          |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ |
| Organization & identity       | Organization, Person                                                                                                 | `/admin` (Permissions → Team roles)                 | Shipping hire + role assign; Organization folio incomplete         |
| [Events](events.md)           | Client, Venue, Event, EventGuest                                                                                     | `/events`, `/events/new`, `/events/:id`             | Verified planning foundation: create, revisions, lifecycle, guests |
| [Culinary](culinary.md)       | Ingredient, Component, ComponentIngredient, Dish, Menu, EventDish                                                          | `/kitchen`                                          | Shipping catalogs, component detail, menus, and event dish selection  |
| [Inventory](inventory.md)     | StorageLocation, InventoryItem, InventoryReservation, IngredientDemand, WasteRecord                                  | `/inventory`                                        | Shipping demand and stock ledgers; reaction limits remain explicit |
| [Procurement](procurement.md) | Vendor, VendorOrder, VendorOrderLine, PurchaseNeed                                                                   | Inventory purchasing subworkspace                   | Shipping queue and order folio; reaction limits remain explicit    |
| Production & quality          | PrepTask, ProductionBatch, QualityCheck, Incident, EventAllergenCheck                                                | `/kitchen/prep`                                     | Shipping prep board + quality fail→block proof                     |
| Workforce                     | EventAssignment, Shift, ShiftType, AvailabilityWindow, TimeRecord, Qualification, TrainingModule, TrainingCompletion | `/staff`, `/staff/training`                         | Shipping roster, time, qualifications, training + shift gates      |
| [Logistics](logistics.md)     | PackList, PackListItem, Delivery                                                                                     | `/logistics`                                        | Shipping pack lists, load sheet, deliveries + lifecycle proof      |
| Commercial & billing          | ClientContact, Proposal, Contract, Invoice, Payment, PaymentMethod                                                   | `/clients`, `/finance`                              | Existing UI and booking handoff; full money/lifecycle qualification in PR05/PR06 |
| Closeout & reporting          | EventCloseout, PayrollInput, SavedReportDefinition                                                                   | `/finance/closeout`, `/finance/payroll`, `/reports` | Existing closeout, payroll, and report renderers; qualification in PR09/PR11 |

`TenantScoped` and `SoftDeletable` are source mixins, not operator systems or standalone workspaces.

## Platform systems

| System owner                                             | Scope                                                    | Status                                                                 |
| -------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| [Authentication](auth.md)                                | Clerk session, membership, trusted Convex auth context   | Shipping                                                               |
| [Navigation shell](navigation-shell.md)                  | Shell, command palette, route catalog, Home service desk | Shipping; Home is role-shaped attention over queryable facts           |
| [Manifest generation](../generation/manifest-builder.md) | Assembly and generated/authored boundary                 | Shipping                                                               |
| Projection status                                        | Current generated capability and blockers                | Not a public completion authority until its evidence page is published |

## Information architecture

- **Operate:** Home, Events, Kitchen, Inventory/Procurement, Logistics.
- **People:** Team and Workforce.
- **Business:** Clients/Commercial, Finance/Closeout, Reports.
- **System:** Organization settings and access surfaces that are actually backed by Organization, Person, Clerk, and authored seams.

API keys, marketing, knowledge base, vehicles/returns, and public proposal/signing flows existed or were planned in Capsule-Pro/Capsule-V2 but are not current canonical CapsuleX systems. They require an approved product decision and Manifest source before being promoted in navigation. Staff training is now canonical through `src/workforce/training.manifest` and `/staff/training`.

## Status meaning

- **Generated:** source, schema, queries, mutations, and client contracts exist.
- **Planned UI:** no coherent authored operator outcome has shipped.
- **Shipping:** the route has authored UI and focused verification.
- **Verified workflow:** the named operator outcome, legal commands, and failure paths have focused proof and real-user confirmation. It does not imply that unimplemented downstream systems or every cross-system reaction are complete. Events has this status for its planning foundation.
