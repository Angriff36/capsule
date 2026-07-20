# Loop State — capsule

Last run: 2026-07-20T15:00:00Z (cross-slice: Client/Contract → Invoice issue deep link)

## High Priority (loop is acting or waiting on human)

- **Client/Contract → Invoice deep link shipped locally — not pushed**:
  `/finance/invoices?issue=1&clientId=&eventId=`; signed contracts stay visible
  for billing. Push only when human authorizes.
- **PaymentMethod UI shipped locally (`9119692`) — not pushed**: `/finance/payment-methods`
  register→default→expire→reactivate; PaymentsPage can link `paymentMethodId`.
  Push only when human authorizes.
- **SavedReportDefinition `/reports` shipped locally (`bb2ffae`) — not pushed**:
  create → rename/share → archive → restore library (chart render deferred).
  Push only when human authorizes.
- **Slice 9 Home service desk shipped locally (`f2ec316`) — not pushed**: `/`
  attention ledger + upcoming services from queryable lists; role from
  `authStatus`. Push only when human authorizes.
- **Slice 8b PayrollInput shipped locally (`17a6b60`) — not pushed**: `/finance/payroll`
  prepare→finalize (minutes; encrypted money rates deferred). Push when authorized.
- **Slice 8 EventCloseout shipped locally (`3a7d5c6`) — not pushed**: `/finance/closeout`
  capture→finalize. Push only when human authorizes.
- **Slice 7b Clients CRM shipped locally (`800ca7d` + gate fix `37afcf8`) —
  not pushed**: `/clients` accounts, contacts, proposals, contracts.
  Ownership drift cleared; `bun run check` green. Push only when human
  authorizes.
- **Auth unblock 2026-07-20**: Local Convex stuck on schema validation — dishes still had stored
  `allergenSummary` after it was converted to computed. Restored stored `property allergenSummary`
  + `classifyAllergens` in `src/culinary/dish.manifest`, `bun run manifest:regen`, restarted
  `convex dev` → functions ready. Reload UI.
- **Slice 6 shipped locally (`679afd6` + `b74ca0d`) — not pushed**: Packing/delivery workspace on
  Manifest 3.6.29. Push only when human authorizes.
- **All 6 Dependabot PRs blocked**: typescript 5.9→7.0, vite 6.4→8.1, react-router-dom 6.30→7.18,
  react-dom, @vitejs/plugin-react 4.7→6.0, actions/checkout 4→7.0. Major version upgrades require
  human risk decision per safety.md.

## Watch List

- Working tree may still carry unrelated WIP — normal scale.
- `actions/checkout@v4` + Node 20 deprecation warnings — bump when convenient (blocked behind CI red).
- Next after PaymentMethod: OD035/OD038 automation still deferred; pick next incomplete
  cross-slice connection (e.g. Event→Invoice, proposal→event handoff copy, or chart render).

## Recent Noise (ignored this run)

- Prior manifest-ralph-minimax wake loop stopped (new loop forbids re-arming gate sweeps).
- Prior issues RESOLVED: bun install local dependency, Builder ownership drift (resolved by recent commits).
