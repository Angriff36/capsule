# CapsuleX implementation sequence

This is the sole roadmap for moving from generated domain breadth to verified operator workflows. It replaces Capsule-V2 parity assumptions; it is not a promise that generated artifacts are already shippable.

## Slice gate

Every slice must:

1. start from its owning system doc and canonical `.manifest` sources;
2. identify one operator outcome, route family, roles, and lifecycle states;
3. verify required generated queries, hooks, mutations, and reactions;
4. add focused tests before or with implementation;
5. handle loading, populated, empty, denied, guard-blocked, constraint-blocked, conflict, and unexpected-error states;
6. preserve the `DESIGN.md` archetype on desktop and mobile;
7. avoid hand edits to generated files and avoid app-local business consequences;
8. update the public owning system page with the implemented routes, roles, commands, lifecycle states, failure behavior, explicit limitations, and proof paths; generated capability presence alone is not a shipping claim;
9. pass dependency checks and `bun run check` before completion.

## Sequence

| Slice                             | Operator outcome                                                                                 | Primary systems                            | Dependency / release gate                                                     |
| --------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------- |
| 0. Projection safety              | Cross-system commands execute through correct generated dispatch                                 | Generation                                 | Clear PX001–PX003 in projection status and add reaction regressions           |
| 1. Event planning foundation      | Create and maintain a client event, venue, guests, lifecycle, and service brief                  | Events, Organization & identity            | Timezone and reapproval decisions must be explicit                            |
| 2. Culinary planning              | Maintain ingredients/recipes/dishes, publish menus, and select event dishes                      | Culinary, Events                           | Decide Menu↔Dish composition and recipe publish completeness                  |
| 3. Demand, stock, and purchasing  | Turn event demand into stock position, reservations, purchase needs, vendor orders, and receipts | Inventory, Procurement                     | Slice 0; search/precision degradation must be visible                         |
| 4. Kitchen production and quality | Plan/claim/complete prep and batches; block/reinspect failed work                                | Production & quality, Culinary, Inventory  | Slice 0; dependency/quality behavior documented                               |
| 5. Staffing and time              | Declare availability, schedule/assign staff, check in/out, record time, verify qualifications    | Workforce, Events, Organization & identity | Role/coverage and recurring-availability gaps remain explicit                 |
| 6. Packing and delivery           | Build pack lists, resolve missing items, load, dispatch, deliver, and record incidents           | Logistics, Production & quality, Events    | Slice 0; no vehicle/return concepts without new source                        |
| 7. Commercial and billing         | Manage contacts, proposals, contracts, invoices, payments, and payment methods                   | Commercial & billing, Events               | Slice 0; proposal→event and contract→confirmation gaps remain manual/explicit |
| 8. Closeout and reporting         | Capture/finalize event closeout, prepare payroll inputs, save governed report definitions        | Closeout & reporting, all systems          | Stable upstream facts; aggregate capture behavior defined                     |
| 9. Service desk integration       | Replace placeholder Home with role-shaped attention, upcoming services, and verified readiness   | All shipping systems                       | Only queryable/verified facts may appear; no fake KPIs                        |

Current delivery status: Slice 1, Event planning foundation, Slice 2, Culinary planning, and the authored operator surfaces for Slice 3, Demand, stock, and purchasing, are shipped and documented in the owning system pages. Slice 3 keeps blocked automation and projected-number precision explicit; it does not mark the broader Slice 0 projection-safety backlog or downstream reactions complete.

## Slice composition rule

Implement a thin end-to-end outcome rather than an entire legacy area. A useful slice includes the owning catalog/list, one detail or working document, legal commands, and the cross-system handoff needed to make the outcome real. Capsule-Pro is intent evidence; its route count is not the unit of migration.

## Navigation rollout

Primary navigation should expose only coherent shipped workspaces. Planned canonical systems may appear in the overflow drawer with honest language. Remove legacy promises when the navigation slice is implemented; do not replace them with placeholders for every generated entity.
