# PR05-PR08 commercial production-readiness gap audit

Audit date: 2026-09-06  
Audited source: `cf232680731131b5500ca296ae214e36d52bd521` on `docs/production-gap-plan-20260906`  
Scope: bounded source-and-test audit for PR05-PR08 only. This is the next implementation plan; it does not authorize implementation, import activation, provider-account calls, environment changes, or deployment.

## Audit conclusion

The commercial spine is real but not yet production-qualified. Native invoices, payments, credit memos, proposal revisions, internal acceptance, event projection, Stripe Checkout polling, invoice-reminder email, QBO sync, Google Calendar sync, and Twilio alerts all have substantive implementations. The remaining work is not a commercial rewrite: it is historical-finance classification/reconciliation, native money edge cases and invoice numbering, explicit booking lifecycle/payment qualification, connected conversation transport, and provider ownership/cutover/recovery.

Two findings from the 2026-09-05 requirements baseline are now stale and are deliberately **not** relisted as open gaps:

- Proposal templates now initialize editable drafts and persist through immutable revisions, shared rendering, and PDF projection (`C:\projects\capsule-release-20260905\src\features\clients\ProposalCreateForm.tsx:187`, `C:\projects\capsule-release-20260905\convex\lib\proposalRevision.ts:336`, `C:\projects\capsule-release-20260905\src\features\clients\proposalPdfProjection.ts:41`).
- External inbox replies no longer create a queued row or claim delivery when no sender exists; the draft is preserved for manual copy (`C:\projects\capsule-release-20260905\src\features\sales\deliveryHonesty.ts:6`, `C:\projects\capsule-release-20260905\tests\features\sales\message-inbox-delivery.test.ts:111`).

Branding also exists today: an organization can configure its display name, address, colors, and Clerk logo (`C:\projects\capsule-release-20260905\src\features\admin\BrandingPage.tsx:123`, `C:\projects\capsule-release-20260905\src\features\admin\tenantBranding.ts:44`). The confirmed residual defect is narrower: a proposal revision can still freeze the generic string `Tenant` when no live organization row exists (`C:\projects\capsule-release-20260905\convex\lib\proposalRevision.ts:234`), while PDF rendering can fall back to `Catering company` (`C:\projects\capsule-release-20260905\src\features\admin\tenantBranding.ts:56`). Do not describe Capsule as having no branding; remove generic client-facing fallbacks from the publish boundary without blocking unrelated proposal editing.

### Classification legend

- **missing** — no owning behavior for the criterion was found.
- **partial** — a useful slice exists, but an observable requirement is absent.
- **implemented-unverified** — the apparent implementation exists, but the criterion lacks its required end-to-end or external proof.
- **configuration-blocked** — the implementation exists and the remaining qualification requires an authorized provider account/credential or entitlement.
- **verified (scope)** — named behavior is proved only within the stated source/runtime/UI-test scope, not as a production certification.

## Provider truth

| Capability | Current truth | Qualification boundary |
| --- | --- | --- |
| Invoice reminders | Real Stripe Checkout and Resend HTTP calls with provider idempotency keys exist (`C:\projects\capsule-release-20260905\convex\invoiceReminders.ts:574`, `C:\projects\capsule-release-20260905\convex\invoiceReminders.ts:616`). | `RESEND_API_KEY`, sender, Stripe key, app URL, and an authorized account were not inspected; production delivery is unverified (`C:\projects\capsule-release-20260905\convex\invoiceReminders.ts:221`). |
| High-urgency staff SMS | Real Twilio REST delivery exists (`C:\projects\capsule-release-20260905\convex\lib\twilio.ts:60`) and the scan records sent/failed outcomes (`C:\projects\capsule-release-20260905\convex\smsAlerts.ts:402`). | Credential state and a real send were not inspected; this is not conversation reply transport. |
| Inbox replies | The repaired UI correctly says no external provider is connected and creates no false outbound record (`C:\projects\capsule-release-20260905\src\features\sales\deliveryHonesty.ts:6`). | Signed ingress/OAuth and an outbound conversation sender are genuinely missing (`C:\projects\capsule-release-20260905\convex\messageInbox.ts:276`). |
| QBO / Calendar / Stripe Connect | Real provider clients, OAuth/onboarding, status, sync, and disconnect seams exist (`C:\projects\capsule-release-20260905\convex\qboSync.ts:255`, `C:\projects\capsule-release-20260905\convex\googleCalendar.ts:380`, `C:\projects\capsule-release-20260905\convex\stripeConnect.ts:177`). | Account credentials, entitlements, sandbox behavior, and production results were not inspected. QBO also has material payload gaps; Calendar is primarily qualification-blocked. |
| Nowsta | Only provider enum/data placeholders were found (`C:\projects\capsule-release-20260905\src\integrations\integration-connection.manifest:16`, `C:\projects\capsule-release-20260905\src\sales\payment.manifest:30`). | This is missing implementation, not merely missing credentials. |

## PR05 — Financial truth

### PR05-01 — missing

- **Docs claim:** Every source row is classified by financial meaning, and overlapping reports cannot double-post (`C:\projects\capsule-release-20260905\specs\ralph\production-05-financial-truth.md:19`).
  - **Real-world example (Docs claim):** A payment export and a monthly aggregate containing the same cash are identified as overlapping evidence, not two receipts.
- **Implementation:** The payment importer parses only a payments dataset and stages each row as an untyped reconciliation reference; no financial-row taxonomy or overlap graph was found (`C:\projects\capsule-release-20260905\convex\importCommit.ts:1055`).
  - **Real-world example (Implementation):** A refund-shaped negative row can be retained in raw JSON, but Capsule does not yet identify it as a refund versus an adjustment or report total.

### PR05-02 — partial

- **Docs claim:** Reference mode retains positive, zero, and negative entries with identity/date/type, gives every row a result, and excludes references from ledger totals (`C:\projects\capsule-release-20260905\specs\ralph\production-05-financial-truth.md:20`).
  - **Real-world example (Docs claim):** A `-25.00` source adjustment remains visible as reference-only and never reduces live receivables until reconciled.
- **Implementation:** Imported payments intentionally become `pending_conflict` `ExternalRecordLink` rows rather than `Payment` rows, which protects live totals, but classification/result coverage for nonpositive entries is not proved (`C:\projects\capsule-release-20260905\convex\importCommit.ts:49`, `C:\projects\capsule-release-20260905\convex\importCommit.ts:1097`).
  - **Real-world example (Implementation):** Retrying an already staged source payment skips the existing link, but the operator cannot yet see a typed disposition for every adjustment row.

### PR05-03 — missing

- **Docs claim:** Reconstruction previews links, invoice identity, currency, line/tax/service/deposit/credit detail, dates, balances, and visible unknowns (`C:\projects\capsule-release-20260905\specs\ralph\production-05-financial-truth.md:21`).
  - **Real-world example (Docs claim):** A source invoice without taxable line detail previews an unresolved detail warning instead of a fabricated catering line.
- **Implementation:** No reconstruction preview or commit mode exists. The current importer explicitly says there is no invoice dataset and retains the external invoice ID only in raw source data (`C:\projects\capsule-release-20260905\convex\importCommit.ts:1118`).
  - **Real-world example (Implementation):** Staff can match a staged reference to an existing Capsule payment, but cannot preview a reconstructed historical invoice.

### PR05-04 — partial

- **Docs claim:** Source numbers remain traceable; native numbers are human-readable and unique in a documented scope; retries and lifecycle reactions do not duplicate placeholders (`C:\projects\capsule-release-20260905\specs\ralph\production-05-financial-truth.md:22`).
  - **Real-world example (Docs claim):** Re-approving an event reuses its invoice, and the stored invoice number is a stable operator-facing value.
- **Implementation:** `invoiceNumber` is unique and Event approval uses match-or-create, but the cascade stores the raw event ID as the invoice number and the UI merely disguises it as a short display reference (`C:\projects\capsule-release-20260905\src\sales\invoice-core.manifest:30`, `C:\projects\capsule-release-20260905\src\sales\invoice.manifest:8`, `C:\projects\capsule-release-20260905\src\features\finance\invoiceNumberDisplay.ts:4`). Numbering scope and concurrent replay proof remain absent.
  - **Real-world example (Implementation):** An invoice can display as `INV-8BD5QP` while its persisted number is still an opaque event document ID.

### PR05-05 — partial

- **Docs claim:** Payments, fees, partial allocations, overpayments, returns/chargebacks, refunds, and credits produce traceable balances (`C:\projects\capsule-release-20260905\specs\ralph\production-05-financial-truth.md:23`).
  - **Real-world example (Docs claim):** `100.00 + 900.00` settles a `1,000.00` invoice while a `3.50` processor fee remains separate.
- **Implementation:** Invoice payment, refund, and credit commands update balances deterministically (`C:\projects\capsule-release-20260905\src\sales\invoice-core.manifest:195`, `C:\projects\capsule-release-20260905\src\sales\invoice-core.manifest:278`, `C:\projects\capsule-release-20260905\src\sales\invoice-core.manifest:324`), but the Payment owner explicitly lacks chargeback, partial-refund, and accepted-not-applied states; overpayment is rejected rather than held as credit (`C:\projects\capsule-release-20260905\src\sales\payment.manifest:1`, `C:\projects\capsule-release-20260905\src\sales\invoice-core.manifest:199`).
  - **Real-world example (Implementation):** A normal partial payment works, but an ACH return cannot be represented without rewriting or overloading a different status.

### PR05-06 — partial

- **Docs claim:** All money surfaces share deterministic smallest-unit rounding with no hidden tolerance (`C:\projects\capsule-release-20260905\specs\ralph\production-05-financial-truth.md:24`).
  - **Real-world example (Docs claim):** Invoice, statement, aging, and report totals agree to the cent after allocations and currency conversion.
- **Implementation:** Manifest money fields and invoice invariants use explicit precision, while functional-currency computed values round to six places (`C:\projects\capsule-release-20260905\src\sales\invoice-core.manifest:63`, `C:\projects\capsule-release-20260905\src\sales\invoice-core.manifest:86`). Stripe converts with `Math.round(amountDue * 100)` (`C:\projects\capsule-release-20260905\convex\invoicePayments.ts:295`), but no cross-surface reconciliation proof covers statements, aging, tax, allocations, and reports together.
  - **Real-world example (Implementation):** Checkout receives integer cents, but this audit cannot show the same invoice closes to the identical cent in every reporting surface.

### PR05-07 — partial

- **Docs claim:** Stable exact IDs auto-reconcile; ambiguous matches remain suggestions; authorized resolutions are reusable and one transaction cannot allocate twice (`C:\projects\capsule-release-20260905\specs\ralph\production-05-financial-truth.md:25`).
  - **Real-world example (Docs claim):** The same provider transaction ID is automatically recognized on replay, while an amount/date/name near-match waits for staff.
- **Implementation:** Payment can store an external source and ID (`C:\projects\capsule-release-20260905\src\sales\payment.manifest:222`), and import links dedupe exact source IDs. The UI match path only changes the link target and resolves the conflict; it does not call `Payment.markMatched`, record a reusable match rule, distinguish suggestions, or prove double-allocation exclusion (`C:\projects\capsule-release-20260905\src\features\admin\import\ExternalRecordsReconcilePage.tsx:183`).
  - **Real-world example (Implementation):** A staff member can point a TPP reference at a payment, but the payment ledger itself may remain `unreconciled`.

### PR05-08 — partial

- **Docs claim:** Historical reconstruction is effect-free, while ordinary native invoice delivery/payment remains usable (`C:\projects\capsule-release-20260905\specs\ralph\production-05-financial-truth.md:26`).
  - **Real-world example (Docs claim):** Importing a 2019 paid invoice does not email the client, create a QBO invoice, or schedule a reminder.
- **Implementation:** Reference import is currently safe because it creates no invoice/payment at all (`C:\projects\capsule-release-20260905\convex\importCommit.ts:49`), and ordinary reminders have a real provider path (`C:\projects\capsule-release-20260905\convex\invoiceReminders.ts:616`). No reconstruction mode exists, so archival flags and suppression at a future ledger-write boundary are unimplemented.
  - **Real-world example (Implementation):** Today's reference link cannot send anything, but that does not prove a later reconstructed archival invoice would be excluded from QBO/reminder selectors.

### PR05-09 — partial

- **Docs claim:** Corrections preserve original records/reasons and distinguish source-effective time, import time, and accounting-effective time (`C:\projects\capsule-release-20260905\specs\ralph\production-05-financial-truth.md:27`).
  - **Real-world example (Docs claim):** Voiding an empty placeholder preserves who did it, why, the original invoice, and the historical effective date.
- **Implementation:** Void/refund/credit commands preserve the record plus reason and event history (`C:\projects\capsule-release-20260905\src\sales\invoice-core.manifest:278`, `C:\projects\capsule-release-20260905\src\sales\invoice-core.manifest:366`, `C:\projects\capsule-release-20260905\src\sales\credit-memo.manifest:67`), while import raw data preserves source dates. No common model separates source-effective, accounting-effective, and operational import timestamps.
  - **Real-world example (Implementation):** Finance can explain a native void, but cannot yet post a historical correction into its original period without confusing it with import time.

### PR05-10 — partial

- **Docs claim:** A saved, drillable report ties source and ledger totals by period/status/currency, and incomplete cost never becomes known profit (`C:\projects\capsule-release-20260905\specs\ralph\production-05-financial-truth.md:28`).
  - **Real-world example (Docs claim):** Clicking a monthly discrepancy reveals the source rows and ledger rows that differ.
- **Implementation:** The finance presentation explicitly keeps zero-cost draft closeouts in an `awaiting reconciliation` state and tests that profit remains pending (`C:\projects\capsule-release-20260905\src\features\finance\eventCostSummary.ts:127`, `C:\projects\capsule-release-20260905\tests\finance-money-truth.test.ts:169`). No saved source-to-ledger reconciliation report or discrepancy drill-down was found.
  - **Real-world example (Implementation):** A paid event with missing costs avoids a false 100% margin, but staff still cannot save and revisit a period tie-out.

## PR06 — Booking handoff

### PR06-01 — partial

- **Docs claim:** Public menu, quote, internal proposal, PDF, acceptance, and portal share effective sell-price/eligibility rules without leaking internal facts (`C:\projects\capsule-release-20260905\specs\ralph\production-06-booking-handoff.md:15`).
  - **Real-world example (Docs claim):** The same dish/package has the same eligible sell price on a phone quote, proposal PDF, and accepted portal document.
- **Implementation:** Publication snapshots resolve eligible catalog prices and omit foreign/inactive prices (`C:\projects\capsule-release-20260905\convex\lib\proposalRevision.ts:267`), and PDFs use immutable snapshot projection. The anonymous quote captures service style/occasion plus free-text menu preferences, not the same structured menu/package/pricing graph (`C:\projects\capsule-release-20260905\convex\quoteBuilder.ts:173`).
  - **Real-world example (Implementation):** A published proposal can freeze a real menu price, but the self-service quote cannot yet select that priced menu item through the same rule.

### PR06-02 — partial

- **Docs claim:** One structured submission carries selections, quantities, enhancements, attribution, consent, and assumptions into sales; retries finish missing work without duplicates (`C:\projects\capsule-release-20260905\specs\ralph\production-06-booking-handoff.md:16`).
  - **Real-world example (Docs claim):** A prospect chooses a package enhancement once and the sales proposal receives it after a retry.
- **Implementation:** Quote retries reuse checkpointed client/lead/event/proposal IDs (`C:\projects\capsule-release-20260905\convex\quoteBuilder.ts:483`, `C:\projects\capsule-release-20260905\tests\proofs\quote-conversion.runtime.test.ts:472`), but menu preferences and dietary needs are flattened into notes/service requirements; enhancement, attribution, consent, and estimate-assumption structures are absent.
  - **Real-world example (Implementation):** A failed event step can resume without duplicating the lead, but sales still must interpret the prospect's free-text menu request.

### PR06-03 — partial

- **Docs claim:** Staff start from native/imported events, choose a real branded template, reorder sections, preview, publish, and share without placeholder branding (`C:\projects\capsule-release-20260905\specs\ralph\production-06-booking-handoff.md:17`).
  - **Real-world example (Docs claim):** An imported wedding becomes a client-ready proposal using the tenant's actual brand and chosen section order.
- **Implementation:** The deployed wiring repair connects template defaults to draft/public/PDF artifacts (`C:\projects\capsule-release-20260905\src\features\clients\ProposalCreateForm.tsx:187`, `C:\projects\capsule-release-20260905\tests\proofs\proposal-template-publication.runtime.test.ts:13`). Existing branding is configurable, but section visibility is not a general reorder flow, and a missing organization can still freeze `Tenant` or render `Catering company` (`C:\projects\capsule-release-20260905\convex\lib\proposalRevision.ts:248`, `C:\projects\capsule-release-20260905\src\features\admin\tenantBranding.ts:56`).
  - **Real-world example (Implementation):** A configured tenant gets its real name (proved at `C:\projects\capsule-release-20260905\tests\proofs\proposal-event-booking.runtime.test.ts:578`); an incompletely provisioned tenant can still publish a generic name.

### PR06-04 — implemented-unverified

- **Docs claim:** Shares/signatures bind immutable revisions; revocation, expiry, supersession, and repeated acceptance have explicit idempotent outcomes (`C:\projects\capsule-release-20260905\specs\ralph\production-06-booking-handoff.md:18`).
  - **Real-world example (Docs claim):** Editing the catalog after publication never changes the document the client accepted.
- **Implementation:** Revisions freeze pricing, terms, selections, timeline, and venue (`C:\projects\capsule-release-20260905\convex\lib\proposalRevision.ts:336`); proposal/signature status models include expiry, revocation, supersession, and internal re-click recovery (`C:\projects\capsule-release-20260905\src\sales\proposal.manifest:82`, `C:\projects\capsule-release-20260905\src\sales\signature-request.manifest:14`, `C:\projects\capsule-release-20260905\convex\signatureAcceptance.ts:142`). Runtime/renderer proofs exist, but the full revoked/expired/superseded/concurrent share matrix and actual mobile flow are not qualified.
  - **Real-world example (Implementation):** A tested published PDF stays frozen after live edits, but this audit cannot certify every stale-link outcome in the real browser.

### PR06-05 — missing

- **Docs claim:** Imported acceptance is historical evidence, never a fabricated signature or bypass of revision capture (`C:\projects\capsule-release-20260905\specs\ralph\production-06-booking-handoff.md:19`).
  - **Real-world example (Docs claim):** A TPP `accepted` status displays as historical source evidence, not “signed in Capsule.”
- **Implementation:** Import preserves event source status in raw link data, but no imported proposal-acceptance disposition/revision path was found; the current signature path represents native/internal or future external signatures (`C:\projects\capsule-release-20260905\convex\importCommit.ts:39`, `C:\projects\capsule-release-20260905\src\sales\signature-request.manifest:1`).
  - **Real-world example (Implementation):** Historical acceptance can remain attached as evidence, but it cannot yet appear as a typed, reproducible accepted commercial snapshot.

### PR06-06 — partial

- **Docs claim:** Quote, sales lock, confirmed, execution, final, completion, cancellation, archive, and reopen map explicitly to the canonical lifecycle without duplicating actuals (`C:\projects\capsule-release-20260905\specs\ralph\production-06-booking-handoff.md:20`).
  - **Real-world example (Docs claim):** “Confirmed” has one business meaning and does not merely rename an already executing event.
- **Implementation:** Event has an explicit quote-to-closeout transition graph and separate sales-lock commands (`C:\projects\capsule-release-20260905\src\operations\event.manifest:655`, `C:\projects\capsule-release-20260905\src\operations\event.manifest:1048`). There is no `confirmed` stage, and cancelled/closed-out states have no reopen transition; the accepted definition must be located before changing the graph.
  - **Real-world example (Implementation):** Staff can move Approved → Sales lock → Executing, but cannot point to a canonical Confirmed or Reopened event outcome.

### PR06-07 — partial

- **Docs claim:** Booking projects guest count, style, venue/logistics, menu, timeline, and enhancements exactly once while field staff avoid sales-price access (`C:\projects\capsule-release-20260905\specs\ralph\production-06-booking-handoff.md:21`).
  - **Real-world example (Docs claim):** The service crew sees the agreed 120 guests, load-in, timeline, and menu without seeing margin.
- **Implementation:** The accepted-proposal seam atomically creates/links the event and idempotently copies menu selections (`C:\projects\capsule-release-20260905\convex\lib\proposalEventCreation.ts:109`); tests prove no duplicate event and that enhancements remain reachable (`C:\projects\capsule-release-20260905\tests\proofs\proposal-event-booking.runtime.test.ts:289`, `C:\projects\capsule-release-20260905\tests\proofs\proposal-event-booking.runtime.test.ts:651`). No complete projection proof covers timeline, service-style/logistics, enhancements, and field-role read boundaries together.
  - **Real-world example (Implementation):** Menu lines reach the event once, but the test suite does not prove the entire accepted service brief reaches a field employee.

### PR06-08 — implemented-unverified

- **Docs claim:** Managers can make live substitutions/86s/instruction/quantity changes without rewriting the accepted snapshot or reopening the event (`C:\projects\capsule-release-20260905\specs\ralph\production-06-booking-handoff.md:22`).
  - **Real-world example (Docs claim):** A sold-out dish becomes zero servings during execution while the accepted proposal remains intact.
- **Implementation:** EventDish permits manager serving changes (including zero), instruction edits, and removal through executing, while proposal revisions are separate immutable JSON (`C:\projects\capsule-release-20260905\src\culinary\event-dish.manifest:122`, `C:\projects\capsule-release-20260905\src\culinary\event-dish.manifest:179`, `C:\projects\capsule-release-20260905\src\culinary\event-dish.manifest:251`). Runtime proof covers authorized/denied serving adjustment, but not the complete mounted live-substitution and financial-consequence journey (`C:\projects\capsule-release-20260905\tests\proofs\proposal-event-booking.runtime.test.ts:708`).
  - **Real-world example (Implementation):** An owner can adjust a booked dish after acceptance without changing the snapshot, but the replacement-dish UX and any price correction are not qualified end to end.

### PR06-09 — partial

- **Docs claim:** Mobile deposit/balance payment shows honest pending/success/failure after provider confirmation and is replay-safe (`C:\projects\capsule-release-20260905\specs\ralph\production-06-booking-handoff.md:23`).
  - **Real-world example (Docs claim):** Refreshing after Stripe accepts a deposit cannot charge or allocate it twice.
- **Implementation:** Staff-side backend actions create a real connected-account Checkout Session and poll it; stable session keys make payment record/settlement replay-safe (`C:\projects\capsule-release-20260905\convex\invoicePayments.ts:285`, `C:\projects\capsule-release-20260905\convex\invoicePayments.ts:361`). The public client portal only displays invoice/deposit facts and document downloads; it has no public-token payment action/status journey (`C:\projects\capsule-release-20260905\convex\clientPortal.ts:243`, `C:\projects\capsule-release-20260905\src\features\clientPortal\ClientPortalPage.tsx:465`).
  - **Real-world example (Implementation):** Finance can prepare and reconcile a Checkout link, but a client cannot complete and verify the balance from the portal.

### PR06-10 — missing

- **Docs claim:** The whole mobile inquiry-to-payment flow survives refresh, revocation, concurrency, provider failure, and cross-tenant attempts (`C:\projects\capsule-release-20260905\specs\ralph\production-06-booking-handoff.md:24`).
  - **Real-world example (Docs claim):** A client accepts, refreshes, pays once, and sees the settled balance; a disconnected provider never shows success.
- **Implementation:** Separate runtime proofs cover quote conversion, proposal booking, and native invoice/payment lifecycle (`C:\projects\capsule-release-20260905\tests\proofs\quote-to-booked-event.runtime.test.ts:1`, `C:\projects\capsule-release-20260905\tests\proofs\proposal-event-booking.runtime.test.ts:185`, `C:\projects\capsule-release-20260905\tests\proofs\invoice-payment-lifecycle.runtime.test.ts:54`). No single mounted/mobile/provider-failure journey crosses all boundaries.
  - **Real-world example (Implementation):** Each domain seam can pass alone while the real client still reaches a portal with no payment action.

## PR07 — Communication delivery

### PR07-01 — missing

- **Docs claim:** A supported email/social account connects in-app and real provider messages arrive with stable identities, timestamps, body/media, and client/lead matching (`C:\projects\capsule-release-20260905\specs\ralph\production-07-communication-delivery.md:15`).
  - **Real-world example (Docs claim):** A new email inquiry appears automatically in Capsule with its provider thread/message IDs.
- **Implementation:** The provider-neutral ingestion action accepts normalized data, but the source explicitly states signed webhook delivery and provider OAuth are not built; the shipped UI supports manual/pasted ingestion (`C:\projects\capsule-release-20260905\convex\messageInbox.ts:276`, `C:\projects\capsule-release-20260905\src\features\sales\MessageInboxPage.tsx:384`). Media references are not part of the ingest contract.
  - **Real-world example (Implementation):** Staff can paste an email envelope, but receiving the email does not itself create a Capsule conversation.

### PR07-02 — partial

- **Docs claim:** Webhook/poll overlap, pagination, cursor restart, and replay create one message/lead; malformed work is inspectable and retryable (`C:\projects\capsule-release-20260905\specs\ralph\production-07-communication-delivery.md:16`).
  - **Real-world example (Docs claim):** Replaying the same page after a worker restart neither duplicates a message nor loses the cursor.
- **Implementation:** Thread/message keys dedupe concurrent normalized ingest, qualification has a stable key, and malformed envelopes enter `SyncError` (`C:\projects\capsule-release-20260905\convex\messageInbox.ts:69`, `C:\projects\capsule-release-20260905\convex\messageInbox.ts:228`, `C:\projects\capsule-release-20260905\convex\messageInbox.ts:418`). There is no polling/webhook adapter, pagination cursor, or restart worker; identical concurrent error rows can still duplicate by documented design (`C:\projects\capsule-release-20260905\convex\messageInbox.ts:119`).
  - **Real-world example (Implementation):** Two normalized deliveries share one message, but Capsule cannot resume a provider mailbox page after a crash.

### PR07-03 — partial

- **Docs claim:** Staff read, event-link, reply, and see provider-grounded queued/accepted/delivered/bounced/failed/unknown status (`C:\projects\capsule-release-20260905\specs\ralph\production-07-communication-delivery.md:17`).
  - **Real-world example (Docs claim):** A reply moves from queued to provider accepted, then bounce, without ever calling a local row “sent” early.
- **Implementation:** Reading, lead linkage, internal notes, and the repaired no-provider honesty are implemented and UI-tested (`C:\projects\capsule-release-20260905\src\features\sales\deliveryHonesty.ts:6`, `C:\projects\capsule-release-20260905\tests\features\sales\message-inbox-delivery.test.ts:79`). `MessageThread` has contact/lead but no event relationship, and external reply transport/status receipts are absent (`C:\projects\capsule-release-20260905\src\sales\message-thread.manifest:36`).
  - **Real-world example (Implementation):** Staff can copy a preserved email draft and see that a legacy queued row was not delivered, but cannot send or inspect a provider receipt in Capsule.

### PR07-04 — partial

- **Docs claim:** Replies, proposal/invoice documents, and reminders use durable jobs carrying recipient/sender/revision/attachments/attempt/provider IDs (`C:\projects\capsule-release-20260905\specs\ralph\production-07-communication-delivery.md:18`).
  - **Real-world example (Docs claim):** A proposal job sends the exact published revision and remains inspectable across retries.
- **Implementation:** Invoice reminders are a genuine scheduled Resend job with provider IDs/idempotency and a generated branded PDF (`C:\projects\capsule-release-20260905\convex\invoiceReminders.ts:616`, `C:\projects\capsule-release-20260905\convex\invoiceReminders.ts:701`). Proposal publication and initial invoice “sent” are honestly local/manual states after the repair; replies and general documents lack a durable delivery owner (`C:\projects\capsule-release-20260905\tests\delivery-honesty.test.ts:71`).
  - **Real-world example (Implementation):** A configured reminder can really email a fixed invoice artifact, while “Publish proposal” does not email anyone.

### PR07-05 — partial

- **Docs claim:** Recovery after provider acceptance never blindly resends; provider idempotency/reconciliation or an explicit uncertain state decides the outcome (`C:\projects\capsule-release-20260905\specs\ralph\production-07-communication-delivery.md:19`).
  - **Real-world example (Docs claim):** A crash after a provider returns 202 results in receipt lookup, not an automatic duplicate email.
- **Implementation:** Invoice reminders use stable Stripe and Resend idempotency keys and ledger events (`C:\projects\capsule-release-20260905\convex\invoiceReminders.ts:574`, `C:\projects\capsule-release-20260905\convex\invoiceReminders.ts:658`). No corresponding conversation worker, provider lookup, or uncertain/dead-letter state exists.
  - **Real-world example (Implementation):** Reminder replay is bounded by a stable key, but a future inbox sender has no recovery contract yet.

### PR07-06 — partial

- **Docs claim:** Credentials, revoked auth, failure, and unsupported types show remedies; retry affects only unfinished recipients without retyping (`C:\projects\capsule-release-20260905\specs\ralph\production-07-communication-delivery.md:20`).
  - **Real-world example (Docs claim):** Reconnecting an expired mailbox token resumes one failed message while successful recipients stay untouched.
- **Implementation:** Existing provider seams return specific missing-env messages, and inbox manual-copy preserves the draft (`C:\projects\capsule-release-20260905\convex\invoiceReminders.ts:221`, `C:\projects\capsule-release-20260905\convex\lib\twilio.ts:25`, `C:\projects\capsule-release-20260905\src\features\sales\deliveryHonesty.ts:8`). Connected mailbox authorization, recipient-level retry, and unsupported-reply remediation do not exist.
  - **Real-world example (Implementation):** Operators see which Twilio variables are absent, but cannot reconnect an expired email inbox because there is no inbox connection.

### PR07-07 — partial

- **Docs claim:** Consent, opt-out, enabled channel, suppression, and quiet-hour policy are rechecked at delivery time across devices and queued jobs (`C:\projects\capsule-release-20260905\specs\ralph\production-07-communication-delivery.md:21`).
  - **Real-world example (Docs claim):** A client opting out after a reminder is queued prevents that send.
- **Implementation:** Staff Twilio alerts require current opt-in/active person/phone checks, and user email-notification categories have a server-side subscription gate (`C:\projects\capsule-release-20260905\convex\smsAlerts.ts:315`, `C:\projects\capsule-release-20260905\convex\emailNotifications.ts:17`). These are staff/product notification preferences, not client conversation consent; no client opt-out, recipient suppression, or quiet-hour contract was found.
  - **Real-world example (Implementation):** A staff member who disables urgent SMS is skipped, but a client email reply has no equivalent delivery-time preference check.

### PR07-08 — missing

- **Docs claim:** Imported messages/tasks remain history-only unless future automation is explicitly enabled (`C:\projects\capsule-release-20260905\specs\ralph\production-07-communication-delivery.md:22`).
  - **Real-world example (Docs claim):** Importing an old overdue task does not immediately email the client.
- **Implementation:** The importer supports contacts/events/leads/payments/menus/pack lists/venues, not a message/task dataset (`C:\projects\capsule-release-20260905\convex\importCommit.ts:84`). Therefore there is no historical communication disposition or activation boundary to qualify.
  - **Real-world example (Implementation):** Old evidence may remain attached/raw, but it cannot become a normal searchable historical conversation with explicit automation state.

### PR07-09 — partial

- **Docs claim:** Tenant-scoped credentials, signed callbacks, media dedupe, and private attachments resist forgery/cross-tenant disclosure while surfacing safe errors (`C:\projects\capsule-release-20260905\specs\ralph\production-07-communication-delivery.md:23`).
  - **Real-world example (Docs claim):** A forged webhook cannot insert a message or fetch another tenant's attachment.
- **Implementation:** Normalized ingest relies on auth-scoped generated queries/commands and scopes thread dedupe by provider account (`C:\projects\capsule-release-20260905\convex\messageInbox.ts:167`); separate file-storage runtime proof covers attachment ownership (`C:\projects\capsule-release-20260905\tests\proofs\file-storage-ownership.runtime.test.ts:117`). There is no signed provider ingress, credential owner, media model/dedupe, or conversation-specific forged/cross-tenant proof.
  - **Real-world example (Implementation):** A signed-in tenant's manual ingest stays within its query scope, but there is no public callback to reject and audit a forged signature.

## PR08 — Provider sync

### PR08-01 — partial

- **Docs claim:** Every supported provider offers connect/reconnect/status/last success/backlog/scoped retry/disconnect in its owning workflow (`C:\projects\capsule-release-20260905\specs\ralph\production-08-provider-sync.md:15`).
  - **Real-world example (Docs claim):** A manager sees three failed QBO invoices and retries only those after reconnecting.
- **Implementation:** Calendar and QBO have OAuth, status, sync-now, last-result, and disconnect; Stripe has onboarding/refresh/disconnect; Twilio exposes configured/enabled/last scan (`C:\projects\capsule-release-20260905\src\features\admin\IntegrationsPage.tsx:272`, `C:\projects\capsule-release-20260905\src\features\admin\IntegrationsPage.tsx:373`, `C:\projects\capsule-release-20260905\src\features\admin\StripeConnectSection.tsx:57`). There is no consistent backlog/scoped retry, inbox provider, or Nowsta workflow.
  - **Real-world example (Implementation):** A manager can rerun all QBO sync, but cannot select one failed entity from a visible backlog.

### PR08-02 — missing

- **Docs claim:** Field ownership, tenant/account mapping, stable IDs, cutover, and historical inclusion are recorded before first sync to prevent loops/overwrites (`C:\projects\capsule-release-20260905\specs\ralph\production-08-provider-sync.md:16`).
  - **Real-world example (Docs claim):** QBO owns payment settlement after a chosen date while Capsule owns event dates, and both rules are visible before activation.
- **Implementation:** `IntegrationConnection` stores tenant/provider/account/scopes/status, but no field-ownership, cutover, or historical-inclusion configuration (`C:\projects\capsule-release-20260905\src\integrations\integration-connection.manifest:36`). QBO immediately schedules reconciliation after OAuth (`C:\projects\capsule-release-20260905\convex\qboSync.ts:318`).
  - **Real-world example (Implementation):** Connecting a realm records its ID, but not whether existing 2019 invoices should be excluded or which side owns later edits.

### PR08-03 — partial

- **Docs claim:** QBO customers/invoices/payments/taxes/corrections reconcile by stable IDs and historical references never unexpectedly post (`C:\projects\capsule-release-20260905\specs\ralph\production-08-provider-sync.md:17`).
  - **Real-world example (Docs claim):** Retrying an invoice correction updates the same QBO transaction and preserves tax detail.
- **Implementation:** QBO links customers and records stable provider IDs for created invoices/payments, while reference-only imports are not `Payment` entities and therefore stay out of the completed-payment selector (`C:\projects\capsule-release-20260905\convex\qboSync.ts:489`, `C:\projects\capsule-release-20260905\convex\qboSync.ts:780`). Synced states are skipped forever and writes are create-only; invoice payload uses one total line and explicitly omits per-line/tax mirroring (`C:\projects\capsule-release-20260905\convex\qboSync.ts:811`, `C:\projects\capsule-release-20260905\convex\lib\qboSync.ts:191`). Corrections and provider-side reconciliation are absent.
  - **Real-world example (Implementation):** A newly sent invoice can create one QBO invoice, but a later credit/tax correction does not update that linked transaction.

### PR08-04 — configuration-blocked

- **Docs claim:** Calendar upserts one deterministic item per event, updates material changes, and handles cancellation/revocation/retry without duplicates (`C:\projects\capsule-release-20260905\specs\ralph\production-08-provider-sync.md:18`).
  - **Real-world example (Docs claim):** Changing a venue updates the existing Google event; cancellation removes it.
- **Implementation:** The sync derives a deterministic Google event ID, compares a material signature, upserts changes, and deletes no-longer-eligible entries with recorded outcomes (`C:\projects\capsule-release-20260905\convex\googleCalendar.ts:612`). Source behavior appears complete for the criterion; no authorized Google account, sandbox/production result, overlap replay, or current credential state was checked.
  - **Real-world example (Implementation):** Source routes two retries to the same Google event ID, but only an authorized account exercise can prove Google accepted the upsert/delete behavior.

### PR08-05 — missing

- **Docs claim:** Nowsta syncs agreed worker/role/shift/time/pay mappings with IDs, increments, conflicts, and corrections (`C:\projects\capsule-release-20260905\specs\ralph\production-08-provider-sync.md:19`).
  - **Real-world example (Docs claim):** Correcting a completed shift updates the matched Nowsta record rather than producing a second shift.
- **Implementation:** `nowsta` appears only in provider/payment enums and generated projections; no authored client, connection flow, mapper, sync worker, UI, or tests were found (`C:\projects\capsule-release-20260905\src\integrations\integration-connection.manifest:16`, `C:\projects\capsule-release-20260905\src\sales\payment.manifest:30`).
  - **Real-world example (Implementation):** Capsule can label a future external payment ID as Nowsta, but cannot call or reconcile a Nowsta account.

### PR08-06 — partial

- **Docs claim:** Payment/message callbacks validate authenticity, account scope, replay identity, and monotonic state before effects (`C:\projects\capsule-release-20260905\specs\ralph\production-08-provider-sync.md:20`).
  - **Real-world example (Docs claim):** An old “processing” callback cannot regress a settled payment or duplicate its allocation.
- **Implementation:** Stripe payment reconciliation currently polls Checkout Sessions and uses stable keys, avoiding an unsigned payment webhook path (`C:\projects\capsule-release-20260905\convex\invoicePayments.ts:361`). Stripe account status also polls because generated webhook verification cannot parse Stripe's signature (`C:\projects\capsule-release-20260905\convex\stripeConnect.ts:263`); generated HTTP reports zero webhook routes (`C:\projects\capsule-release-20260905\convex\http.ts:2`), and messaging ingress is unsigned/manual. Callback authenticity/order behavior is not implemented.
  - **Real-world example (Implementation):** Re-polling one paid session does not record it twice, but Capsule has no signed message callback whose replay/order can be tested.

### PR08-07 — partial

- **Docs claim:** Expiry, throttling, outage, timeout, and ambiguous remote success use bounded retry or visible uncertain/dead-letter reconciliation (`C:\projects\capsule-release-20260905\specs\ralph\production-08-provider-sync.md:21`).
  - **Real-world example (Docs claim):** A timeout after remote invoice creation is reconciled by stable external identity before resend.
- **Implementation:** QBO/Calendar detect revoked tokens, record errors, and schedule 15-minute retry; invoice reminders use a bounded retry array (`C:\projects\capsule-release-20260905\convex\qboSync.ts:665`, `C:\projects\capsule-release-20260905\convex\googleCalendar.ts:560`, `C:\projects\capsule-release-20260905\convex\invoiceReminders.ts:25`). QBO create-after-timeout has no remote lookup/idempotency token or uncertain state, and no shared dead-letter/backlog exists.
  - **Real-world example (Implementation):** A token refresh outage becomes visible and retries, but a timeout after QBO creates an invoice can still risk a second create.

### PR08-08 — partial

- **Docs claim:** Disconnect stops new/queued work, preserves receipts/explains pending work, reconnects safely, and never exposes secrets (`C:\projects\capsule-release-20260905\specs\ralph\production-08-provider-sync.md:22`).
  - **Real-world example (Docs claim):** Disconnecting email pauses queued sends and shows what will resume after reconnect.
- **Implementation:** QBO/Calendar scheduled loops re-check the active connection, Stripe disables charge capability while preserving the external account, and refresh tokens are encrypted (`C:\projects\capsule-release-20260905\convex\qboSync.ts:937`, `C:\projects\capsule-release-20260905\convex\googleCalendar.ts:709`, `C:\projects\capsule-release-20260905\convex\stripeConnect.ts:329`). Pending work/backlog explanation and safe resume proof are incomplete; inbox/Nowsta have no disconnect path.
  - **Real-world example (Implementation):** Removing Calendar stops the active scheduler and leaves existing entries, but the UI cannot enumerate pending event updates that were abandoned.

### PR08-09 — partial

- **Docs claim:** Provider outages never roll back valid business edits; record-level pending/error state clears after verified recovery (`C:\projects\capsule-release-20260905\specs\ralph\production-08-provider-sync.md:23`).
  - **Real-world example (Docs claim):** An event time edit saves during a Google outage and shows a sync error on that event until recovery.
- **Implementation:** Provider actions run asynchronously from event/staff edits and record reconciliation failures; Calendar records per-event failed state (`C:\projects\capsule-release-20260905\convex\googleCalendar.ts:679`), and `IntegrationConnection.recordFailure` explicitly avoids rolling back unrelated work (`C:\projects\capsule-release-20260905\src\integrations\integration-connection.manifest:163`). The integrations page shows aggregate errors, not a provider state on the affected event/staff record, and automatic recovery-cleared record UX is unproved.
  - **Real-world example (Implementation):** The event remains saved after a failed Calendar call, but an event operator must leave the record to discover the failure.

## Next implementation deliverables

The deliverables below are ordered by dependency and operator value. They reuse current owners and avoid a second commercial or provider framework.

### 1. Historical financial classification and reconciliation workbench

- **Criteria:** PR05-01, PR05-02, PR05-03, PR05-07, PR05-08, PR05-09, PR05-10; supplies PR08-02/PR08-03 historical boundaries.
- **Owners/interfaces:** Extend authored `C:\projects\capsule-release-20260905\src\import\external-record-link.manifest` and `C:\projects\capsule-release-20260905\src\import\import-run.manifest`; add an authored finance/import seam beside `C:\projects\capsule-release-20260905\convex\importCommit.ts`; make `C:\projects\capsule-release-20260905\src\features\admin\import\ExternalRecordsReconcilePage.tsx` the workbench. The seam must expose typed classification, source/effective/import timestamps, overlap group, reference/reconstruction preview, explicit unknowns, and a stable resolution/replay identity. Reference is the default effect-free disposition.
- **Test scenarios:** Positive/zero/negative rows; duplicate report/payment overlap; missing invoice detail; source-ID exact match versus ambiguous suggestion; one transaction cannot resolve twice; interrupted preview/resume; reference rows never enter invoice/payment/QBO/reminder selectors; saved period/status/currency tie-out drills to every discrepancy.
- **Dependencies/choices:** Build and test both reference and reconstruction previews now. Posting reconstruction remains disabled until the owner selects reference-only versus reconstruction scope, authoritative accounting system, and cutover period. No historical import or external post is part of implementation verification.
- **Operator-visible benefit:** Finance can account for every historical money row, see what is excluded, resolve uncertainty once, and save a reusable tie-out without spreadsheets or JSON.

### 2. Native invoice numbering, allocations, and correction truth

- **Criteria:** PR05-04, PR05-05, PR05-06, PR05-09; strengthens PR06-09 and PR08-03/PR08-06/PR08-07.
- **Owners/interfaces:** Correct the Event-approved invoice issuance contract in `C:\projects\capsule-release-20260905\src\sales\invoice.manifest`; extend `C:\projects\capsule-release-20260905\src\sales\invoice-core.manifest`, `payment.manifest`, and `credit-memo.manifest` for explicit principal, provider fee, partial allocation, overpayment credit, partial refund, chargeback/ACH return, and effective-date correction facts. `C:\projects\capsule-release-20260905\convex\invoicePayments.ts` remains Stripe reconciliation owner. A single money/rounding adapter must feed invoice detail, statements/aging, and reports rather than duplicating calculations in pages.
- **Test scenarios:** The exact `1,000.00 = 100.00 + 900.00` case with a separate `3.50` fee; partial allocation; overpayment held as unapplied credit; partial/full refund; chargeback after settlement; repeated provider session; concurrent Event approval; repeated closeout; human-readable number collision; cross-currency cent reconciliation; original record/reason retained.
- **Dependencies/choices:** Owner must confirm the human-readable numbering scope and authoritative tax/commission bases before activation; tests should parameterize that decision instead of hard-coding an invented sequence. Preserve existing permissive routine editing; only block effects that would duplicate money or publish an invalid balance.
- **Operator-visible benefit:** One ledger explains billed, received, refunded, returned, credited, and fee amounts without opaque invoice IDs or manual balance repair.

### 3. Booking lifecycle and client payment qualification

- **Criteria:** PR06-01 through PR06-10, excluding already-repaired template/PDF wiring as new work.
- **Owners/interfaces:** Keep `C:\projects\capsule-release-20260905\convex\lib\proposalRevision.ts` as snapshot owner and `proposalEventCreation.ts` as atomic projection owner. Extend `C:\projects\capsule-release-20260905\convex\quoteBuilder.ts` so selected menus/packages/enhancements/consent/assumptions remain structured. Add a public-token-safe payment prepare/status seam through `C:\projects\capsule-release-20260905\convex\clientPortal.ts` that delegates to `invoicePayments.ts` without exposing staff actions. Replace generic publish-time brand fallbacks with actual organization/Clerk identity or one actionable readiness message; keep draft editing available. Record the owner-approved Confirmed/Executing/archive/reopen mapping in `src\operations\event.manifest` before altering transitions.
- **Test scenarios:** Same eligible sell price across quote/proposal/revision/PDF/portal; retry after each conversion checkpoint; imported event proposal; no-organization publish readiness; revoked/expired/superseded/repeated acceptance; accepted snapshot unchanged after catalog/event edits; exact operational projection and field-role view; live 86/substitution; mobile deposit and balance with double-click/refresh/lost response/disconnect; one full cross-tenant journey.
- **Dependencies/choices:** Requires the owner's canonical definition for Confirmed versus Executing and a decision on external-signature legal suitability. Stripe sandbox/production payment proof requires separately authorized credentials/account calls; disconnected behavior is still testable locally.
- **Operator-visible benefit:** Sales enters booking facts once, the crew receives the agreed service brief, and the client can accept and pay on a phone with honest state.

### 4. Connected conversation transport and delivery ledger

- **Criteria:** PR07-01 through PR07-09; message portions of PR08-01/PR08-06/PR08-08/PR08-09.
- **Owners/interfaces:** Preserve `C:\projects\capsule-release-20260905\convex\messageInbox.ts` as the provider-neutral normalization/dedupe consumer and `src\sales\message-thread.manifest` / `message.manifest` as conversation truth. Add one selected-provider adapter with OAuth/account ownership, signed raw ingress, polling cursor where required, media-reference capture, and an outbound durable job/receipt contract. Extend MessageThread with an event relationship and the delivery state machine with queued/provider-accepted/delivered/bounced/failed/unknown plus attempt/provider IDs. `MessageInboxPage.tsx` consumes that state and retains today's honest Copy draft fallback when disconnected.
- **Test scenarios:** Signed valid/forged callback; two provider accounts sharing a thread ID; duplicate webhook plus polling overlap; pagination/restart cursor; duplicate media; lead/event match; crash after provider acceptance; delivered-recipient retry suppression; token expiry/reconnect; consent change after enqueue; quiet hours; disconnect with pending jobs; cross-tenant attachment denial; imported history produces zero sends/tasks.
- **Dependencies/choices:** The organization must choose and authorize the inbox/social provider/account and decide applicable consent/quiet-hour policy. Provider-neutral queue, signatures, replay, UI, and isolated fixtures can be built before credentials; no live send is implied until sandbox and then explicitly authorized production proof pass.
- **Operator-visible benefit:** New inquiries arrive automatically, staff reply from the event conversation, and every message says whether the provider actually accepted or delivered it.

### 5. Provider ownership, QBO correction sync, Calendar qualification, and Nowsta adapter

- **Criteria:** PR08-01 through PR08-09; closes PR05/PR06/PR07 provider dependencies.
- **Owners/interfaces:** Extend `C:\projects\capsule-release-20260905\src\integrations\integration-connection.manifest` with field ownership, tenant/account mapping, cutover/historical inclusion, backlog summary, and last verified success—without storing secrets. Keep `convex\qboSync.ts` and `convex\googleCalendar.ts` as their current owners. QBO must reconcile/update linked transactions, tax detail, payments, credits/corrections, and ambiguous remote-success states by stable IDs rather than skipping every prior success. Add a Nowsta-named authored adapter only after agreed mappings; do not call CSV export “sync.” Surface per-record provider state from events/invoices/shifts and provide scoped retry.
- **Test scenarios:** Pre-sync ownership/cutover validation; old reference rows excluded; QBO create/update/correction/tax and timeout-after-remote-success; scoped retry without duplicate; Calendar create/update/cancel/revoke/overlap; disconnect/reconnect with pending work; token expiry/throttle/outage/dead letter; per-record error clears after recovery; Nowsta worker/role/shift/time/pay conflict and correction fixtures.
- **Dependencies/choices:** Account administrators must authorize QBO, Google, Stripe, and Nowsta accounts/entitlements and confirm QBO/Nowsta field ownership and cutover. Calendar's source behavior can proceed directly to fixture/sandbox qualification; QBO and Nowsta require implementation before live qualification.
- **Operator-visible benefit:** Managers connect each provider once, see exactly what is pending or failed on the affected business record, and retry safely without rekeying or creating duplicates.

## Verification and release boundary for the later implementation

Each deliverable should add focused runtime/controller/UI tests in the existing style, then pass `bun run check`, `bun scripts/manifest-regen-check.ts`, and the spec lint. Provider work needs a per-provider evidence row for fixture replay, sandbox result, credential state, and production result; absence of credentials remains **configuration-blocked**, not “passed” or “missing implementation.” Actual customer import, real provider messages/charges/accounting writes, environment changes, deployment, and release require their own explicit authorization and receipts.

The current source has a recorded local full gate of 161 files / 1,376 tests, but its receipt explicitly says the evidence is source/runtime/jsdom rather than authenticated browser/production proof (`C:\projects\capsule-release-20260905\docs\task-plans\2026-09-06-full-wiring-audit\evidence\final-verification.md:5`). This audit did not rerun that gate or inspect production accounts.
