# Task 7 implementation report

Status: DONE

## Implemented

- Added private, commandless `MaterializationReceipt` Manifest entity and moved authored multi-row transaction receipts out of `commandIdempotencyKeys` while preserving exact/head replay order, arbitrary JSON outputs, transactional writes, and auth/role-before-replay.
- Removed generated child `idempotencyKey` values only from parent-receipted safe materialization, culinary, stock/event-menu operations. Legacy agent and non-atomic callers were untouched.
- Added proposal template selection to proposal creation. Selection initializes editable terms, notes, validity, a fixed tax amount, visible sections, and one central-pricing percentage service-charge line. Later form edits are controlled state and remain intact.
- Persisted optional Proposal `visibleSections` through the governed draft command and authored atomic draft seam.
- Repaired ProposalTemplate audit-field schema so existing generated define/revise/archive/reactivate writes validate.
- Snapshotted visible sections, dish selections, client-facing timeline identity/times, terms, notes, expiry, pricing, and venue data into immutable revisions.
- Projected frozen fields through shared and acceptance reads. Shared/PDF visible sections use empty/absent as the legacy All sections fallback. Acceptance presentation may hide terms, but the actual signing button remains available regardless of `acceptance_cta` visibility.
- Published PDF generation consumes the latest immutable revision; malformed/missing legacy snapshots explicitly retain the prior live-data fallback. Draft PDFs continue using live data. Notes render as notes; they are no longer treated as menu rows.
- Retained Task 1 publication/share wording: creation success now says Publish and share, not Send.

## TDD evidence

### Receipt RED

Command:

`bunx vitest run tests/proofs/materialization-receipt-privacy.runtime.test.ts`

Expected failures observed: materialization receipt output was still found in `commandIdempotencyKeys`; `materializationReceipts` had no declared private index.

### Receipt GREEN

Command:

`bunx vitest run tests/proofs/materialization-receipt-privacy.runtime.test.ts tests/proofs/safe-template-materialization.runtime.test.ts tests/proofs/safe-culinary-operations.runtime.test.ts tests/proofs/operational-transactions.runtime.test.ts`

Result: 4 files passed, 21 tests passed. Proof covers unrelated generated wrapper with the old child technical key shape, unauthenticated/staff/manager/owner/admin generated-read denial, tenant stamping/isolation, rollback/replay, storage-unavailable head recovery, and arbitrary output JSON.

Actual generated indexes are `by_receiptKey` and `by_tenantId`; the encoded receipt key includes tenant and the helper additionally verifies tenant. No generated compound index is claimed or hand-patched.

### Proposal defaults RED

Command:

`bunx vitest run tests/proposal-template-defaults.test.ts`

Expected failure observed: module `proposalTemplateDefaults` did not exist.

### Proposal GREEN

Command:

`bunx vitest run tests/proposal-template-defaults.test.ts tests/proofs/proposal-template-publication.runtime.test.ts tests/proofs/proposal-event-booking.runtime.test.ts tests/proofs/quote-to-booked-event.runtime.test.ts`

Result: 4 files passed, 15 tests passed. The new runtime proof exercises ProposalTemplate define/revise, draft persistence, service-charge percentage math, fixed tax, revision capture, post-publication template mutation, and shared projection. This is actual draft-to-publication data-contract evidence.

### Renderer GREEN

Command:

`bunx vitest run tests/proposal-pdf-projection.test.ts tests/proposal-public-renderers.test.ts`

Result: 2 files passed, 5 tests passed, output pristine apart from the repository-level Vitest deprecation banner. The mounted jsdom tests execute SharedProposalPage and ProposalAcceptancePage with frozen fixtures, proving shared menu/expiry/notes/terms rendering, hidden timeline behavior, and that hiding `acceptance_cta`/terms does not remove the real Accept Proposal button. The actual `buildProposalPdf` renderer test inspects jsPDF page commands and proves dish names render under PROPOSED MENU, notes under NOTES, and excluded terms/timeline/pricing do not render. The pure production PDF projection adapter proves changed live client/event/venue/pricing/terms/notes/timeline fields cannot leak into a valid published snapshot and separately identifies malformed/missing snapshots as `legacy-live-fallback`. No pixel/browser claim is made.

## Other verification

- `bun run manifest:regen` after receipt source: success, no conflicts.
- `bun run manifest:regen` after proposal source: success, no conflicts.
- `bun run codegen`: expected local-environment failure, `No CONVEX_DEPLOYMENT set`.
- Documented fallback: `$env:CONVEX_DEPLOYMENT='befitting-armadillo-283'; bunx convex codegen --typecheck disable`: success; generated TypeScript bindings refreshed without deployment mutation.
- `bun run typecheck`: passed.
- `bun scripts/check-event-manifest-integration.ts`: passed.
- `bun scripts/check-design-vocab.ts`: passed; app.css matches DESIGN.md.
- `git diff --check`: passed.
- Named TS/TSX files formatted with Prettier. Manifest files were not sent through Prettier because it has no Manifest parser.

## Commits

- `ff40ad3 fix(materialization): isolate private operation receipts`
- `fcdcd58 feat(proposals): apply template defaults through publication`
- `8ac9ad5 test(proposals): prove frozen public renderers`

## Boundaries and concerns

- No production probe, deployment, environment change, release, old-receipt cleanup, or external repository edit was performed.
- Existing Builder dirty WIP was preserved; regen completed without conflict. Builder's broader generated-wrapper pre-auth replay defect remains issue #281.
- No production migration/cleanup claim is made. This branch has not been deployed by us.
- The generated receipt entity intentionally exposes generated query symbols that fail closed to empty/null for every normal role; the authored helper is the only write/read owner.
- PDF/shared/acceptance presentation has actual jsPDF-command and mounted-jsdom behavior coverage, not pixel/browser coverage; root owns the full suite and final acceptance gate.

## Self-review

- Checked template rate conversion (fraction to percentage), tax basis, legacy empty-section behavior, immutable revision reads, private-field exclusion from timeline, and signing control independence.
- Checked React changes for controlled draft restoration, template-owned fee identity, transient template tax recalculation until manual override, stable module-level helpers, and no new nested component definitions.
- No additional issues found in the scoped diff.

## Review fix round 1 (base `8ac9ad5`)

- Corrected template-first tax calculation so a template-selected rate follows central pricing as prices are entered, then persists as fixed currency once manually overridden.
- Replaced only the explicitly tracked template-owned service line when switching templates, including removal for a fee-free template; operator-added percentage lines are preserved. Tax is calculated from the resulting central-pricing subtotal without double-applying percentage fees.
- Restored controlled proposal state and transient template metadata from draft storage instead of relying on DOM assignment that React immediately overwrote.
- Published PDF download now waits for the revision query before deciding immutable snapshot versus explicit legacy fallback. Draft PDF download waits for dish selection and identity reads and uses real selected dish names/descriptions without placeholder data.
- PDF event overview and per-person pricing now honor `event_summary` and `pricing_summary` independently.
- Shared timeline renders actual start/end times with date context. New Menu/Timeline labels use bold uppercase section rules, and shared document section headings no longer skip from h1 to h3.
- Included the three root-produced `proof:emit` outputs for the new Manifest capability: `generated/proof/capability-catalog.json`, `generated/proof/capability-catalog.md`, and `generated/proof/proof-registry.json`; they were not hand-edited.

Review findings were the RED evidence for this round. The mounted creation test file was added after the implementation edits; its first run had three passing behaviors and one test-only subtotal text assertion mismatch, which was corrected to assert the tax control directly. No claim is made that this test run was a pre-implementation RED.

Final focused GREEN command:

`bunx vitest run tests/proposal-create-form.test.ts tests/proposal-template-defaults.test.ts tests/proposal-pdf-projection.test.ts tests/proposal-public-renderers.test.ts tests/proofs/proposal-template-publication.runtime.test.ts && bun run check:event-manifest && bun run check:commercial-manifest && bun run check:design-vocab && bun run check:proof && git diff --check`

Result: 5 files passed, 13 tests passed; event, commercial, design-vocabulary, and proof-registry guards passed; diff check passed. The mounted form tests cover template-first price entry, manual tax override, fee-bearing to different-fee to fee-free switching, and controlled draft restoration. The mounted shared renderer proves a real start/end time range. The actual jsPDF renderer proves excluded event/pricing content does not leak. The publication runtime proof remains actual draft-to-publish data-contract evidence; renderer fixture tests are explicitly not publication-flow evidence.

Additional verification: named files passed Prettier and `bun run typecheck` passed. Root's prior full gate at `8ac9ad5` remains the only full-suite result; no full suite was rerun in this fix round.

## Review fix round 2 (base `19a7567`)

The review finding was the RED evidence: native input persistence captured the hidden serialized proposal state after ordinary field edits, but removing a dynamic row emitted no native input event, so the prior stored row could be resurrected after remount/restore. The regression was authored alongside the fix, so no pre-implementation failing test run is claimed.

`useFormDraft` now exposes a debounced `schedulePersist` using the same FormData persistence path as native inputs. Proposal dynamic add/remove/template operations schedule that path after React commits. The scheduler refuses to overwrite an offered recoverable draft until Restore or Discard, preserving uncontrolled callers and existing proposal drafts. The mounted regression performs a real input save, removes the row, waits for persistence, unmounts/remounts, restores, and proves the removed row stays absent. The existing restore test now also generates an input event while a stored draft is offered, waits past debounce, and proves Restore still returns the original controlled values.

The shared renderer assertion now derives its expected date/time text from the configured production formatters instead of assuming Pacific time.

Final focused GREEN command:

`bun run typecheck && bunx vitest run tests/proposal-create-form.test.ts tests/proposal-public-renderers.test.ts tests/proposal-pdf-projection.test.ts tests/proofs/proposal-template-publication.runtime.test.ts && bun run check:design-vocab && git diff --check`

Result: typecheck passed; 4 files and 12 tests passed; the design-vocabulary guard and diff check passed. A final isolated rerun of `bunx vitest run tests/proposal-create-form.test.ts` passed 5/5 after adding the offered-draft protection assertion. Named files passed Prettier. No full suite, deployment, production probe, Manifest regeneration, or external repository change was performed.

## Review fix round 3 (base `b595b6f`)

The review finding was the RED evidence: `schedulePersist` returned for an offered draft before calling `arm()`, so a native edit made while the restore banner was visible preserved the old stored draft but failed to activate before-unload protection. The focused assertion was added with the fix; no pre-implementation failing test command is claimed.

The scheduler now verifies the form, arms unload protection, and only then suppresses storage replacement while the old draft is offered. The mounted restore test dispatches a real input while the banner is present, waits beyond debounce, asserts a cancelable `beforeunload` is prevented, and still proves Restore returns the original stored values. No other draft semantics changed.

The shared timeline fixture now uses local-date constructors, guaranteeing its start/end values remain on the same configured local date while the assertion continues to use the production formatters.

GREEN command:

`bunx prettier --write src/ui/formDraft.tsx tests/proposal-create-form.test.ts tests/proposal-public-renderers.test.ts && bunx vitest run tests/proposal-create-form.test.ts tests/proposal-public-renderers.test.ts && bun run typecheck && git diff --check`

Result: 2 files and 8 tests passed; typecheck and diff check passed; named files passed Prettier. The repository-level Vitest configuration deprecation warning remains baseline. No full suite, deployment, production probe, regeneration, or external change was performed.
