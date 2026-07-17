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

## Primary workspace

Use a **client dossier and document pipeline**:

- Client context is stable while Contacts, Proposals, Contracts, Invoices, Payments, and PaymentMethods appear as distinct ruled sections;
- each document has one strong identity/status header, amounts in tabular rhythm, legal lifecycle actions, and Event linkage;
- “send,” “viewed,” “accept/sign,” “settle,” “refund,” “void,” and “write off” remain explicit governed transitions rather than decorative activity.

## Core workflows

- Add/update/select/remove ClientContacts.
- Draft/send/view/accept/decline/expire Proposals.
- Draft/send/view/sign/expire/void Contracts.
- Issue/send/view/apply payment/refund/overdue/void/write off Invoices.
- Record/process/settle/fail/refund Payments.
- Register/default/expire/reactivate/invalidate/remove PaymentMethods.

## Cross-system handoffs

Commercial documents link to Client and optional/required Event according to their canonical model. Settled Payment should apply to Invoice. Event cancellation should void eligible unpaid invoices. Proposal acceptance cannot currently create an Event, and Contract signing cannot confirm one; the UI must make those follow-up steps explicit rather than imply automation.

## States and permissions

Sales roles own contacts/offers/agreements; finance roles own billing/payment. Sensitive contact and payment hints must respect encryption/private contracts. Exact currency behavior must be verified before money-changing workflows ship.

## Current status

Generated queries and commands exist. No authored `/clients` or `/finance` commercial workspace exists. Manifest 3.6.12 output structurally dispatches Payment settlement through the governed Invoice command and Event cancellation through governed fan-out runners. Those consequences still require authenticated Convex runtime tests before the commercial workflow can be called end-to-end verified; exact currency behavior remains a separate release requirement.

## References

- Canonical: `C:/projects/Manifest-source/src/sales`
- Projection evidence: [projection-status.md](../generation/projection-status.md)
- Read-only intent reference: Capsule-Pro CRM, proposals, contracts, invoices, and payments
