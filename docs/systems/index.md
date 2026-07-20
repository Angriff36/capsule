# CapsuleX system map

This is the authoritative inventory of CapsuleX operator systems, entity ownership, and UI status. Domain meaning remains in the canonical Manifest source; experience details live in the linked owner document.

Current generated boundary: **43 governed business entities**, **219 command capabilities**, and **99 relationships** from the 36 canonical proofs in `C:/projects/Manifest-source/src`.

## Operator systems

| System owner                  | Governed entities                                                                   | Workspace / route family                | UI status                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| Organization & identity       | Organization, Person                                                                | Organization/team settings              | Generated; no authored workspace                                   |
| [Events](events.md)           | Client, Venue, Event, EventGuest                                                    | `/events`, `/events/new`, `/events/:id` | Verified planning foundation: create, revisions, lifecycle, guests |
| [Culinary](culinary.md)       | Ingredient, Recipe, RecipeIngredient, Dish, Menu, EventDish                         | `/kitchen`                              | Shipping catalogs, recipe detail, menus, and event dish selection  |
| [Inventory](inventory.md)     | StorageLocation, InventoryItem, InventoryReservation, IngredientDemand, WasteRecord | `/inventory`                            | Shipping demand and stock ledgers; reaction limits remain explicit |
| [Procurement](procurement.md) | Vendor, VendorOrder, VendorOrderLine, PurchaseNeed                                  | Inventory purchasing subworkspace       | Shipping queue and order folio; reaction limits remain explicit    |
| Production & quality          | PrepTask, ProductionBatch, QualityCheck, Incident, EventAllergenCheck               | `/kitchen/prep`                         | Shipping prep board + quality fail→block proof                     |
| Workforce                     | EventAssignment, Shift, AvailabilityWindow, TimeRecord, Qualification               | `/staff`                                | Shipping roster, time, qualifications + shift lifecycle proof      |
| [Logistics](logistics.md)     | PackList, PackListItem, Delivery                                                    | `/logistics`                            | Shipping pack lists, load sheet, deliveries + lifecycle proof      |
| Commercial & billing          | ClientContact, Proposal, Contract, Invoice, Payment, PaymentMethod                  | `/clients`, `/finance`                  | Generated; planned UI; payment reaction blocker                    |
| Closeout & reporting          | EventCloseout, PayrollInput, SavedReportDefinition                                  | `/finance/closeout`, `/finance/payroll`, `/reports` | Closeout + payroll shipped; reports deferred                |

`TenantScoped` and `SoftDeletable` are source mixins, not operator systems or standalone workspaces.

## Platform systems

| System owner                                             | Scope                                                        | Status                                                                 |
| -------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| [Authentication](auth.md)                                | Clerk session, membership, trusted Convex auth context       | Shipping                                                               |
| [Navigation shell](navigation-shell.md)                  | Shell, command palette, route catalog, Home service desk     | Shipping; Home is role-shaped attention over queryable facts           |
| [Manifest generation](../generation/manifest-builder.md) | Assembly and generated/authored boundary                     | Shipping                                                               |
| Projection status                                        | Current generated capability and blockers                    | Not a public completion authority until its evidence page is published |

## Information architecture

- **Operate:** Home, Events, Kitchen, Inventory/Procurement, Logistics.
- **People:** Team and Workforce.
- **Business:** Clients/Commercial, Finance/Closeout, Reports.
- **System:** Organization settings and access surfaces that are actually backed by Organization, Person, Clerk, and authored seams.

Facilities, equipment/work orders, notifications, API keys, leads/deals, marketing, knowledge base, vehicles/returns, training modules, and public proposal/signing flows existed or were planned in Capsule-Pro/Capsule-V2 but are not current canonical CapsuleX systems. They require an approved product decision and Manifest source before being promoted in navigation.

## Status meaning

- **Generated:** source, schema, queries, mutations, and client contracts exist.
- **Planned UI:** no coherent authored operator outcome has shipped.
- **Shipping:** the route has authored UI and focused verification.
- **Verified workflow:** the named operator outcome, legal commands, and failure paths have focused proof and real-user confirmation. It does not imply that unimplemented downstream systems or every cross-system reaction are complete. Events has this status for its planning foundation.
