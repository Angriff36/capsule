<!--
Completion contract. Generated/updated by PLAN mode from acceptance criteria in specs/*.
BUILD mode gates completion on this file: every non-RETIRED criterion needs a real,
passing test — no deleting, skipping, or weakening assertions to fake a pass.

One row per acceptance criterion. Ids are stable: assign AC-001, AC-002, ... once and
never renumber. Status: PENDING (no passing test yet) | PASS (real test exists + passes)
| RETIRED (criterion dropped from specs — keep the row, add a one-line reason).

Release: "Booked without re-keying" (plan date 2026-09-03; AC-001 … AC-019). Scope = specs/ralph/
signed-proposal-becomes-the-event.md, public-quote-form.md,
dropdown-lists-and-their-admin-screen.md, plus the feature-spec §4.3 done-when.
known-bugs-142-to-151.md is out of this release; its criteria get ids when
it is scheduled. The client portal / pay-from-phone job has code but no spec
yet (see IMPLEMENTATION_PLAN.md future work); it gets a spec and ids when
scheduled.

Verification kind: P = programmatic (runtime proof / unit test). J = human-like
judgment — run the llm-review gate (src/lib/llm-review.ts, criteria table
src/lib/review-criteria.md, UX-01 / TONE-01) on the rendered copy or screenshot
in addition to the programmatic test. `createReview()` THROWS when
ANTHROPIC_API_KEY is unset (llm-review.ts:134,137) and is not wired into
`bun run check` (vitest `include` is tests/**/*.test.ts only, vite.config.ts:103,
so src/lib/llm-review.test.ts never runs in the gate; run it by path:
`bunx vitest run src/lib/llm-review.test.ts`). J reviews run manually with the key present; output is saved
under .artifacts/llm-review/<AC-id>.md; they are never added to `bun run
check`. The P test is the gate the loop halts on; the J review is recorded
evidence.

Runtime proofs live in tests/proofs/*.runtime.test.ts. Everything under
tests/proofs/** runs in the `edge-runtime` environment (vite.config.ts:104
`environmentMatchGlobs` is `[["tests/proofs/**", "edge-runtime"]]`; the
default is `node`, so the root-level booking proof runs in node until C1
moves it). Proofs boot
via `createManifestTestContext({ convexTest, schema, modules })` from
`@angriff36/manifest/proof-kit/convex-test` with `modules` from
tests/proofs/convex-test-modules.ts, and need the CONVEX_FIELD_ENCRYPTION_KEY
`beforeAll` fallback (pattern: tests/proofs/event-approve-opens-packlist
.runtime.test.ts:1-30). New proof files for Event/Proposal/QuoteSubmission
need no registry entry: scripts/emit-proof-kit.ts binds `runtimeTest` paths
only for CATALOG_ENTITIES capabilities (:43-52, :232-266) and `check:proof`
validates only those generated artifacts — the existing root-level booking
proof already runs unregistered. Unit tests under tests/features/** are
pure-helper or `readFileSync` source-text assertions; no @testing-library/react
is installed (only jsdom), so do not plan render tests.
-->

| Id | Spec | Outcome to verify (WHAT, not HOW) | Required test | Kind | Status |
| ------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---- | ------- |
| AC-001 | specs/ralph/signed-proposal-becomes-the-event.md | Creating an event from an accepted proposal copies every live menu selection onto the event with `quantityServings` unchanged; removed selections are not copied. Proof lives under `tests/proofs/`. | `tests/proofs/proposal-event-booking.runtime.test.ts` › "books the event, links the proposal, and copies live menu selections" (exists today at `tests/proposal-event-booking.runtime.test.ts`, 7/7 green 2026-09-03; PENDING only until moved under `tests/proofs/`) | P | PENDING |
| AC-002 | specs/ralph/signed-proposal-becomes-the-event.md | From the created event a user can reach the source proposal (reverse lookup `listProposalByEventId`) and see which revision was accepted (highest `revisionNumber`, or `SignatureRequest.proposalRevisionId` for digital accepts); a proposal with no revision (agent bundle path, issue #241) shows the proposal number and "no revision captured" without throwing; the event does not rely on free-text copies for that link. | `tests/proofs/proposal-event-booking.runtime.test.ts` › "event resolves its proposal and accepted revision" | P | PENDING |
| AC-003 | specs/ralph/signed-proposal-becomes-the-event.md | When the proposal venue name matches a saved Venue (case/whitespace-insensitive) the event gets that `venueId`; when it does not, the create screen shows a visible mismatch notice and the operator can pick or create a venue. | `tests/features/events/proposal-event-prefill.test.ts` › "venue match and mismatch notice" | P | PENDING |
| AC-004 | specs/ralph/signed-proposal-becomes-the-event.md | Date, start time, end time and headcount from the proposal arrive on the event as typed fields (`startsAt`, `endsAt`, `expectedHeadcount`) without re-entry; a proposal with no end time says so on the create screen instead of silently leaving the field blank. | `tests/proofs/proposal-event-booking.runtime.test.ts` › "typed date, times and headcount carry over" | P | PENDING |
| AC-005 | specs/ralph/signed-proposal-becomes-the-event.md | Enhancements the client accepted are visible on the event (event-side card or record), not only on the proposal. | `tests/proofs/proposal-event-booking.runtime.test.ts` › "accepted enhancements reachable from the event" | P | PENDING |
| AC-006 | specs/ralph/signed-proposal-becomes-the-event.md | Before committing, the create-event screen lists exactly which proposal values will carry over (title, type, date, times, headcount, venue, menu count, enhancement count) and why linking will or will not happen. | `tests/features/events/proposal-event-prefill.test.ts` › "preview lists carried values"; llm-review UX-01 on the preview copy | P+J | PENDING |
| AC-007 | specs/ralph/public-quote-form.md | A submitted quote appears in the sales queue showing contact, event date, guest count, service style, occasion, venue text and menu selections exactly as entered; unset style/occasion reads "Not specified". | `tests/features/sales/quote-submissions-review.test.ts` › "queue shows all seven submitted fields" | P | PASS |
| AC-008 | specs/ralph/public-quote-form.md | One convert action creates or links the client (match by email) and produces a draft proposal pre-filled with the prospect's selections, linked to the event it created (`proposal.eventId == event._id`). | `tests/proofs/quote-conversion.runtime.test.ts` › "convert builds client, lead, event and linked proposal" | P | PASS |
| AC-009 | specs/ralph/public-quote-form.md | Re-submitting the same contact + event date creates no second submission or lead; a different event date for the same contact does. | `tests/proofs/quote-conversion.runtime.test.ts` › "dedup by contact and event date" | P | PASS |
| AC-010 | specs/ralph/public-quote-form.md | A junk or duplicate submission can be dismissed with a reason; the raw submission remains readable, leaves the default queue, and still participates in dedup. | `tests/proofs/quote-conversion.runtime.test.ts` › "dismiss keeps the raw submission" | P | PASS |
| AC-011 | specs/ralph/public-quote-form.md | Conversion succeeds when `serviceStyles`/`occasions` have no matching row; the prospect's value surfaces as text on the submission and proposal, and nothing throws. | `tests/proofs/quote-conversion.runtime.test.ts` › "empty catalogs convert as text" | P | PENDING |
| AC-012 | specs/ralph/dropdown-lists-and-their-admin-screen.md | An admin/owner can add, relabel, retire and reactivate service styles and occasions from the app; the event-create selector reflects the change without redeploy or reload. | `tests/features/admin/catalogs-page.test.ts` (new directory) › "wires register, revise, deactivate, activate per catalog" | P | PENDING |
| AC-013 | specs/ralph/dropdown-lists-and-their-admin-screen.md | With zero service-style/occasion rows the operator can still create an event; each selector shows an explicit empty state with a path to fix it, never a silent blank or a crash. | `tests/features/events/create-event-blockers.test.ts` › "empty catalogs show an explicit state and do not block create"; llm-review UX-01 on the empty-state copy | P+J | PENDING |
| AC-014 | specs/ralph/dropdown-lists-and-their-admin-screen.md | The public quote form submits when catalogs are empty; the free-text style/occasion fallback is captured on the submission; a missing organization row is reported to staff with a link to where it is created (`/admin/branding`), not hidden. | `tests/proofs/quote-conversion.runtime.test.ts` › "public submit with empty catalogs captures free text"; `tests/features/sales/quote-submissions-review.test.ts` › "offline notice when no organization" | P | PENDING |
| AC-015 | specs/ralph/dropdown-lists-and-their-admin-screen.md | A retired service style is absent from new-event selectors but still resolves by id on existing events and imported records. | `tests/features/events/service-style-retired.test.ts` › "retired hidden on create, resolved on detail" | P | PENDING |
| AC-016 | specs/ralph/dropdown-lists-and-their-admin-screen.md | A runtime proof creates an event with empty catalogs (null ids accepted) and with populated catalogs (ids persist and resolve). | `tests/proofs/event-create-catalogs.runtime.test.ts` › "create with empty and populated catalogs" | P | PENDING |
| AC-017 | specs/capsule-complete-feature-spec.md §4.3 done-when + specs/ralph/signed-proposal-becomes-the-event.md (composite journey; §4.3 alone ends at the draft proposal) | End to end: a client submits once, sales sees the lead with all selections, converts without re-entry, the proposal is sent and accepted, and the created event carries date, times, headcount, venue, menu servings and enhancements, with the proposal pointing at the event. | `tests/proofs/quote-to-booked-event.runtime.test.ts` › "quote to booked event journey" | P | PENDING |
| AC-018 | specs/ralph/public-quote-form.md | After conversion, sales reaches the created proposal in one click from the quote queue and from the lead pipeline (deep link `/clients/proposals?proposal=<id>`), and the queue is reachable from the pipeline. | `tests/features/sales/quote-submissions-review.test.ts` › "queue and pipeline deep-link to the converted proposal" | P | PENDING |
| AC-019 | specs/ralph/public-quote-form.md | A conversion that failed part-way shows which records were already created (client, lead, event, proposal links from the checkpointed ids), can be retried without duplicating those records, and can be dismissed; no partial record is unreachable from the queue. | `tests/features/sales/quote-submissions-review.test.ts` › "failed row shows checkpointed records"; `tests/proofs/quote-conversion.runtime.test.ts` › "retry after partial failure reuses checkpointed records" | P | PENDING |
