# Capsule Pro — Complete Product and Wiring Specification

**Purpose:** Turn Capsule into the working catering operating system described in Josh’s wants map: one connected path from inquiry through event execution, operations, reporting, and cutover from TPP.

**Source of truth:** The existing Capsule-Pro repository, its current Manifest program, the TPP mapping/research files already named in the wants map, and the current Manifest `llms-full.txt`. This spec defines product behavior and completion. It does not replace proven field mappings or create parallel models when Capsule already has an equivalent.

---

## 1. Product outcome

Capsule must operate as one system, not a collection of pages:

**Inquiry or imported TPP record → contact and deal → event → quote/proposal → Sales Lock → Confirmed → Final → Complete → staffing, kitchen, equipment, payments, venue attribution, and reporting.**

The main experience is mobile-first because field users work from phones and tablets. Desktop can expose denser controls, but no critical event action may require a desktop-only workflow.

### What “fully wired” means

A feature is complete only when its normal path is real end to end:

1. The visible page or control uses live tenant-scoped data.
2. The UI calls the generated or canonical binding for the intended Manifest command.
3. The write enters `RuntimeEngine.runCommand`; it does not update the database directly.
4. Policies, constraints, guards, approvals when intentionally used, mutations, and events run in Manifest’s defined order.
5. State persists through the production store and survives refresh.
6. Internal follow-on work runs through typed events and reactions; external work goes through a durable outbox or durable job queue.
7. The UI refreshes or invalidates the correct list/detail views and explains structured failures in plain language.
8. Audit, tenant identity, actor identity, idempotency, and retry behavior are present where the operation needs them.
9. The repo’s Manifest wiring inspection proves the consumer is connected; there are no dead buttons, mock success states, orphaned generated artifacts, or duplicate write paths.

Manifest owns domain truth—types, commands, authorization, state preconditions, transitions, events, and wiring metadata. Capsule owns presentation, copy, layout, and where each action appears.

---

## 2. Shared architecture

### 2.1 Canonical domain spine

Use existing Capsule entities whenever their meaning matches. Add or split entities only for a real domain distinction. The required conceptual spine is:

- **Sales:** Contact, Company/Account, Inquiry or Lead, Deal/Opportunity, Event.
- **Event reference data:** Event Status, Service Style, Occasion, Venue, Salesperson/Owner, Referral Source.
- **Proposal:** Proposal, Proposal Revision, Proposal Section, Proposal Line Item, Proposal Timeline Item, Proposal Enhancement, Share Link, Signature/Acceptance Request.
- **Operations:** Staff Shift/Assignment, PrepList and PrepTask, Equipment PackList and PackListItem, Equipment Item, Event Layout, Venue Logistics Snapshot.
- **Kitchen:** Menu Category, Menu Item, Menu Price/Season, Recipe, Ingredient, Inventory Item, Stock Movement, Waste Entry, Event Food Cost.
- **Venue:** Venue Profile, Venue Note, Venue Layout Template, Venue Vendor Relationship, Revenue Attribution/Split.
- **People:** Staff Member, Role, Role Scorecard, Candidate/Application, Interview, Performance Feedback, One-on-One.
- **Migration/integrations:** External Record Link, Import/Sync Run, Sync Error, Payment/Reconciliation Record, Message Thread/Message, Integration Connection.

Names may differ in the repo. The implementation must map to existing names before creating anything new.

### 2.2 Manifest usage

- Model business state in typed entities and enums.
- Expose meaningful commands such as `lockForSales`, `confirm`, `finalize`, `complete`, `publishProposal`, `reserveEquipment`, and `recordWaste`; do not rely on unrestricted generic updates for governed transitions.
- Put tenant-wide access rules in policies. Put state preconditions and command-specific role checks in guards. Put data invariants in constraints.
- Emit typed events with explicit payload fields needed by downstream reactions.
- Use reactions for deterministic internal cascades—for example, completing an event can close open operational work, while cancelling an event can release assignments and equipment.
- Use durable jobs for imports, exports, PDF/render work, reconciliation, and other long-running operations.
- Use signed, idempotent webhooks for inbound provider events.
- Use a transaction-backed outbox for external email, SMS, accounting, calendar, payroll, and social-provider delivery. Consumers must deduplicate.
- Wire a production audit sink. Audit loss is observable and alerted even though it must not silently change a successful business command.
- Require tenant context and server-owned actor/tenant inputs. The client must not be able to spoof them.
- Generate and consume the Manifest wiring contract/bindings. Run strict wiring inspection on the surfaces shipped in each delivery slice.

### 2.3 Reads and money

Generated or hand-written read routes may query the database directly only when they enforce the same tenant, soft-delete, and read-policy outcome expected by the domain. A fast read path is not permission to leak cross-tenant or restricted records.

Use Capsule’s existing database decimal/money representation and calculation utilities for prices, taxes, fees, commissions, and food cost. Do not rely on JavaScript floating-point arithmetic or Manifest’s `money`/`decimal` metadata alone for financial precision.

---

## 3. Foundation blockers

These ship first because every later workflow depends on them.

### 3.1 Event detail crash

**Outcome:** Every authorized event detail URL loads from live data, including imported records.

**Required behavior:**

- Trace the `is_active` failure to the canonical source: Manifest entity, generated IR/projection, database schema/migration, store adapter, read selection, or UI contract.
- Repair the source of truth and regenerate downstream artifacts. Do not suppress the field, add a try/catch around the page, or maintain separate snake_case and camelCase business fields.
- Backfill existing rows with the correct active default and prove list/detail reads agree.
- Missing events return the product’s normal not-found state. Unauthorized or cross-tenant access does not reveal existence.

**Done when:** An imported event and a newly created event both open, edit through a governed command, survive refresh, and appear consistently in event lists.

### 3.2 Service Style

**Outcome:** Service style is a first-class, filterable, reportable event concept.

**Required behavior:**

- Use or add a reference entity with at least the mapped TPP values: Full Service, Limited Service, Drop Off, and Vending.
- Support active/inactive state, display order, client-facing label, and operational defaults where the app already has template concepts.
- Events reference a Service Style; imported records use the existing mapping document. Unknown legacy values enter a visible reconciliation queue rather than being silently coerced.
- Service Style is available in event forms, proposal logic, staffing/equipment templates, reporting filters, and migration comparisons.

**Done when:** A user can create an event with each service style, import the same styles from TPP, filter by them, and generate the appropriate proposal/operations defaults.

### 3.3 Sales Lock and event status pipeline

**Outcome:** The event lifecycle matches the business: **Quote → Sales Lock → Confirmed → Final → Complete**.

**Required behavior:**

- Add Sales Lock as a distinct status, not an alias for Confirmed.
- Preserve the exact TPP-to-Capsule mapping already documented in the repo.
- Use explicit transition commands with guards. Each command records actor/time and emits a typed transition event.
- Prevent illegal skips and regressions unless a separately authorized correction command exists and requires a reason.
- Define the minimum completeness checks at each gate using current business rules. At minimum, a record cannot advance when required event identity, date, client, service style, or venue rules are unresolved.
- Completion freezes the reporting snapshot while allowing authorized corrections through an audited correction path.

**Done when:** The full sequence succeeds, illegal transitions fail with an understandable reason, and imported status history maps without losing the original TPP status.

### 3.4 Equipment PackList is not PrepList

**Outcome:** Food preparation and equipment packing remain separate operational systems.

**Required behavior:**

- Keep **PrepList/PrepTask** for food production.
- Add or use a distinct **Equipment PackList/PackListItem** model for equipment and supplies.
- An event may have both. Their pages, commands, templates, reports, permissions, and imports must not share records or labels that imply they are the same thing.
- TPP Pack List imports always target Equipment PackList.

**Done when:** One event can have food prep tasks and an equipment pack list simultaneously, with independent generation, editing, completion, and reporting.

---

## 4. Event lifecycle and client acquisition

### 4.1 Event creation and editing

**App impact:** Sales and operations see one accurate event record instead of re-entering data across systems.

The event form supports all mapped TPP fields, including date/time, occasion, guest count, service style, venue, salesperson, and referral source. Contact/company and deal context are linked rather than copied as loose text. Venue, menu, pricing, staffing, and equipment information that must remain historically stable is snapshotted at the appropriate business gate.

Create and edit commands validate required relationships, dates, guest counts, and status-specific fields. Actor and tenant come from trusted runtime context. Concurrent edits return a conflict state rather than silently overwriting newer work.

**Done when:** Create, edit, duplicate, archive/deactivate, and reopen paths are visible, governed, tenant-safe, and reflected immediately in list/detail pages.

### 4.2 Online menu pricing

**App impact:** Clients can see accurate sell prices without exposing internal cost or margin.

Publish only active, client-visible menu items and current effective prices. Support categories, descriptions, dietary/allergen labels already modeled, minimums, service-style availability, seasonal availability, per-person or unit pricing, and clear “starting at” behavior where price is not fixed. Internal food cost, vendor cost, and margin stay private.

The public menu and self-service quote use the same catalog/pricing source as internal proposals. There is no second hard-coded web catalog.

**Done when:** Changing an effective menu price updates new quotes and public pricing at the correct effective date without rewriting already published proposal revisions.

### 4.3 Self-service quote builder

**App impact:** A prospect can create a qualified inquiry and realistic draft estimate without staff rekeying it.

The flow collects contact details, event date, occasion, guest count, service style, venue or location, menu selections, enhancements, and consent. It validates availability/eligibility rules that Capsule can prove and labels estimates as estimates until staff publishes a formal proposal.

Submission creates or matches the Contact/Company, creates an Inquiry/Lead and Event/Deal in the correct opening state, stores attribution and consent, and creates a draft proposal/estimate from the same pricing engine used internally. Duplicate submissions are deduplicated by a stable submission key and contact/event evidence.

**Done when:** A mobile client can submit once, sales sees the new lead/event with all selections, and staff can convert the draft into a branded proposal without re-entry.

### 4.4 Social DM inquiry capture

**App impact:** Social inquiries become trackable leads instead of disappearing in individual inboxes.

Provider messages enter through signed/idempotent webhooks or the provider’s supported polling API. Store provider account, thread ID, message ID, sender identity, timestamp, text/media metadata, and raw payload reference. Match or create a Message Thread and Contact, then create an Inquiry/Lead when the thread first becomes sales-qualified.

Provider message ID is the deduplication key. Failed parsing appears in a retryable sync-error queue. Staff can link, merge, or mark a thread as non-lead without deleting the source history.

**Done when:** Replaying the same provider delivery creates no duplicate message or lead, and a staff reply/history view shows the source network and linked event/deal.

### 4.5 Mobile-first field use

Critical event pages must work at phone width with touch targets, readable status, sticky primary actions, compact list filters, and no hover-only controls. The event detail prioritizes next action, time/location, contact, service style, proposal status, staffing, prep, pack list, and critical notes. Large tables become cards or horizontally constrained summaries rather than unusable desktop tables.

**Done when:** Kayden/Josh can create or update an event, view a proposal, confirm logistics, and operate staffing/prep/packing from a phone without switching to desktop mode.

### 4.6 Social sharing

Published proposals and presentation decks receive revocable share links. Links may be public-token or authenticated, based on document sensitivity. Record version, expiry, revocation, first/last view, and viewer identity when known. Sharing always points to an immutable published revision, not a mutable draft.

**Done when:** A salesperson can share, copy, revoke, and replace a link; the client sees the intended revision; later edits do not alter what was previously accepted.

---

## 5. Proposal system — first wedge

### 5.1 Proposal lifecycle

**App impact:** Capsule produces the client-facing artifact that starts replacing TPP immediately.

A Proposal belongs to an Event and contains revisions. Draft revisions are editable. Publishing creates an immutable, numbered snapshot with event/client/venue/menu/pricing details. A later change creates a new draft revision; it never mutates the accepted or previously shared revision.

Suggested lifecycle, mapped to existing names where present: Draft → Published/Sent → Viewed → Accepted or Declined → Superseded/Expired. Proposal state and Event state are related but not identical. Acceptance may trigger Sales Lock only when the configured business gate is satisfied.

### 5.2 Builder and branded templates

The builder starts from live Event data and supports templates using Capsule’s existing design system. Staff can reorder, show/hide, and edit allowed sections without breaking structured pricing data. The visual result must meet the wedding-magazine quality goal on desktop and mobile and have a printable/PDF-safe layout.

Required sections:

- Cover/brand and event summary.
- Menu sections with item descriptions, quantities, and prices.
- Timeline/run-of-show.
- Venue logistics snapshot.
- Enhancements/upgrades.
- Pricing summary, fees, taxes, discounts, deposits, and payment schedule where modeled.
- Terms and acceptance/signature CTA.

### 5.3 TPP bridge

An imported TPP Event uses the same `create proposal from event` command as a native Capsule Event. Legacy source fields are visible for reconciliation but do not create a separate proposal engine. Missing menu or venue mappings are surfaced before publication.

### 5.4 Pricing behavior

Line items support the pricing bases Capsule already needs—per person, quantity/unit, flat fee, percentage, or package—without mixing internal cost into client-facing totals. Effective prices are snapshotted into a proposal revision. Discounts, service charges, taxability, and deposits use one central calculation path shared by preview, publication, acceptance, PDF/render, and reporting.

The command that publishes a proposal blocks on invalid totals, unmapped required items, negative quantities, or unapproved manual overrides. Authorized overrides require a reason and remain auditable.

### 5.5 Digital acceptance/signature readiness

The bottom CTA must be functional, not decorative. Capsule supports a provider-neutral Acceptance/Signature Request record with recipient, proposal revision, status, requested/expired/completed times, provider IDs, and signed artifact reference. An internal click-to-accept flow may be used only when it meets the business/legal requirement; otherwise connect the selected e-sign provider through signed/idempotent webhooks.

Acceptance records the exact proposal revision and terms version. A successful provider callback cannot be applied twice and cannot accept a superseded or revoked revision.

**Proposal feature is done when:** Staff can create from a native or imported event, edit, preview, publish, share, view on mobile, accept/sign, and see the event/proposal update through real commands and events. The accepted revision remains reproducible after later catalog, venue, or event edits.

---

## 6. TPP migration and parallel run

### 6.1 Import framework

**App impact:** Migration becomes repeatable and measurable instead of a one-time risky script.

Every import runs as a durable Import Run with source, dataset, started/completed times, counts, checksum/version, actor, status, and errors. Keep an External Record Link for source system + record type + stable external ID → Capsule entity ID. Preserve enough raw source data or a source artifact reference to explain mappings later.

Imports are idempotent. Rerunning the same source row updates the mapped Capsule record when allowed and never creates a duplicate. Manual Capsule changes follow the field ownership rules defined for parallel run; conflicts enter a review queue instead of being silently overwritten.

### 6.2 Required datasets

- Existing 2,103 Events and the documented 27-field mapping.
- Contacts: name, email, phone, company, address.
- Open and historical pipeline/deals, stages, and close history.
- Menu catalog, categories, and prices.
- Equipment Pack Lists captured from TPP’s per-event equipment/supply views.
- Venues, addresses, capacity, contacts, and notes.
- Payments and reconciliation references from TPP, QuickBooks, and Nowsta where applicable.

The exact field and status mappings come from the existing migration/data-map documents. This spec does not invent substitutes for fields not present in those sources.

### 6.3 Browser-extracted Pack Lists

Because TPP has no bulk export for Pack Lists, the extractor records source event ID, source page/version, extraction time, item text, quantities, grouping, and extraction errors. It must be resumable and idempotent. The importer maps only to Equipment PackList/PackListItem. Unrecognized items may remain as imported free-text lines until deliberately mapped to Equipment Items.

### 6.4 Payment reconciliation

Imported payment records retain source, external transaction ID, amount, date, type, event/client reference, and reconciliation state. Match by explicit provider/source IDs first, then approved deterministic rules. Amount/date/name heuristics may suggest a match but must not silently finalize an ambiguous match.

### 6.5 Parallel run dashboard

Run TPP and Capsule together with a daily comparison for record counts, event totals, status distribution, revenue totals, salesperson, occasion, service style, venue, newly created/changed records, and unresolved mappings. Each mismatch is drillable to the source and Capsule records and can be assigned/resolved.

### 6.6 Cutover

Cutover requires a final delta import, zero critical unresolved mappings, signed business validation of event flow and reports, provider/integration readiness, and a rollback/archive plan. TPP becomes read-only or archived only after the go/no-go gate. Scheduled imports are then disabled deliberately and recorded.

**Migration is done when:** The agreed test year and then the full dataset reconcile within documented tolerances, daily parallel comparisons are operational, users validate the workflow, and cutover leaves no active dual-write ambiguity.

---

## 7. Reporting and dashboards

### 7.1 Reporting foundation

**App impact:** Leadership can run the business from Capsule instead of standalone HTML and TPP exports.

Move the existing Company Scorecard, L10 Meeting Template, Avg Event Value Growth Strategy, Comp Master Status Dashboard, Sales Dashboard, and Mangia Dashboard Round 4 into authenticated Capsule routes/components. Do not iframe static files or preserve hard-coded values. Reuse the app’s reporting/filter/export framework where it exists.

Every metric declares its data source, date basis, inclusion statuses, tenant scope, filters, and drill-down. Tim’s KPI definitions must be copied from the existing TPP report playbook/research—not guessed here.

### 7.2 Common filters

Reports support the dimensions needed by the wants map: date range, event status, salesperson, occasion, service style, venue, on-premise/off-premise, and source/referral. Filter state is shareable where current app conventions allow, and exports reflect the same filtered dataset shown on screen.

### 7.3 Revenue attribution and splits

Use or add a Revenue Attribution/Split model attached to the appropriate Event, Venue, Salesperson, referral source, or partner. It supports percent or fixed allocations, effective dates, reason/type, source, and optional approval/reference. The total allocated amount cannot exceed the allowed basis without an authorized exception.

Revenue reports can show gross event revenue, venue-attributed revenue, commissions/splits, net retained amount, and unmapped revenue. Historical events use snapshotted attribution rules rather than today’s venue terms.

### 7.4 Dashboard-specific outcomes

- **Tim’s KPIs:** Replicate the agreed TPP KPIs and allow record-level reconciliation.
- **Company Scorecard:** Current scorecard metrics, target, actual, trend, owner, and status.
- **L10:** Scorecard, rocks/priorities, issues, action items, and meeting-period history using current business definitions.
- **Avg Event Value Growth:** Event value trend, mix, drivers, and drill-down by salesperson/service style/occasion/venue.
- **Comp Master:** Status and source evidence for compensation deliverables and calculations.
- **Sales Dashboard:** Pipeline, booked revenue, conversion, average event value, activity/ownership, and the approved 3% compensation basis.
- **Mangia Round 4:** Port the existing deliverable’s measures and visual hierarchy onto live Capsule data.

**Reporting is done when:** Each dashboard loads live tenant data, filters correctly, drills to underlying records, reconciles to the approved TPP/import dataset, and contains no static placeholder numbers.

---

## 8. Venue management

### 8.1 Venue profile

**App impact:** Venue knowledge becomes reusable operational intelligence instead of event-by-event tribal knowledge.

A Venue profile covers identity/contact/address, on/off-premise classification, capacities, room/space details, kitchen access and equipment, power/water, load-in path/times, parking, elevators/stairs, storage, waste rules, permits/insurance, preferred and banned vendors, restrictions, attachments/photos where supported, and scorecard metrics.

Fields should be structured when they drive filtering, proposals, staffing, or packing; use notes for genuinely unstructured context.

### 8.2 Event layouts and logistics snapshots

A Venue can own reusable layout/logistics templates. An Event selects or copies one into an Event-specific snapshot that can be edited without rewriting the venue template. Proposal publication and event finalization snapshot the venue information needed to reproduce the client and operations plan.

### 8.3 Venue notes

Notes link directly to Venue and may optionally reference an Event. Support author/time, category, pin/priority, visibility, and archive. Sensitive commercial notes follow current permission conventions and are not exposed in client proposals.

### 8.4 Vendor ecosystem

Model a Venue ↔ Vendor relationship with category, preferred/approved/restricted/banned state, contacts, effective dates, insurance/compliance references, and notes. The event/proposal workflow can warn or block against a banned vendor according to business policy.

### 8.5 Revenue attribution

Venue commission and split terms are versioned/effective-dated. Event booking snapshots the applied terms, while authorized staff can record a reasoned override. Reports show venue-produced revenue, commission, and retained revenue.

**Venue management is done when:** Venue data flows into event creation, proposal logistics, event layout, operational notes, vendor warnings, packing/staffing context, and venue-filtered revenue reporting without re-entry.

---

## 9. Staffing and HR

### 9.1 Event staffing

**App impact:** Operations can build and publish an event crew from the Event record.

Events have shifts/requirements and Staff Assignments with role, scheduled start/end, location, status, and the existing rate/pay references where applicable. Commands cover draft requirement, assign, unassign, publish, acknowledge, decline, check in/out where supported, and close.

Guards prevent overlapping assignments, assignment of inactive/unqualified staff, and staffing a cancelled/completed event. Authorized overrides require a reason. Event date/time/location changes emit events that mark affected assignments for review and notify through the outbound messaging path.

### 9.2 Role scorecards

Role Scorecards define the current measurable expectations for each staff role, with version/effective dates and active state. Event feedback and one-on-ones can reference the applicable scorecard version so historical assessments remain interpretable.

### 9.3 Hiring pipeline

Map the KM interview tool JSON into Capsule’s existing candidate/interview model. Preserve source IDs and raw response references. The pipeline supports the current business stages—application, screening, interview, decision/offer, hired or rejected—using repo terminology. Re-importing the same candidate/interview updates the source-linked records without duplication.

### 9.4 Performance tracking

Performance Feedback links Staff Member, Event, reviewer, role/scorecard, ratings, strengths, opportunities, comments, and follow-up. Restrict visibility according to HR permissions. Staff-facing views show only the feedback intended for them.

### 9.5 Monthly one-on-ones

A One-on-One captures period, participants, agenda, goals, wins/strengths, areas of opportunity, decisions, and follow-up actions with owners/dates. Open actions appear in the next meeting and can be closed without rewriting the prior record.

**Staffing/HR is done when:** Operations can staff an event on mobile, staff can acknowledge, conflicts are visible, the same people/roles feed Nowsta integration later, and HR records use real permissions and historical versions.

---

## 10. Kitchen operations

### 10.1 Menu management

Manage categories, client-visible Menu Items, descriptions, dietary/allergen data, service-style availability, seasonal/effective dates, active state, price history, and internal cost references. Public menu, quote builder, proposal builder, recipes, and reports all use this catalog.

### 10.2 Recipe management

Recipes are versioned and include yield, units, ingredients, prep instructions, allergens, stations, and active/effective state. An Event or published Proposal references a stable recipe/menu snapshot for costing and prep generation when historical reproducibility matters.

### 10.3 Food cost

Calculate estimated Event food cost from guest count, selected menu items, recipe yields, ingredient costs, and approved waste/yield assumptions. Track actual cost from purchases/stock movement or the best available actual source. Show estimated, actual, variance, cost per guest, and margin using the same revenue basis as reporting.

### 10.4 Waste tracking

Waste Entry records item/ingredient, quantity/unit, reason, cost, event/location, recorder, time, notes, and approval/void state where required. Voiding is a command with reason; records are not silently deleted. Waste rolls into event and aggregate food-cost reporting.

### 10.5 Inventory

Inventory supports item, unit, location, on-hand/available quantities, receipts, issues/consumption, transfers, counts/adjustments, reorder thresholds, and audit history. Stock-changing commands validate quantity and preserve the movement ledger. Event consumption can reference the Event without forcing equipment inventory into the same model.

### 10.6 PrepList

PrepList remains food-preparation work. Generate from finalized menu/recipe snapshots, with tasks by station, quantity/yield, due time, assignee, status, and dependencies where already supported. Changes to the finalized menu mark affected prep work for review rather than silently rewriting completed work.

**Kitchen is done when:** A priced menu selection can become a proposal, a finalized event can generate food prep, inventory/waste can record actuals, and the completed event shows estimated-versus-actual food cost.

---

## 11. Equipment operations

### 11.1 Equipment inventory

**App impact:** Operations knows what exists, where it is, whether it works, and whether it is available for an event.

Support serialized assets and bulk-count items. Track category, quantity, condition, active state, home/current location, ownership/rental, replacement value where already used, and maintenance status. Do not force food ingredients or disposable menu inputs into equipment inventory.

### 11.2 Pack List templates and generation

Equipment PackList Templates can vary by service style, event type/occasion, guest-count band, and venue requirement. Generating for an Event creates an editable snapshot of PackListItems with required quantity, packed/loaded/returned quantity, source/template, notes, and shortage state.

Venue logistics and Event selections may add requirements. Template changes affect future generations, not already finalized event snapshots.

### 11.3 Availability and movement

Commands reserve/allocate, pack, check out/load, return/check in, mark missing/damaged, transfer, and release. Availability accounts for overlapping event reservations, current movement, maintenance blocks, and bulk quantities. Conflicts are visible before Final status.

### 11.4 Maintenance

Maintenance Tasks record issue, severity, item, opened/due/completed dates, owner/vendor, cost, notes, and out-of-service state. An out-of-service asset cannot be newly allocated unless an authorized override exists.

**Equipment is done when:** An event can generate and edit a pack list, reserve available equipment, expose shortages, track load/return, update availability, and keep all of this separate from food PrepList.

---

## 12. Integrations

### 12.1 Common integration contract

All providers use a common operational pattern:

- Integration Connection with tenant, provider, status, encrypted credentials/reference, scopes, and last successful sync.
- External Record Link with stable provider IDs.
- Durable Sync Run/Job with counts and retryable errors.
- Signed and idempotent inbound webhook handling when supported.
- Transaction-backed outbox for outbound work.
- Exponential retry, bounded attempts, visible dead-letter/error state, and an authorized retry/reconcile action.
- No provider call is treated as successful until the provider response is recorded.
- Provider outages do not roll back unrelated user work; they leave a visible pending/failed integration state.

### 12.2 QuickBooks

Define ownership rules for customers/contacts, invoices, payments, taxes, and account references before syncing. Stable external IDs prevent duplicate customers, invoices, or payments. Event/proposal/payment commands enqueue accounting work; the worker records provider result and reconciliation state. Conflicts and unmatched payments appear in the reconciliation queue.

### 12.3 Nowsta

Use Capsule Staff Members, roles, event shifts, assignments, and approved time/pay references as the source records. Sync external worker/shift IDs, status, and payroll result. Changes are idempotent, and conflicting edits are shown rather than silently overwriting published staffing.

### 12.4 Google Calendar

Create one calendar event per Capsule Event/calendar target using a stable external ID. Update material changes, cancel/remove according to policy, and prevent update loops with source/version metadata. Calendar failure never pretends the Capsule Event failed; it shows pending/error and supports retry.

### 12.5 Email

Outbound client/staff email is attached to a Message Thread and relevant Contact/Event/Proposal. Track template/version, recipients, provider message ID, queued/sent/delivered/bounced/failed state, and reply linkage when provider support exists. Respect opt-out/consent and tenant sender configuration.

### 12.6 SMS

Use the same thread and delivery model as Email, with phone validation, consent/opt-out, quiet-hour/business rules already required by the organization, provider IDs, and delivery/failure status. Reminders and confirmations are scheduled/deduplicated so retries cannot send duplicates.

### 12.7 Social media

Inbound DMs follow the inquiry-capture spec. Outbound replies, when enabled by the selected provider, stay linked to the source thread and use provider message IDs. Provider-specific limits or unsupported message types appear as actionable errors.

**Integrations are done when:** Connect/reconnect, initial sync, incremental sync, inbound replay, outbound retry, idempotency, error visibility, and disconnect behavior are proven for each enabled provider.

---

## 13. Completion tests and proof

Keep verification focused on the feature being shipped. Each delivery slice needs:

1. **Manifest proof:** Source compiles; generated artifacts are current; no new diagnostics for the touched domain; command policies/guards/constraints/events are exercised.
2. **Command tests:** Happy path plus the highest-risk denial or conflict path.
3. **Store/API proof:** One real persisted write and readback with tenant isolation and idempotent retry where relevant.
4. **UI proof:** One normal user journey from visible control through refresh, plus a visible failure state.
5. **Wiring proof:** Generated wiring contract/bindings are consumed and strict inspection reports the shipped commands as wired—not merely declared.
6. **External proof:** For provider features, replay the same webhook/job/outbox delivery and prove no duplicate business record or message.
7. **Required repo gate:** Run the project’s normal touched-file/type/build gate, not an unrelated broad suite.

A feature is **not done** when only its schema, page, route, Manifest command, worker, or dashboard exists. All required pieces must connect in the normal app path.

---

## 14. Delivery order

### Slice 0 — Make the event spine trustworthy

Fix event detail, add/repair Service Style, add Sales Lock and guarded lifecycle transitions, and separate Equipment PackList from PrepList. Prove one event end to end.

### Slice 1 — Proposal wedge

Deliver live menu pricing, proposal revisions/builder, TPP bridge, share link, and working acceptance/signature path. This is the first visible replacement value for TPP.

### Slice 2 — Migration and parallel validation

Finish contacts, deals, menu, venues, pack lists, and payment imports; deploy the daily comparison dashboard; validate with the agreed test year before full migration.

### Slice 3 — Venue and reporting core

Wire Venue profiles/layouts/notes/vendors/revenue attribution into Events and Proposals, then move all required scorecards/dashboards onto live data.

### Slice 4 — Operations

Ship event staffing/HR basics, kitchen menu/recipe/cost/waste/inventory, and equipment reservation/packing/maintenance on the same Event spine.

### Slice 5 — Provider integrations and cutover

Connect QuickBooks, Nowsta, Calendar, Email, SMS, and social DMs through the shared integration contract. Complete parallel run, final delta, go/no-go, and TPP archive.

Each slice ends after focused tests, the required gate, and wiring proof pass. Do not expand into unrelated cleanup while a slice’s explicit blocker is already known.

---

## 15. Things this specification deliberately avoids

- A second CRM, pricing engine, event model, menu catalog, or reporting framework beside an existing Capsule equivalent.
- Direct database mutations for governed business writes.
- Generic “set status” commands that bypass lifecycle rules.
- Static or iframe dashboards presented as integrated features.
- Treating equipment Pack Lists as food PrepLists.
- Client-supplied actor, tenant, approval identity, totals, or trusted provider state.
- Fire-and-forget external calls without idempotency, durable status, and retry visibility.
- Replacing the established TPP mappings or KPI definitions with guesses.
- Declaring a feature complete because code was generated; the user-facing consumer and production adapters must also be wired.
