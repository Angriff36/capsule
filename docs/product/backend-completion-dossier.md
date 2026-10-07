# Backend completion dossier

The fifteen "definition of done" items of the backend end-state spec (BE-21, acceptance rows AC-713 to AC-727), each checked against its scenario proof, the repository gate, review and Git receipts. Every row named under "Rows" is PASS in ACCEPTANCE_TESTS.md and in the coverage ledger; `tests/backend-completion-dossier.test.ts` keeps this page and the ledger in step. The open items say what they wait on, in the same words as `docs/product/qualification-report.md`.

This page does not claim Capsule is production ready. It claims only what each line names.

## Shared receipts

- Gate: the full repository gate (`bun run check`) and `bun run manifest:regen:check`, run on this batch; result and commit in definition 13.
- Model judgments of this page (definitions 01, 08) and of the real Final Lock and explanation screens (definitions 10, 11): `docs/quality/llm-review/ac-713-720-722-723-completion-dossier-2026-10-04.json`, all PASS.
- Review: every batch goes through the daily release review by a different model provider (Codex gpt-5.6-sol, fallback grok via Cursor CLI), run by the lander, never by the builder. Model judgments of real screens and documents are kept under `docs/quality/llm-review/`.
- Git: work is committed in the batch worktree, published to `dev` after each round, and reaches production only through an approved daily release (`scripts/deploy-production.sh`). Last production release: 85ded95e, 2026-10-03 (frontend and backend).

## 01 · AC-713 · A normal user can progress from lead through closed-out Event without re-entering authoritative facts in another Capsule subsystem.

- Verdict: PASS
- Rows: AC-017, AC-376, AC-323, AC-004, AC-190, AC-246
- Scenario: `tests/proofs/backend-golden-event.runtime.test.ts` walks all 22 steps (inquiry, proposal, acceptance, booking, menu, purchasing, prep, route timeline, staffing, pack list, Final Lock, packet, billing, closeout) on one event with a competing event in the same week. `tests/proofs/quote-to-booked-event.runtime.test.ts` converts a client's request without retyping; `tests/proofs/venue-flow-through.runtime.test.ts` carries venue facts to seven places. Saves survive a page reload in six areas in a signed-in browser (AC-190).
- Not covered here: the payment step of the chain (AC-103, AC-168, AC-184) waits on the paused money work.

## 02 · AC-714 · Accepted commercial scope, current operational plan, and historical actuals are separate but traceably linked.

- Verdict: PASS
- Rows: AC-418, AC-432, AC-386, AC-625, AC-628, AC-094
- Scenario: `tests/proofs/proposal-projection-agreement.runtime.test.ts` (web, PDF, signature, invoice seed and booking read one accepted revision and agree on quantities and money); `tests/proofs/price-agreement-surfaces.runtime.test.ts`; `tests/proofs/closeout-source-projection.runtime.test.ts` (closeout actuals come from settled invoices, received costs, waste and time, each linked to its source).

## 03 · AC-715 · Every authoritative change reconciles all mutable downstream domains once.

- Verdict: PASS
- Rows: AC-422, AC-423, AC-404, AC-405, AC-479, AC-471
- Scenario: `tests/proofs/canonical-change-events.runtime.test.ts`; `tests/proofs/reconciliation-receipts.runtime.test.ts` (one receipt per reconciliation with input versions and affected domains); `tests/proofs/reaction-replay-identity.runtime.test.ts` (a replay changes nothing twice); `tests/proofs/week-move-reconcile.runtime.test.ts`.

## 04 · AC-716 · Committed history is never silently rewritten.

- Verdict: PASS
- Rows: AC-480, AC-481, AC-482, AC-675, AC-683, AC-446, AC-635, AC-636, AC-061, AC-509
- Scenario: `tests/proofs/event-cancellation-matrix.runtime.test.ts` (sent orders, received stock, finished prep, dispatched trucks and payments are kept when an event is cancelled); `tests/proofs/recipe-edition-publish.runtime.test.ts` (a published recipe keeps its edition); `tests/proofs/backend-audit-attribution.runtime.test.ts` (one history row per change); `tests/proofs/client-merge-history.runtime.test.ts`; `tests/proofs/time-correction-audit.runtime.test.ts`.

## 05 · AC-717 · Unknown values stay unknown and appear as scoped exceptions.

- Verdict: PASS
- Rows: AC-042, AC-074, AC-144, AC-419, AC-450, AC-489
- Scenario: `tests/culinary-model-acceptance.test.ts` (missing yield, unknown unit or cost becomes a kitchen exception, never "each" or zero); `tests/features/kitchen/component-nutrition-unknown.test.ts`; `tests/features/production/prep-unknown-time.test.ts` (no invented times); `tests/proofs/report-total-reconciliation.runtime.test.ts` (unknown cost counted apart, not as 0); `tests/proofs/publish-availability.runtime.test.ts`.

## 06 · AC-718 · Tenant, actor, role, and Person identity are enforced server-side.

- Verdict: PASS
- Rows: AC-156, AC-684, AC-690, AC-694, AC-695, AC-696, AC-637
- Scenario: `tests/proofs/tenant-access-matrix.runtime.test.ts` (every table read and written as another company: nothing returned or changed; last run 2026-10-04 in this batch, 2/2); `tests/proofs/backend-role-matrix.runtime.test.ts` (all thirteen roles, outside agent, other company, no profile, signed out); `tests/proofs/backend-canonical-read-contract.runtime.test.ts`.

## 07 · AC-719 · External effects are idempotent, durable, retryable, and observable.

- Verdict: OPEN (waits on no-money-rule)
- Rows: AC-163, AC-208, AC-346, AC-361, AC-373, AC-634
- Scenario: proven for what Capsule sends today: `tests/proofs/backend-delivery-states.runtime.test.ts`, `tests/proofs/outbox-replay.runtime.test.ts`, `tests/proofs/sms-outbox-dedupe.runtime.test.ts`, `tests/proofs/calendar-outbox-dedupe.runtime.test.ts`, `tests/proofs/webhook-delivery-recovery.runtime.test.ts` (one send per request id, growing waits, "not sure" kept apart, managers see and retry).
- Open: QuickBooks and Stripe effects (AC-108, AC-118, AC-119) are paused money work; signed inbound provider messages (AC-207) wait on the generator's signed-route capability.

## 08 · AC-720 · For a standard Event, the rich proposal, food plan, purchasing, prep, route-backed timeline, staffing, pack list, Final Lock answers, complete packet, billing, and closeout are produced from Capsule data.

- Verdict: PASS
- Rows: AC-653, AC-655, AC-660, AC-664, AC-667, AC-670, AC-674, AC-426
- Scenario: `tests/proofs/backend-golden-event.runtime.test.ts` steps 01 to 22; `tests/proofs/route-fact.runtime.test.ts` (the timeline's drive time is a stored route fact).
- The proposal's picture section is done (AC-654 picture leg, 2026-10-04: client page, proposal file, office check; golden event 02). The payment schedule is done too (AC-654 PASS 2026-10-07: deposit share and balance days on the proposal, frozen at send, the same on the client page, signing page, proposal file and the draft invoice deposit; golden event 02/03/06).

## 09 · AC-721 · TPP, Nowsta, Galley, Goodshuffle, Event Tracker, Drive/Dropbox hunting, and the hand-built office binder are no longer required for new standard operations after their individual replacement qualification passes.

- Verdict: OPEN (waits on people)
- Rows: AC-706, AC-707, AC-708, AC-709, AC-710
- Scenario: `docs/product/replacement-dossiers.md` maps every job of each old tool to its Capsule screen and proof (J review 25/25, `docs/quality/llm-review/ac-706-710-replacement-dossiers-2026-10-03.json`).
- Open: operator trials and owner sign-off for each tool (AC-711, AC-712, AC-176).

## 10 · AC-722 · No office Final Lock question requires retyping an answer Capsule already knows, and no field-only confirmation is falsely pre-completed.

- Verdict: PASS
- Rows: AC-583, AC-586, AC-597, AC-617, AC-388, AC-384
- Scenario: `tests/event-packet-answer-engine.test.ts` and `tests/proofs/event-packet-final-lock.runtime.test.ts` (answers come from event, client, venue, menu, staffing and pack records; blank sources stay open; field confirmations are never filled in for staff); `tests/proofs/final-lock-readiness.runtime.test.ts`; `tests/features/events/packet/packet-actions.test.ts` (actions only to resolve a fact, override with a reason, prepare the packet or record a physical check).

## 11 · AC-723 · Every generated result explains what source and rule produced it, and every unresolved result states the exact human decision required.

- Verdict: PASS
- Rows: AC-642, AC-554, AC-423, AC-637
- Scenario: `tests/proofs/backend-automatic-explanations.runtime.test.ts` (proposal lines, timeline steps, planning answers, prep tasks, purchasing amounts, crew spots and pack lines each carry source, rule, override and why); `tests/features/logistics/pack-line-explanation.test.ts`; the "Why is this here?" card on the event (AC-642 J leg PASS).

## 12 · AC-724 · Every existing UI action has a documented working backend contract.

- Verdict: PASS
- Rows: AC-643, AC-644, AC-645, AC-646, AC-647, AC-648, AC-649, AC-650, AC-651, AC-652, AC-705
- Scenario: `docs/systems/ui-contract.md`, built from the code for the ten screen areas; `tests/backend-ui-contract.test.ts` fails when a screen calls a missing function or the page is out of date.

## 13 · AC-725 · Focused proofs, deterministic regeneration, and `bun run check` pass.

- Verdict: PASS
- Rows: AC-704, AC-162
- Scenario: `bun run manifest:regen:check` twice with no change (AC-704). 2026-10-04 at a28a7296: the full `bun run check` passed end to end (781/781 test files, 2558 tests, coverage thresholds, build, component catalog, baseline) and `bun run manifest:regen:check` reported generated output current.

## 14 · AC-726 · An eligible different model reviews and approves the complete diff under the repository's review rule.

- Verdict: OPEN (waits on loop-tools)
- Rows: AC-726
- Scenario: the lander runs the daily release review by a different provider and stamps each landed commit `Reviewed-by: <model> APPROVE`; the builder never runs or reads its own review.

## 15 · AC-727 · Changes are committed and pushed according to repository policy; production release occurs only when authorized.

- Verdict: OPEN (waits on loop-tools)
- Rows: AC-727
- Scenario: the builder commits only in its batch worktree and never pushes (the pre-push hook refuses its pushes); the publisher puts each round on `dev`; production changes only through the approved daily release.
