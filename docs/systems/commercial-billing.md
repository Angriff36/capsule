# Commercial and billing

> Owns the CapsuleX operator experience for ClientContact, Proposal, Contract, Invoice, CreditMemo, Payment, and PaymentMethod. Client account identity is owned by [events.md](events.md).

## Purpose

Carry a client from contact and offer through agreement, invoice, payment, credit adjustment, refund, write-off, or void while keeping every commercial fact connected to the Client and, where applicable, the governed Event.

## Owned domain

| Source                                                  | Entities      |
| ------------------------------------------------------- | ------------- |
| `sales/contact.manifest`                                | ClientContact |
| `sales/proposal.manifest`                               | Proposal      |
| `sales/contract.manifest`                               | Contract      |
| `sales/invoice-core.manifest`, `sales/invoice.manifest` | Invoice       |
| `sales/credit-memo.manifest`                            | CreditMemo    |
| `sales/payment.manifest`                                | Payment       |
| `sales/payment-method.manifest`                         | PaymentMethod |

## Primary workspaces (Slice 7)

### Finance (`/finance`)

| Route                         | Outcome                                                              |
| ----------------------------- | -------------------------------------------------------------------- |
| `/finance/invoices`           | List + issue invoices; send / void / overdue actions                 |
| `/finance/invoices/:id`       | Invoice detail, balances, payments, and paid-invoice credit memos    |
| `/finance/payments`           | Record payment (optional stored method); begin processing / settle / fail |
| `/finance/payment-methods`    | Register / default / expire / reactivate / invalidate / remove methods |

**User outcome proven:** Issue invoice → send → record payment → settle → `PaymentSettled` applies `Invoice.applyPayment` so the invoice becomes `paid`. Finance can then issue a CreditMemo against that paid invoice and either apply it to another open invoice for the client or carry it forward as available account credit. PaymentMethod register → default → expire → reactivate → link `paymentMethodId` on Payment.record.

### Clients CRM (`/clients`) — Slice 7b

| Route                | Outcome                                                        |
| -------------------- | -------------------------------------------------------------- |
| `/clients`           | List + register clients; hide archived by default              |
| `/clients/:id`       | Account detail, contacts, archive/reactivate, Issue invoice deep link |
| `/clients/proposals` | Draft → send → mark viewed → accept/decline/expire             |
| `/clients/contracts` | Draft against Event → send → mark viewed → sign/expire/void    |

**User outcome proven (structural):** sales can register a Client, add ClientContacts, draft/send/accept a Proposal, and draft/send/sign a Contract against an existing Event. ProposalAccepted does **not** mint an Event; ContractSigned does **not** confirm one — UI copy makes those Events follow-ups explicit.

Roles: finance staff/managers (`financeAccess`) own invoice and payment commands. Sales (`salesAccess` / `salesManageAccess` for archive) owns Client / ClientContact / Proposal / Contract. Finance may **read** clients for billing pickers (`clientRead` includes `financeAccess`).

## Core workflows

**Shipped**

- Register / archive / reactivate Clients; change account contact channels
- Add / set-primary / remove ClientContacts
- Record dated call, email, and meeting notes against a ClientContact or Event
- Draft / send / mark viewed / accept / decline / expire Proposals
- Draft / send / mark viewed / sign / expire / void Contracts (requires Event)
- Issue / send / mark viewed / mark overdue / void / write off Invoices
- Configure per-invoice payment reminder offsets from the due date; sending an
  invoice schedules branded client emails with a current invoice PDF and fresh
  Stripe Checkout link. Each job rechecks the live balance and prior Checkout
  receipts before delivery, so paid, voided, written-off, replaced, or stale
  schedules do not send.
- Generate a shareable Stripe Checkout payment link per open invoice from the
  invoice detail page (copy button); "Check for payment" pulls paid Checkout
  sessions from Stripe and records them through governed `Payment.record` →
  `Payment.settle`, so the settlement reaction updates the invoice balance.
  Session ids and reconciliation state live in the `manifestEvents` ledger;
  command idempotency keys (`stripe-checkout/<sessionId>/…`) make re-checks safe.
  Inbound Stripe webhooks remain blocked (issue #52: generated Convex webhook
  verifier cannot parse Stripe's `t=…,v1=…` signature), so confirmation is
  pull-based until that lands.
- Issue CreditMemos against paid invoices; apply to a same-client open balance or carry forward as client credit
- Record / begin processing / settle / fail / refund Payments
- Payment settlement applies to Invoice via generated reaction
- Register / make-default / clear-default / expire / reactivate / invalidate / remove PaymentMethods; pick stored method when recording a payment
- Client account and signed Contract deep-link into `/finance/invoices?issue=1` with clientId/eventId prefill
- Accepted Proposal deep-links into `/events/new?clientId=` (manual Event create; OD035 still not automated)

**Known workflow gaps**

- Lead / ProposalLineItem (OD037)
- Automated ProposalAccepted → Event.create and ContractSigned → Event.confirm (Manifest OD035/OD038)

## Cross-system handoffs

Commercial documents link to Client and optional Event. Settled Payment applies to Invoice. Issued CreditMemo records against the paid source invoice and optionally applies to a same-client open target invoice in the same generated transaction; carry-forward credit remains available on the client account. Event cancellation voids eligible unpaid invoices (generated fan-out). Proposal acceptance cannot currently create an Event, and Contract signing cannot confirm one; the UI must make those follow-up steps explicit rather than imply automation.

Invoice reminder automation is an authored Convex delivery seam because its
per-invoice due dates are dynamic and its Stripe/Resend calls are outbound side
effects. Schedule configuration and delivery outcomes are recorded in the
`manifestEvents` ledger under the Invoice id. Jobs are registered through the
durable Convex scheduler when an invoice is sent or when finance updates its
schedule; generated `convex/crons.ts` remains Builder-owned.

## States and permissions

Sales roles own client registration and CRM documents; finance roles own billing/payment. Sensitive contact and payment hints must respect encryption/private contracts. Archive/reactivate require `salesManageAccess`.

## Proof

- Runtime: `tests/proofs/invoice-payment-lifecycle.runtime.test.ts`, `tests/proofs/payment-method-lifecycle.runtime.test.ts`
- Routes/lifecycle: `tests/finance-routes.test.ts`, `tests/clients-routes.test.ts`
- Integration guard: `tests/commercial-manifest-integration-guard.test.ts` (`bun run check:commercial-manifest`)
- Opaque FK Zod regression: Invoice/Payment schemas accept Convex document ids (`z.string().min(1)`)

## References

- Projection evidence: [projection-status.md](../generation/projection-status.md)
- Implementation sequence: [implementation-plan.md](../product/implementation-plan.md)
