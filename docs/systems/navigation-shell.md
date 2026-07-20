# Navigation shell

## Pieces

| Piece                    | Path                                                         |
| ------------------------ | ------------------------------------------------------------ |
| Shell layout             | `src/app/shell/AppShell.tsx`                                 |
| Sidebar                  | `src/app/shell/Sidebar.tsx`                                  |
| Topbar / command palette | `src/app/shell/Topbar.tsx`, `CommandPalette.tsx`             |
| Area catalog             | `src/app/nav.ts` + `src/app/navigation/NavigationCatalog.ts` |
| Planned areas            | `src/app/PlannedAreaPage.tsx`                                |

## Behavior

- `NAV_AREAS` defines primary rail entries (Operate / People / Business / System).
- Areas with `planned` render `PlannedAreaPage` instead of a feature module.
- Shipping Operate routes: Home (role-shaped attention ledger), Events, Kitchen, Inventory, Logistics. People/Business: Staff, Clients, Finance (invoices, payments, closeout, payroll). Reports and Facilities/Admin remain planned.
- Home (`/`) lists only queryable facts (upcoming services + open prep/packs/invoices/closeouts). No invented KPIs. [`index.md`](index.md) is the authority for which systems belong in CapsuleX.

## Target information architecture

- **Operate:** Home, Events, Kitchen, Inventory/Procurement, Logistics.
- **People:** Team and Workforce.
- **Business:** Clients/Commercial, Finance/Closeout, Reports.
- **System:** Organization/access surfaces backed by current Organization, Person, Clerk, and authored seams.

Only coherent shipping routes belong in the persistent icon rail. Canonical planned systems may live in the overflow drawer. Facilities, equipment/work orders, notifications, API keys, leads/deals, marketing, knowledge base, vehicles/returns, and other Capsule-Pro-only concepts must not appear as product promises without approved Manifest source.

## Rule

Add a product surface only after it has an owner in [`index.md`](index.md), a slice in [`../product/implementation-plan.md`](../product/implementation-plan.md), and a coherent authored `src/features/<slice>/` outcome. Then extend `NAV_AREAS`; do not invent parallel nav trees.
