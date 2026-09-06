# PR07 — Finish a client conversation in Capsule

_Serves JTBD(s):_ Sales — no inquiry dies in an inbox; clients — get a real answer without repeating their event details.

## Job Statement

Capture inquiries and send replies with visible delivery state from the same client/event conversation.

## Baseline and ownership

Draft requirements; shared contract: [production readiness](../../docs/product/production-readiness.md). Owners: `convex/messageInbox.ts`, `convex/emailNotifications.ts`, `convex/smsAlerts.ts`, `src/sales/client-communication.manifest`, and existing message/integration entities. Raw-envelope ingestion and transactional notification seams exist. The inbox code explicitly identifies signed provider ingress/OAuth as unfinished; JSON-paste ingestion alone does not prove a connected inbox. Issues #123/#34 describe historical gaps; inspect current consumers before declaring all email absent.

## Acceptance Criteria

- [ ] PR07-01: Connect a supported email or social account through the app; actual provider messages arrive with account/thread/message IDs, original timestamps, source, body/media references, and a linked or matchable client/lead.
- [ ] PR07-02: Repeated webhooks, polling overlap, pagination, and restart at a saved cursor create one message and no duplicate lead. Malformed or unsupported messages enter an inspectable retry queue with source evidence.
- [ ] PR07-03: Staff can read a conversation, link it to an event, reply, and see queued, provider-accepted, delivered where supported, bounced/failed, or unknown delivery state. A local queued record is not called sent.
- [ ] PR07-04: Outbound replies, proposal/invoice documents, and reminders use durable jobs with recipient, sender, template/revision, attachments, attempt count, and provider IDs. The exact published artifact is sent, not a later mutable draft.
- [ ] PR07-05: A crash after provider acceptance but before local receipt recovery cannot blindly resend. The worker uses the provider's idempotency/reconciliation mechanism or marks an uncertain result for safe reconciliation.
- [ ] PR07-06: Missing credentials, revoked authorization, delivery failure, and unsupported reply types show a specific remedy. Operators can retry failed work without resending already successful recipients or retyping the message.
- [ ] PR07-07: Consent, opt-out, enabled channels, recipient suppression, and applicable quiet-hour settings are checked at delivery time, including scheduled work. A preference change is respected across devices and queued jobs.
- [ ] PR07-08: Importing old messages/tasks records history only. It triggers no email, SMS, lead duplication, anniversary task, or overdue reminder unless the operator explicitly enables future automation for that record.
- [ ] PR07-09: Cross-tenant ingress credentials, forged callbacks, duplicate media, and private attachment references cannot expose or alter another account's conversation. Staff can see the failure without seeing secrets.

## Dependencies and proof

PR08 supplies provider connection/job semantics; PR12 supplies identity and attachment authorization. Prove an actual provider sandbox send/reply plus replay, token expiry, delivery failure, and disconnect. A sandbox is evidence of integration behavior, not live tenant configuration.

## Out of Scope

No product capability is excluded. Accounting sync is PR08; financial reminders use PR05's historical/live distinction.

## Open Questions

The organization must select and authorize its inbox/social accounts. Implement connection and recovery flows now; actual external delivery remains unverified until the selected account is connected and exercised.
