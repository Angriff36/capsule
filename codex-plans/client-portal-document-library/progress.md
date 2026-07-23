# Progress: Client Portal Document Library

## 2026-07-22

- Read project context instructions and applicable frontend, Playwright, and file-planning skills.
- Pinned branch and dirty working-tree baseline.
- Confirmed `npx` is installed at `C:\Program Files\nodejs\npx.ps1` for Playwright tooling.
- Started focused codebase inspection.
- Completed the source/status/index/PDF input trace.
- Defined an event-scoped, field-minimized document projection and download UX.
- Extended the public projection with signed contracts, accepted proposals, published invoices, and the live BEO inputs while omitting unrelated events and staff contact details.
- Added a jsPDF contract builder and narrowed the existing proposal, invoice, and BEO builders to structural inputs so the anonymous DTO remains minimal.
- Added the responsive document-library UI and download feedback.
- `bun run typecheck` passed after implementation.
- The first temporary Playwright run reached the feature but had an ambiguous count selector; the exact selector fixed the test.
- The second temporary Playwright run passed: all four downloads had expected filenames, valid PDF headers, non-trivial bytes, and no 390px horizontal overflow.
- Deleted the temporary HTML fixture, React fixture, Playwright spec, and run marker after the successful verification.
- Post-pass review replaced possible `undefined` Convex response values with `null`.
- Targeted Prettier check passed after formatting the null-normalization change.
- `bun run check` passed toolchain, ownership, proof emission/validation, and registry pinning, then stopped at unrelated Event integration guard findings before reaching later gates.
- `bun run check:commercial-manifest` and `bun run secrets` passed.
- Repository-wide `format:check` remains blocked by 39 unrelated `.aboardai/**`, reviewer-output, and test-result files; the feature-scoped Prettier check passes.
- `bun run test:coverage` completed with 518 passing and 13 unrelated failures (Event guard, stale mapping/navigation expectations, and the existing generated Invoice permission cascade).
- `bun run build` passed with 625 modules transformed; the four PDF helpers emitted as production assets.
- `bun run baseline:decay` remains blocked by 58 shared root entries against the cap of 44 (`Angriff36/capsule#47`).
- Open issues `#32`, `#40`, `#46`, and `#47` cover the observed generated Invoice, Event guard, artifact-formatting, and root-entry-cap blockers.
- Independent review agreed the document projection is tenant/event scoped and the browser flow produces all four readable PDFs; no substantive feature finding remained.
- Resumed the existing feature-specific plan, re-pinned the dirty checkout, and confirmed the authored portal/PDF seams remain the narrow implementation boundary.
- Confirmed the implementation passes `bun run typecheck`.
- Created the required disposable Playwright fixture/spec; its first run exposed a fixture-rendering problem before any feature assertion could execute.
