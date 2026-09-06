# Final whole-branch review fix report

Status: DONE

## Changes

- `clientOutreach.ensureOpen` now resolves the requested Client after the generated sales-authorized query and rejects missing, soft-deleted, and foreign-tenant relationships before reuse or creation. Archived same-tenant clients remain legitimate outreach targets; existing reuse/new-task and role-denial behavior is retained.
- Published proposal PDF projection now distinguishes `legacy-missing-snapshot` from `legacy-malformed-snapshot`. The production download coordinator preserves export usability and sends a nonblocking visible notice explaining when current live values were used. Valid immutable revisions and ordinary draft download behavior remain unchanged.
- Selecting `No template` removes only the tracked template-owned fee, resets visible sections to the empty/all-sections compatibility representation, and detaches automatic template tax updates while retaining the current tax, manual pricing lines, and operator-edited terms.
- The two newly added explanatory body-copy locations use the established 15px `text-base` token.
- Added a mounted `useSavedViews` caller regression proving a broader manager-visible/shared result is projected to the current owner and page only.
- Added direct `readMaterializationReceipt` helper proof for cross-tenant exact and storage-unavailable head lookups.

## Genuine RED evidence

Command:

`bunx vitest run tests/proposal-pdf-projection.test.ts tests/proposal-create-form.test.ts tests/saved-views-projection.test.ts tests/proofs/personal-views-and-outreach.runtime.test.ts tests/proofs/materialization-receipt-privacy.runtime.test.ts`

Observed before production edits: 3 files failed, 2 passed; 4 tests failed and 15 passed. The proposal projection returned the undifferentiated `legacy-live-fallback` for missing and malformed snapshots; the mounted proposal form retained two rows after selecting `No template`; outreach validation had not yet been reached because the first non-active fixture used an invalid schema literal. The fixture was corrected to the legitimate `archived` status and a real hard-deleted ID. The mounted saved-view projection and direct receipt-helper tenant proof passed immediately because those production filters were already correct; these are caller/helper coverage additions, not claimed behavioral REDs.

## Final GREEN and covering verification

Command:

`bun run typecheck; bunx vitest run tests/proposal-pdf-projection.test.ts tests/proposal-create-form.test.ts tests/saved-views-projection.test.ts tests/proofs/personal-views-and-outreach.runtime.test.ts tests/proofs/materialization-receipt-privacy.runtime.test.ts; bun run check:design-vocab; git diff --check`

Output: TypeScript completed with exit 0; Vitest reported 5 files passed and 19 tests passed; design contract reported `app.css matches DESIGN.md` with 10 text sizes, 6 radii, and 39 colors; diff check exited 0. The only test output noise was the repository-level `environmentMatchGlobs` deprecation warning.

The PDF regression invokes the same production `downloadProjectedProposalPdf` coordinator used by `ProposalsPage` and asserts its visible fallback notice callback, rather than duplicating caller logic. The mounted form regression edits terms manually, removes a restrictive template, adds more pricing after detachment, submits through the real form handler, and proves all-sections compatibility, fixed detached tax, retained manual terms/pricing, and removal of the owned fee.

## Self-review

- Rechecked all six findings against the final diff and preserved generated sales authorization before relationship validation.
- Confirmed no active-status restriction was introduced: an archived live same-tenant Client successfully creates outreach.
- Confirmed invalid Client attempts create/reuse no tasks, and existing valid create/reuse/later-create plus role denial remain covered.
- Confirmed valid revision PDFs stay immutable, drafts keep the ordinary success notice, and both legacy fallback causes remain usable and visibly identified.
- Confirmed `No template` does not discard operator-entered pricing or terms and no longer keeps template-owned fee, section restriction, fee identity, or reactive tax mode.
- Confirmed only the two review-named explanatory body-copy locations changed typography.
- No generated file, root documentation, deployment, production write, external repository, full gate, or push was performed.

## Commit

- `fc07561 fix(audit): validate final wiring boundaries`

## Concerns

- None. Root-owned `ACCEPTANCE_TESTS.md` remains modified and unstaged. Root owns scratch cleanup, the final full gate, documentation commit, and branch push.
