<!--
Completion contract. Generated/updated by PLAN mode from acceptance criteria in specs/*.
BUILD mode gates completion on this file: every non-RETIRED criterion needs a real,
passing test — no deleting, skipping, or weakening assertions to fake a pass.

One row per acceptance criterion. Ids are stable: assign AC-001, AC-002, ... once and
never renumber. Status: PENDING (no passing test yet) | PASS (real test exists + passes)
| RETIRED (criterion dropped from specs — keep the row, add a one-line reason).

Release: "Booked without re-keying" (plan date 2026-09-03). Scope = specs/ralph/
proposal-to-event-handoff.md, quote-to-proposal-conversion.md,
reference-catalogs-self-serve.md, plus the feature-spec §4.3 done-when.
field-flow-defect-burndown.md is out of this release; its criteria get ids when
it is scheduled.

Verification kind: P = programmatic (runtime proof / unit test). J = human-like
judgment — run the llm-review gate (src/lib/llm-review.ts, criteria table
src/lib/review-criteria.md, UX-01 / TONE-01) on the rendered copy or screenshot
in addition to the programmatic test. Runtime proofs live in tests/proofs/
*.runtime.test.ts (convex-test); unit tests in tests/**/*.test.ts. A new file
under tests/proofs/ needs no registration: vitest includes tests/**/*.test.ts
(vite.config.ts:103) and `bun run test:proofs` runs the whole directory;
scripts/emit-proof-kit.ts binds only CATALOG_ENTITIES proof ids.
-->

| Id | Spec | Outcome to verify (WHAT, not HOW) | Required test | Kind | Status |
| ------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---- | ------- |
| AC-001 | specs/ralph/proposal-to-event-handoff.md | Creating an event from an accepted proposal copies every live menu selection onto the event with `quantityServings` unchanged; removed selections are not copied. Proof lives under `tests/proofs/`. | `tests/proofs/proposal-event-booking.runtime.test.ts` › "books the event, links the proposal, and copies live menu selections" (exists today at `tests/proposal-event-booking.runtime.test.ts`, 7/7 green 2026-09-03; PENDING only until moved under `tests/proofs/`) | P | PENDING |
| AC-002 | specs/ralph/proposal-to-event-handoff.md | From the created event a user can reach the source proposal (reverse lookup `listProposalByEventId`) and see which revision was accepted (highest `revisionNumber`, or `SignatureRequest.proposalRevisionId` for digital accepts); the event does not rely on free-text copies for that link. | `tests/proofs/proposal-event-booking.runtime.test.ts` › "event resolves its proposal and accepted revision" | P | PENDING |
| AC-003 | specs/ralph/proposal-to-event-handoff.md | When the proposal venue name matches a saved Venue (case/whitespace-insensitive) the event gets that `venueId`; when it does not, the create screen shows a visible mismatch notice and the operator can pick or create a venue. | `tests/features/events/proposal-event-prefill.test.ts` › "venue match and mismatch notice" | P | PENDING |
| AC-004 | specs/ralph/proposal-to-event-handoff.md | Date, start time, end time and headcount from the proposal arrive on the event as typed fields (`startsAt`, `endsAt`, `expectedHeadcount`) without re-entry; a proposal with no end time says so on the create screen instead of silently leaving the field blank. | `tests/proofs/proposal-event-booking.runtime.test.ts` › "typed date, times and headcount carry over" | P | PENDING |
| AC-005 | specs/ralph/proposal-to-event-handoff.md | Enhancements the client accepted are visible on the event (event-side card or record), not only on the proposal. | `tests/proofs/proposal-event-booking.runtime.test.ts` › "accepted enhancements reachable from the event" | P | PENDING |
| AC-006 | specs/ralph/proposal-to-event-handoff.md | Before committing, the create-event screen lists exactly which proposal values will carry over (title, type, date, times, headcount, venue, menu count, enhancement count) and why linking will or will not happen. | `tests/features/events/proposal-event-prefill.test.ts` › "preview lists carried values"; llm-review UX-01 on the preview copy | P+J | PENDING |
| AC-007 | specs/ralph/quote-to-proposal-conversion.md | A submitted quote appears in the sales queue showing contact, event date, guest count, service style, occasion, venue text and menu selections exactly as entered; unset style/occasion reads "Not specified". | `tests/features/sales/quote-submissions-review.test.ts` › "queue shows all seven submitted fields" | P | PENDING |
| AC-008 | specs/ralph/quote-to-proposal-conversion.md | One convert action creates or links the client (match by email) and produces a draft proposal pre-filled with the prospect's selections, linked to the event it created (`proposal.eventId == event._id`). | `tests/proofs/quote-conversion.runtime.test.ts` › "convert builds client, lead, event and linked proposal" | P | PENDING |
| AC-009 | specs/ralph/quote-to-proposal-conversion.md | Re-submitting the same contact + event date creates no second submission or lead; a different event date for the same contact does. | `tests/proofs/quote-conversion.runtime.test.ts` › "dedup by contact and event date" | P | PENDING |
| AC-010 | specs/ralph/quote-to-proposal-conversion.md | A junk or duplicate submission can be dismissed with a reason; the raw submission remains readable, leaves the default queue, and still participates in dedup. | `tests/proofs/quote-conversion.runtime.test.ts` › "dismiss keeps the raw submission" | P | PENDING |
| AC-011 | specs/ralph/quote-to-proposal-conversion.md | Conversion succeeds when `serviceStyles`/`occasions` have no matching row; the prospect's value surfaces as text on the submission and proposal, and nothing throws. | `tests/proofs/quote-conversion.runtime.test.ts` › "empty catalogs convert as text" | P | PENDING |
| AC-012 | specs/ralph/reference-catalogs-self-serve.md | An admin/owner can add, relabel, retire and reactivate service styles and occasions from the app; the event-create selector reflects the change without redeploy or reload. | `tests/features/admin/catalogs-page.test.ts` (new directory) › "wires register, revise, deactivate, activate per catalog" | P | PENDING |
| AC-013 | specs/ralph/reference-catalogs-self-serve.md | With zero service-style/occasion rows the operator can still create an event; each selector shows an explicit empty state with a path to fix it, never a silent blank or a crash. | `tests/features/events/create-event-blockers.test.ts` › "empty catalogs show an explicit state and do not block create"; llm-review UX-01 on the empty-state copy | P+J | PENDING |
| AC-014 | specs/ralph/reference-catalogs-self-serve.md | The public quote form submits when catalogs are empty; the free-text style/occasion fallback is captured on the submission; a missing organization row is reported to staff, not hidden. | `tests/proofs/quote-conversion.runtime.test.ts` › "public submit with empty catalogs captures free text"; `tests/features/sales/quote-submissions-review.test.ts` › "offline notice when no organization" | P | PENDING |
| AC-015 | specs/ralph/reference-catalogs-self-serve.md | A retired service style is absent from new-event selectors but still resolves by id on existing events and imported records. | `tests/features/events/service-style-retired.test.ts` › "retired hidden on create, resolved on detail" | P | PENDING |
| AC-016 | specs/ralph/reference-catalogs-self-serve.md | A runtime proof creates an event with empty catalogs (null ids accepted) and with populated catalogs (ids persist and resolve). | `tests/proofs/event-create-catalogs.runtime.test.ts` › "create with empty and populated catalogs" | P | PENDING |
| AC-017 | specs/capsule-complete-feature-spec.md §4.3 | End to end: a client submits once, sales sees the lead with all selections, converts without re-entry, the proposal is sent and accepted, and the created event carries date, times, headcount, venue, menu servings and enhancements, with the proposal pointing at the event. | `tests/proofs/quote-to-booked-event.runtime.test.ts` › "quote to booked event journey" | P | PENDING |
