# PR14 — Prove the whole app is ready for real work

_Serves JTBD(s):_ Josh, Kayden, clients, sales, and Tim — complete real work reliably across the same event record.

## Job Statement

Qualify a coherent production app with end-to-end evidence instead of treating finished tasks or generated models as proof of readiness.

## Baseline and ownership

Draft requirements; shared contract: [production readiness](../../docs/product/production-readiness.md). Existing tests and release receipts remain useful regression evidence at their recorded SHA/date. The previous 21-task/19-criterion plan does not cover this new pack. This spec defines release qualification, not a replacement product roadmap or permission to activate a cutover.

## Acceptance Criteria

- [ ] PR14-01: A coverage ledger maps each production requirement to authored owners, routes/commands, focused tests, live evidence, environment, SHA, and remaining gap. Use distinct states: missing, partial, implemented-unverified, configuration-blocked, and verified; a checkbox alone is not evidence.
- [ ] PR14-02: An authorized client can request, review, accept, and pay for a native event; sales can correct and confirm it; staff can plan, prepare, pack, deliver, record time, and close it out; management can reconcile the resulting reports. Evidence follows the same event and stable identities across the handoffs.
- [ ] PR14-03: A representative imported event and its client, source history, recipes, purchasing context, and financial references work through normal screens. Imported records are not considered usable solely because they exist in the database or an attachment directory.
- [ ] PR14-04: Every shipping route family is checked for loading, empty, populated, denied, validation, conflict, and unexpected-error behavior. Enabled primary actions work; no fake metrics, dead buttons, inaccessible required fields, or terminal-only routine recovery remain.
- [ ] PR14-05: Critical client and field workflows work at 360 CSS-pixel width and desktop width with keyboard access, visible focus, labeled controls, screen-reader status, and reduced-motion settings. Nested dialogs preserve focus/escape ownership and long lists retain bounded mounting; preserve the approved DESIGN.md language rather than redesigning the app.
- [ ] PR14-06: A documented synthetic tenant with at least 10,000 events, 5,000 dishes, and proportionate related records proves bounded pagination and rendering. Proposed targets: p95 normal list/detail requests under one second and local interaction response under 200 ms, measured across at least 100 samples on recorded hardware/network. Report cold start, export, and bulk-import performance separately; no small-fixture result substitutes for this scale proof.
- [ ] PR14-07: Concurrent edits, duplicate clicks, refresh, expired authentication, offline/reconnect, and a timeout after server success are exercised on critical mutations. Confirmed work is retained, uncertain work is reconciled, and pending work is never presented as completed offline.
- [ ] PR14-08: The cutover rehearsal reconciles source/archive counts, unresolved rows, stock as-of balances, financial basis, provider mappings, backup restoration, and role access. Historical import does not send messages, collect payments, submit orders, or duplicate provider records.
- [ ] PR14-09: A production qualification report names any unavailable credentials, unresolved business definitions, security findings, or unsupported source rows and their affected workflows. A required blocked workflow prevents an unconditional “full production ready” claim without blocking unrelated verified work.
- [ ] PR14-10: The owner can review a concise release/cutover receipt with actual URL/version, completed role scenarios, reconciliations, known limitations, and recovery contact. Enabling real cutover or destructive replacement requires explicit authorization; routine validation and reversible preparation do not acquire new approval gates.

## Dependencies and proof

PR01–PR13 supply the capabilities and focused proof. Add integration/qualification evidence without renumbering historical AC IDs or weakening existing tests. Keep private source files and customer evidence out of tracked/public artifacts; commit sanitized fixtures and redacted evidence summaries. A failed or unrun check must be reported as such.

## Out of Scope

This is not a rewrite, a claim of compliance certification, or authorization to migrate/deploy now. These requirements are a minimum for the documented product, not a ceiling that excludes discovered necessary work.

## Open Questions

Confirm production workload assumptions, acceptance hardware/network, cutover date, and reconciliation observation period. Performance targets above are proposed qualification defaults, not measurements or previously approved service guarantees.
