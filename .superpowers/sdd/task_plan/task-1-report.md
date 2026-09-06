# Task 1 report: immediate command and delivery honesty

## Status

Implemented Task 1 only from base `9eccdbc4d2467525cc65ba07a95cf80bded522b5` on `fix/full-wiring-audit-20260906`.

## Changes

- Proposal template revise/archive/reactivate now pass `docId` to generated commands.
- External email/SMS/social/other inbox replies stop before `createMessage`, show a visible provider-not-connected failure, and preserve the controlled draft.
- Internal threads retain a usable `Log note` action and record the note without implying external delivery.
- Historical outbound `queued` and `failed` messages display `Delivery queued` and `Delivery failed`.
- Proposal send is labeled as publication; contract and initial invoice send transitions are labeled as manual sent recording, with external-delivery guidance in success copy.
- Genuine invoice payment reminders, payment links, signature requests, and signature links were preserved.

## TDD evidence

### RED

Command:

`C:/Program Files/Git/bin/bash.exe -lc 'bun run test tests/delivery-honesty.test.ts'`

First executable RED after adding the helper seam: 1 test file failed, 5/5 tests failed for the expected missing behavior:

- external provider disposition incorrectly allowed recording;
- internal action was still named Send;
- queued/failed status labels were absent;
- proposal-template commands still passed `id`;
- proposal/contract/invoice actions still used misleading Send labels/copy.

An earlier run failed at module collection because the wished-for helper module did not yet exist; a minimal failing seam was added and RED rerun before implementation.

### GREEN

Command:

`C:/Program Files/Git/bin/bash.exe -lc 'bun run test tests/delivery-honesty.test.ts'`

Result: 1 test file passed, 5/5 tests passed.

Post-format focused command:

`C:/Program Files/Git/bin/bash.exe -lc 'bun run test tests/delivery-honesty.test.ts'`

Result: 1 test file passed, 5/5 tests passed.

## Verification

- `bun run typecheck`: passed (`tsc --noEmit`, exit 0).
- `bun run test`: passed, 141 test files and 1,303 tests, 0 failures.
- `git diff --check`: passed, no whitespace errors.
- Scoped Prettier write completed for the eight changed/added source and test files.

The suite emitted pre-existing Vitest `environmentMatchGlobs` deprecation output and React Router/useLayoutEffect SSR warnings; no test failed.

## Files

- `src/features/clients/ProposalTemplatesPage.tsx`
- `src/features/sales/MessageInboxPage.tsx`
- `src/features/sales/deliveryHonesty.ts`
- `src/features/clients/ProposalsPage.tsx`
- `src/features/clients/ContractsPage.tsx`
- `src/features/finance/InvoicesPage.tsx`
- `src/features/finance/InvoiceDetailPage.tsx`
- `tests/delivery-honesty.test.ts`

## Self-review and concerns

- External reply refusal occurs before `setSending` and before `createMessage`; `setReply("")` remains only on the internal success path, so an external draft is retained.
- No provider, generated, Manifest, policy, deployment, or production data changes were made.
- Existing historical `sent` rows are not relabeled as delivered because their true external acknowledgement cannot be established; only the explicitly required queued/failed states receive delivery labels.
- The untracked `codex-plans/full-wiring-audit/` directory was left untouched and excluded from the commit.
