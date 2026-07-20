# Commercial and billing

> Owns the CapsuleX operator experience for ClientContact, Proposal, Contract, Invoice, Payment, and PaymentMethod. Client account identity is owned by [events.md](events.md).

## Purpose

Carry a client from contact and offer through agreement, invoice, payment, refund, write-off, or void while keeping every commercial fact connected to the Client and, where applicable, the governed Event.

## Owned domain

| Source                                                  | Entities      |
| ------------------------------------------------------- | ------------- |
| `sales/contact.manifest`                                | ClientContact |
| `sales/proposal.manifest`                               | Proposal      |
| `sales/contract.manifest`                               | Contract      |
| `sales/invoice-core.manifest`, `sales/invoice.manifest` | Invoice       |
| `sales/payment.manifest`                                | Payment       |
| `sales/payment-method.manifest`                         | PaymentMethod |

## Primary workspace (Slice 7 thin unit)

Shipped operator routes under **`/finance`**:

| Route                    | Outcome                                              |
| ------------------------ | ---------------------------------------------------- |
| `/finance/invoices`      | List + issue invoices; send / void / overdue actions |
| `/finance/invoices/:id`  | Invoice detail, balance, related payments            |
| `/finance/payments`      | Record payment; begin processing / settle / fail     |

**User outcome proven:** Issue invoice → send → record payment → settle → `PaymentSettled` applies `Invoice.applyPayment` so the invoice becomes `paid`.

Roles: finance staff/managers (`financeAccess`) own invoice and payment commands. Sales still registers clients; finance may **read** clients for billing pickers (`clientRead` includes `financeAccess`).

## Core workflows (shipped vs deferred)

**Shipped in this slice**

- Issue / send / mark viewed / mark overdue / void / write off Invoices
- Record / begin processing / settle / fail / refund Payments
- Payment settlement applies to Invoice via generated reaction

**Still deferred (honest gaps)**

- ClientContact / Proposal / Contract authored CRM workspace (`/clients` remains planned)
- PaymentMethod register/default/expire UI
- Proposal acceptance → Event creation and Contract signing → confirmation remain manual follow-ups

## Cross-system handoffs

Commercial documents link to Client and optional Event. Settled Payment applies to Invoice. Event cancellation voids eligible unpaid invoices (generated fan-out). Proposal acceptance cannot currently create an Event, and Contract signing cannot confirm one; the UI must make those follow-up steps explicit rather than imply automation.

## States and permissions

Sales roles own client registration and CRM documents; finance roles own billing/payment. Sensitive contact and payment hints must respect encryption/private contracts.

## Proof

- Runtime: `tests/proofs/invoice-payment-lifecycle.runtime.test.ts`
- Routes/lifecycle: `tests/finance-routes.test.ts`
- Integration guard: `tests/commercial-manifest-integration-guard.test.ts` (`bun run check:commercial-manifest`)
- Opaque FK Zod regression: Invoice/Payment schemas accept Convex document ids (`z.string().min(1)`)

## References

- Projection evidence: [projection-status.md](../generation/projection-status.md)
- Implementation sequence: [implementation-plan.md](../product/implementation-plan.md)
