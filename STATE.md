# Loop State — capsule

Last run: 2026-07-20T15:15:00Z (cross-slice: EventCloseout → Invoice issue)

## High Priority (loop is acting or waiting on human)

- **Closeout → Invoice deep link shipped locally (`6238bdc`) — not pushed**:
  `/finance/closeout` Issue invoice with clientId/eventId prefill.
  Push only when human authorizes.
- **Proposal → Event create deep link shipped locally (`ee6a94e`) — not pushed**:
  Accepted proposals stay visible; Create Event opens `/events/new?clientId=`.
  Push only when human authorizes.
- **Invoice → Client/Event backlinks shipped locally (`0e5bd98`) — not pushed**:
  `/finance/invoices/:id` shows source links. Push when authorized.
- **Client/Contract → Invoice deep link shipped locally (`680e0d6`) — not pushed**:
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
- **Slice 6 shipped locally (`679afd6` + `b74ca0d`) — not pushed**: Packing/delivery on
  Manifest 3.6.29. Push only when human authorizes.
- **All 6 Dependabot PRs blocked**: major upgrades need human risk decision.

## Watch List

- Working tree may still carry unrelated WIP — normal scale.
- Next: Event dossier → Invoice when EventDetail WIP clears; OD035/OD038 automation;
  report chart render.

## Recent Noise (ignored this run)

- Prior wake loop re-arming forbidden by this `/loop continue` invocation.
