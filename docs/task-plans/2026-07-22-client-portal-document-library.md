# Client Portal Document Library — Completed 2026-07-22

## Outcome

The existing account-free event portal now exposes an event-scoped document library. Clients can download signed contracts, accepted proposals, published invoices, and the live BEO as branded PDFs.

## Implementation

- Extended the token-authorized Convex projection with minimal, tenant/event-scoped PDF inputs.
- Excluded draft, voided, written-off, deleted, cross-tenant, and unrelated-event commercial records.
- Added a programmatic signed-contract PDF and reused the existing proposal, invoice, and BEO jsPDF builders through narrow structural types.
- Added a responsive document grid with download progress, success, error, and empty-commercial-document states.
- Kept BEO staff exposure to display names and assignment details; contact records remain private.

## Verification

- Passed: `bun run typecheck`.
- Passed: feature-scoped Prettier check.
- Passed: `bun run check:commercial-manifest`.
- Passed: `bun run secrets`.
- Passed: `bun run build` (625 modules transformed).
- Passed: temporary Playwright verification of four rendered document cards, four valid PDF downloads with expected filenames, and 390px no-overflow behavior. Temporary verification sources were deleted.
- Independent review found no substantive feature issue and separately passed the four-download browser flow.

## Repository Gate Baseline

`bun run check` was attempted and stopped on unrelated Event integration guard findings. Later gates were run separately: coverage reported 518 passing and 13 baseline failures; repository formatting and root-entry decay remain blocked by shared runtime/feature artifacts. Existing issues `Angriff36/capsule#32`, `#40`, `#46`, and `#47` track those blockers.
