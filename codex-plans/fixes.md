# Fixes Log

## 2026-07-22 — Food-cost report full-gate isolation

- **Issue:** `bun run check` stops at the Event Manifest integration guard on unrelated dirty Event lifecycle/API-path work before reaching finance type, formatting, test, and build checks.
- **Fix:** Preserve the unrelated Event files, retain the exact gate failure, and run the food-cost slice's downstream verification independently.
- **Command:** `bun run check`; then scoped Prettier, finance route tests, secrets, and production build.

## 2026-07-22 — Food-cost report shared-tree coordination

- **Issue:** The exact food-cost implementation files and route edits appeared after the feature task's initial status snapshot, proving another session was writing the same slice.
- **Fix:** Stopped feature edits, preserved the concurrent implementation, and switched to stability checks plus review/verification before considering any narrow correction.
- **Command:** Compare filtered `git status`, file timestamps, and SHA-256 hashes across a quiet interval.

## 2026-07-22 — Global audit-log planning isolation

- **Issue:** The standard planning files belong to a prior payroll-export task, and a combined context/status/memory read returned exit 1 after an empty `rg` memory match while producing overly broad output.
- **Fix:** Preserved the prior planning files, created audit-specific planning files, and switched to focused live-repository searches with bounded output.
- **Command:** `git status --short --branch`; focused `rg` searches under authored source paths.

## 2026-07-22
- Issue: Initial discovery command used a Windows wildcard path that `rg` rejected.
  Fix: Use `rg --files` and explicit discovered paths for later searches.
  Commands: `rg --files | rg 'playwright'`
- Issue: A later source search repeated a PowerShell-incompatible glob.
  Fix: Search explicit directories and files only.
  Commands: `rg -n 'pattern' src docs tests`
- Issue: Brave Search helper was unavailable at its configured path and no API key was present.
  Fix: Used the built-in web lookup restricted to official processor sources.
  Commands: Not applicable.
- Issue: Playwright did not discover a temporary spec placed under the ignored `.artifacts` directory.
  Fix: Moved the same temporary spec to the repository root.
  Commands: `bunx playwright test payroll-export-verification.spec.ts --reporter=line --workers=1`
- Issue: A planning-file update did not match after Prettier compacted heading whitespace.
  Fix: Re-read the formatted file and applied the update against its exact content.
  Commands: Not applicable.

## 2026-07-22 — Revenue dashboard planning isolation

- **Issue:** `codex-plans/task_plan.md`, `findings.md`, and `progress.md` already belonged to the payroll export task.
- **Fix:** Created feature-specific revenue dashboard planning files in `codex-plans/` and left the prior task files untouched.
- **Command:** Planning files created with `apply_patch` after pinning `git status --short`.

## 2026-07-22 — Revenue service-line semantics

- **Issue:** Invoice line items/service categories do not exist, so allocating totals across EventDish service styles would fabricate accounting data.
- **Fix:** Use the invoice PDF's existing single `Catering services` summary category and explain that limitation in the dashboard.
- **Evidence:** `src/sales/invoice-core.manifest` and `src/features/finance/invoicePdf.ts`.

## 2026-07-22 — Revenue dashboard Playwright startup

- **Issue:** A test-owned Vite server spent the full command timeout optimizing the large dirty workspace and left its spawned Playwright process tree running.
- **Fix:** Stopped only the test-owned process ids, confirmed the documented Capsule dev server responds on port 7811, and pointed the temporary spec at that existing server.
- **Command:** `Invoke-WebRequest http://localhost:7811/revenue-dashboard-verification.html` returned 200.

## 2026-07-22 — Revenue dashboard full-gate isolation

- **Issue:** `bun run check` stops at the Event Manifest guard on unrelated dirty Event feature files before reaching the revenue feature's later checks.
- **Fix:** Preserve those files, record their exact paths, and run commercial/type/format/secrets/test/build verification separately.
- **Command:** `bun run check` failed on `EventAllergenBriefingPage.tsx` and `EventIncidentPanel.tsx` approved API-path checks.

## 2026-07-22 — Revenue dashboard Playwright artifact cleanup

- **Issue:** Playwright generated `test-results/.last-run.json`, which then appeared in the repository-wide format baseline.
- **Fix:** Deleted the test result artifact along with the temporary spec and harness after the successful run.
- **Command:** Temporary files removed with `apply_patch`.

## 2026-07-22 — Event cost summary verification isolation

- **Issue:** The repository-wide gate is blocked by unrelated Event API-path, navigation, formatting, and generated invoice-policy changes in the shared dirty checkout.
- **Fix:** Preserved those owners, verified the scoped finance files with TypeScript, targeted Prettier, Playwright, one-page PDF inspection, diff hygiene, and production build, then deleted every temporary Playwright spec.
- **Commands:** `bun run typecheck`; local Playwright 1.61.1 CLI; `bunx prettier --check` on the four finance files; `bun run build`; `bun run check`; `bun run test`.

## 2026-07-22 — Staff certification create-via enforcement

- **Issue:** A first-pass nested Person-to-Qualification aggregate was hydrated for the normal generated mutation but not for the governed `createViaSchedule` preflight, so valid prerequisite assignments would have been rejected.
- **Fix:** Modeled the selected credential as a direct tenant-scoped `Shift.requiredQualification` relation. The generated create-via path now resolves that record before checking ownership, active status, deletion, and expiry.
- **Commands:** `bun run manifest:regen`; inspected the generated `Shift_createViaSchedule` relation resolution and constraints.

## 2026-07-22 — Staff certification Playwright harness

- **Issue:** The live app correctly redirected an unauthenticated browser to Clerk, while the disposable Vite harness initially lacked the React refresh preamble and two availability-hook mocks used by the real roster page.
- **Fix:** Used an auth-free temporary Vite fixture that imported the real workforce pages and notification derivation, mocked only generated hooks, reloaded the fixture between flows, and deleted all feature-specific verification artifacts after the pass.
- **Command:** `bunx playwright test output/playwright/staff-certifications.verification.spec.ts --reporter=line --workers=1` passed 1 test.

## 2026-07-22 — Tax-rate Manifest constraint

- **Issue:** The initial `taxRateComplete` entity constraint referenced computed `appliesToAny`, which Manifest does not expose during constraint evaluation.
- **Fix:** Inlined the food/service/rental applicability expression in the constraint while keeping the computed property for reads.
- **Command:** `bun run manifest:regen` completed with zero assembly errors; `bun run typecheck` passed.

## 2026-07-22 — Client communication authorship projection

- **Issue:** `authorId: string from context.actorId` remained required in generated Convex mutation args even though generated client schemas omitted it.
- **Fix:** Stamped `authorId` from `user.id` directly in authored Manifest, regenerated, and filed issue #44 for the trusted-context emitter gap.
- **Commands:** `bun run manifest:regen`; `bun run typecheck`; `bun run check:commercial-manifest`.

## 2026-07-22 — Client communication Playwright isolation

- **Issue:** Fresh browser contexts cannot cross the app's Clerk/Convex gate without a test identity.
- **Fix:** Verified the real communication panel through a disposable Vite harness with in-memory generated-hook behavior, then deleted all feature-specific temporary artifacts.
- **Command:** `bunx playwright test --config=output/playwright/client-communication.playwright.config.ts` passed 1 Chromium test in 4.0s.

## 2026-07-22 — Personal data export identity and gate isolation

- **Issue:** Staff-owned dashboard preferences use an auth-subject identity alias, and the shared repository gate is blocked by unrelated Event direct-hook violations.
- **Fix:** Match tenant-scoped staff ownership against both Person and auth-subject IDs, preserve unrelated Event work, and verify the feature with TypeScript, scoped formatting, secrets, a disposable Chromium flow, and production build.
- **Commands:** `bun run check`; `bun run typecheck`; `bun run secrets`; `bun run build`.

## 2026-07-22 — Home dashboard widget persistence

- **Issue:** A domain-table experiment made a personal layout preference depend on a blocked local Convex schema push, while Playwright workers did not inherit the ignored Clerk environment automatically.
- **Fix:** Store the normalized layout in Clerk user metadata, retain Convex subscriptions only for live widget facts, explicitly load the two verification credentials, restore the user's prior selection, and delete the temporary spec.
- **Commands:** `bun run manifest:regen`; `bun run test -- tests/home-attention-policy.test.ts`; `bunx playwright test dashboard-home-widgets.verification.spec.ts --workers=1`; `bun run build`; `bun run check`.

## 2026-07-22 — Email subscription governed creation

- **Issue:** A single reusable `configure` command did not qualify for Builder's governed create-via inference, leaving the personal preference UI without a safe first-write mutation.
- **Fix:** Split one-time `configure` (trusted owner stamping) from owner-only `updateSubscriptions`, then regenerated so both create and update hooks are produced without hand-editing generated files.
- **Commands:** `bun run manifest:regen`; `bun run codegen`; `bun run typecheck`.

## 2026-07-22 — Email subscription Playwright isolation

- **Issue:** Fresh Playwright contexts cannot cross Clerk without a test identity, and the repository has no root Playwright config.
- **Fix:** Imported the real settings page into a disposable Vite harness, mocked only Clerk/generated network boundaries, exercised the real shared delivery renderer, restored the toggled setting, and deleted the spec, harness, results, and empty directories after the pass.
- **Command:** `bunx playwright test --config=output/playwright/email-notification-subscriptions/playwright.config.ts` passed 1 Chromium test in 2.0s.

## 2026-07-22 — Equipment reservation creation boundary

- **Issue:** Manifest Convex creation cannot hydrate the nested Equipment → reservations collection needed for an atomic overlap/capacity guard, and a generated child creator would expose a double-booking bypass.
- **Fix:** Kept reservation state and post-create lifecycle in Manifest, added one authenticated Convex transaction for availability plus insert, shared the half-open range calculator with verification, and filed `Angriff36/capsule#53` for the generator gap.
- **Commands:** `bun run manifest:regen`; `bun run codegen`; `bun run typecheck`; `bunx playwright test equipment-event-checkout.verification.spec.ts --workers=1 --reporter=line`.

## 2026-07-22 — Invoice reminder automation delivery boundary

- **Issue:** The existing invoice reminder was a one-shot manual marker that downloaded a PDF for an operator to attach; it had no due-date schedule, client delivery, Stripe link, or paid-receipt suppression.
- **Fix:** Added an authored per-invoice Convex scheduler and event-ledger worker, Resend delivery with a branded PDF, fresh Stripe Checkout links, payment-status checks, retry/idempotency handling, configurable offsets, and invoice-detail controls. Missed schedules send at most one current reminder instead of bursting every past checkpoint.
- **Commands:** `bun run codegen`; `bun run typecheck`; `bun run check:commercial-manifest`; `bun run test -- tests/finance-routes.test.ts tests/commercial-manifest-integration-guard.test.ts`; `bun run secrets`; `bun run build`; focused Bun email/PDF smoke. Full `bun run check` remains blocked by existing issue `Angriff36/capsule#40` in unrelated event pages.

## 2026-07-22 — Equipment maintenance recurrence projection

- **Issue:** Manifest Convex generation silently dropped an `addDuration(..., durationDays(...))` mutation assignment and misread a renamed command parameter from the generated creation event payload.
- **Fix:** Filed `Angriff36/capsule#54`, aligned schedule parameter/property names, and carried the UI-derived `nextDueAt` through the generated service record, event, and schedule reaction with server-side ordering constraints.
- **Commands:** `bun run manifest:regen`; `bun run typecheck`; `bun run test -- tests/manifest-convex.contract.test.ts tests/supply-manifest-integration-guard.test.ts`.

## 2026-07-22 — Equipment maintenance browser verification

- **Issue:** The first browser pass showed exact service cost `$125.50` as `$126` because the shared display formatter intentionally rounds currency to whole dollars.
- **Fix:** Added a maintenance-specific two-decimal currency formatter, reran the disposable Playwright flow successfully, and deleted the temporary spec and harness while retaining screenshot evidence.
- **Command:** `bunx playwright test equipment-maintenance-log.verification.spec.ts --workers=1 --reporter=line` passed 1 Chromium test in 2.3s.

## 2026-07-22 — Event capacity planner verification and shared-tree coordination

- **Issue:** A parallel event timeline feature was editing and regenerating the same Event domain while the capacity feature started; the first Bun-hosted Playwright worker also hung, and the first Node retry navigated away before Clerk consumed its ticket.
- **Fix:** Built isolated planner files first, waited for the timeline feature to verify, then layered capacity source changes and regenerated once. Stopped only the two exact hung Playwright workers, moved token minting outside the worker, used the proven five-second Clerk flow, reran successfully, and deleted the temporary spec. Existing direct-hook guard failures remain tracked in `Angriff36/capsule#40`.
- **Commands:** `bun run manifest:regen`; `bun run typecheck`; `bunx vitest run tests/manifest-convex.contract.test.ts tests/event-planning-foundation.test.ts`; Node Playwright CLI passed 1 temporary Chromium test in 10.5s.

## 2026-07-22 — Client portal document-library DTO and browser downloads

- **Issue:** Full generated document types would expose unrelated fields through the public portal, and missing BEO staff lookups could serialize unsupported `undefined` values.
- **Fix:** Added an event/tenant-scoped minimal document projection, narrowed PDF renderer inputs, normalized missing staff to `null`, and added on-demand downloads for signed contracts, accepted proposals, published invoices, and the live BEO.
- **Commands:** `bun run typecheck`; targeted Prettier check; `bun run check:commercial-manifest`; `bun run secrets`; `bun run build`; temporary Playwright flow passed all four PDF downloads and was deleted. Full `bun run check` remains blocked by open issues `#32`, `#40`, `#46`, and `#47`.

## 2026-07-22 — Food cost percentage report browser harness

- **Issue:** The first disposable browser harness rendered finance navigation without router context, and the first Playwright launcher resolved a second runner copy.
- **Fix:** Wrapped the real dashboard in `MemoryRouter`, invoked the installed local Playwright CLI with Node, scoped assertions to exact event rows, verified target persistence and period re-aggregation, then deleted the temporary spec, harness, and test artifacts.
- **Commands:** `bun run typecheck`; `bun run test -- tests/finance-routes.test.ts`; `node node_modules/@playwright/test/cli.js test food-cost-verification.spec.ts --reporter=line --workers=1`; scoped Prettier check; `bun run build`. Full `bun run check` remains blocked by existing Event Manifest guard issue `#40`.

## 2026-07-22 — Google Calendar sync lifecycle and verification

- **Issue:** Calendar synchronization needed automatic, idempotent create/update/delete behavior without editing generated Event mutations or persisting plaintext OAuth refresh tokens.
- **Fix:** Added signed offline OAuth, encrypted connection facts, deterministic Google event IDs, and a self-scheduling tenant reconciler over current Event state. Corrected query-result narrowing and ensured failed-or-synced prior entries are removed when an Event becomes ineligible. The temporary Playwright spec and empty `test-results` directory were deleted after verification.
- **Commands:** `bun run typecheck`; `bunx playwright test output/playwright/google-calendar-sync.verification.spec.ts --workers=1 --reporter=line` (2 passed, temporary spec deleted); scoped Prettier check; `bun run secrets`. Full `bun run check` remains blocked by existing/new unrelated issues `#32`, `#41`/`#46`, `#47`, `#57`, `#58`, and `#59`.

## 2026-07-22 — Ingredient substitution suggestions browser verification

- **Issue:** The authenticated app was blocked at Clerk session checking, so a durable mutation flow would not produce trustworthy browser evidence.
- **Fix:** Rendered the real shortage banner through a temporary Vite entry with mapped ingredient, stock, and reservation data; verified ranking, allergen warnings, cost deltas, coverage, filtering, and dismissal in Chromium; then deleted the temporary spec and harness.
- **Commands:** `bun run manifest:regen`; `bun run typecheck`; `bunx playwright test ingredient-substitution-verification.spec.ts --browser=chromium --reporter=line --workers=1` (1 passed, temporary files deleted).

## 2026-07-22 — Inventory supplier-lot receipt traceability

- **Issue:** Vendor-line receipts changed cumulative quantities but did not capture an immutable supplier lot or preserve per-partial-receipt purchase-line provenance.
- **Fix:** Required `supplierLotNumber` on receipt entry, generated an idempotent `InventoryLot` fact for each partial receipt, exposed searchable indexes and per-line lot history, and verified the real receipt UI through a disposable Vite/Playwright harness that was deleted after passing.
- **Commands:** `bun run manifest:regen`; `bun run typecheck`; `bun run check:supply-manifest`; `bun run test -- tests/supply-slice-contract.test.ts tests/manifest-convex.contract.test.ts`; `bunx playwright test output/playwright/inventory-lot-verification.spec.ts --reporter=line` (1 passed, temporary files deleted). Full `bun run check` remains blocked by unrelated Event Manifest guard issues `#40` and `#60`.
# Live event profitability — 2026-07-22

- Issue: The initial combined read-only discovery call surfaced only a nonzero wrapper result, obscuring which subcommand had no matches.
- Fix: Split checkout, planning-file, and memory discovery into independent PowerShell commands and explicitly normalize `rg` no-match exit code 1.
- Command pattern: `$matches = rg ...; if ($LASTEXITCODE -le 1) { $matches; exit 0 }`.

## 2026-07-22 — Inventory barcode scan verification harness

- **Issue:** A temporary component harness initially failed because Bun could not emit JS and imported CSS to one outfile, then Chromium blocked the resulting external module on `file://`.
- **Fix:** Built the actual React scanner into separate JS/CSS assets and injected both into a Playwright `page.setContent()` harness. Tightened an ambiguous text locator and used an ESM-safe named `node:path` import. Deleted the disposable spec and harness after both flows passed.
- **Commands:** `bun build inventory-barcode-scan.verification.tsx --outdir output/playwright/inventory-barcode-scan/bundle --target browser`; `bunx playwright test inventory-barcode-scan.verification.spec.ts --reporter=line --workers=1` (2 passed).

## 2026-07-22 — Lead pipeline generated links and browser verification

- **Issue:** A Lead must validate newly created Client/Contact/Proposal links without hand-editing generated Convex, and the documented dev server was unavailable for the required browser test.
- **Fix:** Used staged-link plus generated confirmation commands so tenant-scoped relations are hydrated server-side, required an actually sent Proposal before moving Lead to `proposalSent`, and verified the real page through a serverless disposable Vite/Playwright harness. The temporary spec, mocks, build, and run metadata were deleted after the pass.
- **Commands:** `bun run manifest:regen`; `bun run typecheck`; `bun run check:commercial-manifest`; `bun run test -- tests/clients-routes.test.ts tests/manifest-convex.contract.test.ts`; `bunx playwright test output/playwright/lead-pipeline/lead-pipeline.verification.spec.ts --reporter=line --workers=1` (1 passed); `bun run secrets`; `bun run build`. Full `bun run check` remains blocked by open Event issues `#56`, `#58`, and `#60`.

## 2026-07-22 — Live event profitability widget

- **Issue:** Event Detail had no live margin signal, and the available cost data spans issued invoices, event demand contributions on shared vendor orders, reviewed payroll inputs, and equipment reservations with incomplete pricing.
- **Fix:** Added a pure committed-cost aggregator and an industrial live P&L widget that updates from reactive generated hooks, excludes draft/cancelled/voided records, avoids charging owned asset value, and calls out unpriced labor or rentals. Integrated it near the top of Event Detail and deleted the disposable Playwright harness after verification.
- **Commands:** `bun run typecheck`; targeted `bun x prettier --check`; repository-local Playwright CLI (1 passed); `bun run build`. Full `bun run check` remains blocked by unrelated Event Manifest guard findings.

## 2026-07-22 — Lot-to-event traceability

- **Issue:** Inventory lots existed as receipt facts, but consumed event reservations had no durable lot reference, so a recall report would have required unreliable ingredient/location/timing inference.
- **Fix:** Added optional lot provenance to governed reservations, FIFO lot-aware reservation splitting with legacy-stock fallback, and a print-ready report that searches supplier lots or lot receipt windows and joins consumed facts to events and clients. Corrected the temporary Playwright server path after its first pre-launch failure and deleted the final verification fixture after the pass.
- **Commands:** `bun run manifest:regen`; `bun run typecheck`; `bun run build`; `bun run test -- tests/event-stock-reservation-coordinator.test.ts tests/event-stock-reservation-reconcile.test.ts tests/event-stock-issue-coordinator.test.ts`; `bunx playwright test --config output/playwright/lot-traceability.playwright.config.ts --reporter=line` (1 passed, temporary files deleted). Full `bun run check` reached and passed ownership/proof/registry gates, then stopped on existing Event guard issue `#60`; additional unrelated supply/runtime blockers were escalated as `#64` and `#65`.

## 2026-07-22 — Lot traceability receipt-window copy

- **Issue:** The final report filters lots by receipt date, but one empty-state sentence still referred to the earlier consumption-date interpretation.
- **Fix:** Updated the sentence to say "lot receipt-date range" so the no-results guidance matches the implemented and Playwright-verified behavior.
- **Commands:** `bun x prettier --check src/features/inventory/LotTraceabilityPage.tsx`; targeted `git diff --check`.

## 2026-07-22 — Overtime threshold alerts

- **Issue:** Scheduling managers could commit a Shift without seeing the worker's projected committed hours for that week or the amount above their overtime target.
- **Fix:** Added a local-week projection helper over scheduled/started/completed Shift durations, a browser-saved 40-hour default target, and an in-page Review shift / Schedule anyway warning before the generated create mutation. Verified the production roster component through a disposable Vite/Playwright harness and deleted the temporary spec, config, harness, and results afterward.
- **Commands:** `bun run typecheck` (passed before concurrent generated drift); `bun run test -- tests/workforce-manifest-integration-guard.test.ts` (4 passed); focused projection smoke; repository-local Playwright CLI (final run 1 passed in 4.0s); scoped Prettier (passed). Full `bun run check` remains blocked by unrelated open issues #58, #69, #70, #71, plus existing coverage/baseline issues #32 and #47.

## 2026-07-22 — Prep task dependency sequencing

- **Issue:** A nested-relation aggregate guard generated Convex code whose hydrated relation access was invalid against the persisted `Doc` type.
- **Fix:** Modeled dependency satisfaction as Manifest-owned edge state, initialized it when the dependency is declared, updated it from `PrepTaskCompleted`, and retained a live predecessor-completed guard on the public satisfy command. Tracked the generator defect in GitHub issue `#72`.
- **Commands:** `bun run manifest:regen`; `bun run typecheck`; `bun run check:production-manifest`; `bun run test tests\production-manifest-integration-guard.test.ts tests\prep-board-presentation.test.ts tests\culinary-governed-creation.runtime.test.ts` (12 passed); temporary Playwright verification (1 passed, then deleted); `bun run build`. Full `bun run check` remains blocked by unrelated Event integration-guard findings.

## 2026-07-22 — Production batch yield dashboard

- Issue: nullable `actualYield` values were coerced through `Number(null)` and treated as recorded zero output.
- Fix: return `null` before numeric coercion in `src/features/production/productionYield.ts`, preserving valid numeric zero while excluding missing actual-yield records.
- Verification: `bun run typecheck`; temporary Playwright run with `bunx playwright test --config output/playwright/production-yield-verification/playwright.config.ts` (passed, then deleted).

- Issue: the first temporary Playwright run started Vite from the temporary config directory and could not resolve the harness entry.
- Fix: set the temporary web server working directory to the repository root.
- Verification: the second Playwright run passed all behavioral assertions; all temporary verification files were deleted afterward.

## 2026-07-22 — Role permission audit

- Issue: On Windows, the initial component basename differed from its helper only by case, so TypeScript resolved the component import to the helper; the inheritance loop also needed an explicit definition type.
- Fix: Renamed the component to `RolePermissionAuditPanel.tsx`, updated the import, annotated the role definition, and applied targeted Prettier formatting.
- Commands: `bun run typecheck`; `bunx prettier --write src/features/admin/PermissionsPage.tsx src/features/admin/RolePermissionAuditPanel.tsx src/features/admin/rolePermissionAudit.ts`; targeted Prettier check.

- Issue: Broad Playwright text locators counted the same valid policy/status text in multiple report regions.
- Fix: Scoped capability and access-status assertions to the relevant member row; the final browser run passed and all temporary files were deleted.
- Commands: `bunx playwright test --config output/playwright/role-permission-audit-verification/playwright.config.ts` (1 passed in 3.6s); `bun run build`; `bun run secrets`.

## 2026-07-22 — Staff utilization reports

- Issue: PowerShell wildcard handling and an `rg` pattern beginning with `--` caused two discovery searches to be parsed as invalid arguments.
- Fix: Switched wildcard discovery to `rg --files` filtering and used the `--` option terminator for hyphen-prefixed patterns.
- Commands: `rg --files | rg <pattern>`; `rg -n -- <hyphen-prefixed-pattern> <path>`.

- Issue: The first temporary browser assertion expected `78.9%`, while the dashboard's one-decimal formatter correctly rounds 78.95% to `79%` and omits the trailing zero.
- Fix: Corrected the temporary assertion to the rendered formatter contract; the rerun passed and the temporary files were deleted.
- Commands: `node node_modules/@playwright/test/cli.js test --config output/playwright/staff-utilization-verification/playwright.config.ts`.

- Issue: The required full repository gate stopped on unrelated Event integration-guard violations before reaching later checks.
- Fix: Preserved the shared event work, confirmed open issue `#40`, and added the current EventTimelinePanel/CommandFailure evidence to that issue.
- Commands: `bun run check`; `gh issue view 40 --repo Angriff36/capsule`; `gh issue comment 40 --repo Angriff36/capsule ...`.

- Issue: The first standalone coverage attempt was killed by an overly short tool timeout.
- Fix: Reran once with a 120-second execution window; Vitest completed and showed 545 passing tests plus 17 unrelated failures already represented by issues #60/#64/#62/#63/#65/#32.
- Commands: `bun run test:coverage`; `gh issue list --repo Angriff36/capsule --state open --limit 100 --json number,title,url`.
## 2026-07-22 — Time-off request workflow

- Issue: The time-off notification filter initially imported `useUser` from unavailable `@clerk/clerk-react`.
  Fix: Switched the import to the repository-standard `@clerk/react` package already used by `MyDayPage` and `Topbar`.
  Commands: `bun run typecheck`

- Issue: Manifest rejected `deny` as a reserved command identifier.
  Fix: Named the domain command `decline` while preserving user-facing “Deny” language and the persisted `denied` status.
  Commands: `bun run manifest:regen`.

- Issue: The workforce integration guard rejected a direct custom Convex hook inside `src/features/workforce`.
  Fix: Moved the atomic scheduling client adapter to `src/lib/workforceScheduling.ts`; the guarded feature now consumes the adapter without constructing Convex hooks.
  Commands: `bun run check:workforce-manifest`; `bun run typecheck`; `bun run build`.

- Issue: Generated Shift creation cannot hydrate approved time-off rows for an atomic overlap guard.
  Fix: Added an authored atomic in-app scheduling seam, documented the bridge, and opened GitHub issue `#75` for canonical generated HTTP/MCP enforcement.
  Commands: `bun run codegen`; temporary Playwright verification with `bun x playwright test output/playwright/time-off-request-workflow.spec.ts --workers=1 --reporter=line` (1 passed, then deleted).
## 2026-07-22 — Shift swap approval runtime and Playwright runner

- **Issue:** The first Playwright invocations loaded cached CLI 1.60.0 against repository Playwright 1.61.1, so the runner rejected `test()` registration.
- **Fix:** Pin the temporary verification command to `npx playwright@1.61.1 test shift-swap-verification.spec.ts --workers=1 --reporter=line`.
- **Issue:** Manifest projected `self.id` in `Shift.applyApprovedSwap` to nonexistent Convex `doc.id`, rolling back approval.
- **Fix:** Removed the redundant id comparison from the source-owned apply stage; the approved request relation validates the exact Shift before fan-out. Regenerated with `bun run manifest:regen`, reran Playwright successfully, and filed Capsule issue #77 for the projection defect.

## 2026-07-22 — Vehicle fleet catalog verification

- **Issue:** A targeted Prettier command included `.manifest` files, but the repository has no Prettier parser for that extension.
- **Fix:** Formatted the authored TypeScript and planning Markdown separately and kept the Manifest source in the established DSL layout.
- **Issue:** The first temporary Playwright invocation loaded two runner copies and rejected test registration before discovery.
- **Fix:** Used the repository's local Playwright 1.61.1 CLI and imported `playwright/test`; the in-memory generated API lifecycle verification passed (`1 passed`) and the temporary spec was deleted.
- **Commands:** `bun run manifest:regen`; `bun run typecheck`; `bun run check:logistics-manifest`; `bun node_modules/playwright/cli.js test output/playwright/vehicle-fleet-catalog.spec.ts --reporter=line`; `bun run build`.
# 2026-09-06: Commercial command and delivery honesty

- Fixed proposal-template revise/archive/reactivate target contract (`docId`).
- Inbox external threads now explain unavailable delivery and provide Copy draft without creating an outbound row; legacy queued/failed rows say not delivered. Internal notes remain usable.
- Proposal publication and contract/invoice manual sent-recording labels no longer imply provider delivery. Real invoice reminders preserved.
- Commits: a7b5b98, 407b5c4. Independent task reviewer gpt-5.6-terra approved after one fix round.
- Verification: `bun run test` at a7b5b98: 141 files / 1303 tests pass. `bun run test tests/features/sales/message-inbox-delivery.test.ts tests/delivery-honesty.test.ts` at 407b5c4: 10 pass; `bun run typecheck` passes. Existing Vitest/React Router warnings remain. Global contract scanner: 335 direct calls, zero missing docId, nine adapters inspected.

## 2026-09-06: Measured yields and factual financial/route labels

- KDS records entered actual yield (including zero) and retains it on failure; historical report provenance caveated without rewriting records.
- Route distances/times disclose straight-line/40 km/h/missing-leg/local-order assumptions. Vendor receipt timing names purchasing-week basis. Revenue prefill names quote/budget estimate.
- Comp Master uses applied sales_commission allocations directly, actual appliedAt for calendar periods, no fabricated payouts/3% conversion, and retains allocations when Person records are missing.
- Commits2514043 and9093eed; independent gpt-5.6-terra task review approved after one fix round.
- Verification: full `bun run test`144 files/1314 tests; fix `bunx vitest run tests/features/factual-values.test.ts tests/features/production/kitchen-display-yield.test.ts --reporter verbose`7 tests; `bun run typecheck`passes. Existing warning baseline remains; raw fix log .artifacts/task-2-fix-tests.log.

## 2026-09-06: Atomic template and draft purchase-order recovery

- Pack and layout templates plus draft purchase orders commit through authored parent mutations and generated governed commands. Parent receipts and scope heads recover confirmed outcomes across ambiguous responses, changed templates and storage failures; counts describe actual saved work.
- Added authenticated typed tenant/reference validation before cached replay while preserving generated role capability behavior and existing-draft vendor reuse.
- Commits addd337,7561ac1,d71c8b4,fab99af; independent gpt-6-astra approved after three fix rounds. Generator-wide cache concern tracked separately in #281, not claimed repaired globally.
- Final command: `bun run test -- tests/pending-operation.test.ts tests/proofs/safe-template-materialization.runtime.test.ts tests/event-draft-po-coordinator.test.ts tests/event-manifest-integration-guard.test.ts tests/logistics-manifest-integration-guard.test.ts`31 pass; `bun run typecheck`pass. Early full checkpoint1320 tests passes, final gate still required after remaining groups.

## 2026-09-06: Atomic culinary clone, import and restore

- Menu clone, manual component import and snapshot restore use governed atomic operations with authenticated parent receipts; agent-driven import API remains compatible. Snapshot IDs/ownership and metadata are preserved; capture failure is a visible nonblocking warning.
- Recovery reports actual prior saved identities and preserves new reviewed input. Shared pending helper retains keys but accepts current corrections, relying on complete parent receipts at all six audited consumers.
- Commits5666235,2cc55d1,ec79152,11ec7e8; independent gpt-6-astra approves after one fix round. Restore failure rolls back existing-line removal; legacy snapshots remain compatible; deleted ingredient does not block recovery of an already committed import.
- Full checkpoint149files1338tests passed at ec79152. Final `bun run typecheck` and Task3/Task4 focused gate10files49tests pass; exact commands in task progress/report. Warning proof is helper-level with reviewed UI wiring; no authenticated browser/deployment claim.

## 2026-09-06: Operational bulk and event recovery

- Atomic stock issuance rolls back consumption if demand reconciliation fails; receipts recover actual output without consuming twice. Timeline reorder rolls back all adjustments if a later row is stale.
- Menu materialization uses atomic parent receipts, retains newly requested lines after recovery, and presents saved/stock phases with stock-only retry. Attempt identities prevent overlapping sync and stale completion; authoritative demand versions establish readiness.
- Bulk failures preserve original cause and completed/unfinished rows so successful prefixes are not repeated. Commitsf0af99a,fe98972,747f683,36be772; independent gpt-6-astra approved after two fix rounds. Final9focusedtests/types/3guards pass; full checkpoint1346tests passed before review fixes. Private receipt storage remains tracked Task7/AC041; nothing deployed.

## 2026-09-06: Shared failure workflows

- Attachment removal awaits errors and tracks pending state per row. Personal saved-view defaults are atomic and current-person scoped. Outreach ensure-open reuses governed visible rows, respects denied roles, and permits new reminders after dismissal/completion.
- Mounted revenue apply proof preserves entered amount/provenance across reactive event updates. Commits4c42c56,c8f1e6d independently approved by gpt-6-astra after one fix round;9focusedtests/typecheck pass. Full pre-review-fix checkpoint1353tests passed. Mounted personal-view projection coverage remains noted for final review; no deployment claim.

## 2026-09-06: Proposal defaults and private recovery receipts

- Commandless private receipt storage removes new recovery outputs from the globally replayable command cache and drops unused request payloads/redundant child caches. Exact/head replay and governed transaction behavior remain; broader generator issue281 is not claimed fixed.
- Proposal defaults flow through actual draft publication and immutable shared/PDF/signing representations. Template-owned fees replace cleanly; tax follows central pricing until manual override. Dynamic draft removal persists, offered drafts remain protected, and edited work still arms unload warnings.
- Commitsff40ad3,fcdcd58,8ac9ad5,19a7567,b595b6f,f8c7e34 independently approved by gpt-6-astra after three fix rounds. Actual mounted form/public-renderer, jsPDF and publication runtime evidence recorded; final8focusedtests/typecheck pass. Full check before review fixes passed1365tests/all gates except temporary root-cap cleanup. Final whole-branch gate and deployment remain separate.

## 2026-09-06: Final wiring review and verification

- fc07561 fixes outreach client relationships, visible legacy/malformed PDF fallback, No template hidden defaults and two body-copy sizes. Adds personal-view projection/exact receipt tenant proofs. All Important findings fixed; gpt-6-astra approves code/integration. One minor head-lookup test fixture gap remains explicitly open, not claimed proven.
- `bun run check` exits0:161files1376tests/all repository gates including unchanged baseline cap and local build. Regen-check green; spec lint19pass; command scan326directcalls0missingdocId. Source branch pushed; no deployment.
- Historical AC006/013 required manual receipts absent: combined statuses honestly PENDING, programmatic passes retained; independent gpt-5.6-terra approves correction.
- Plan/findings/progress and unique review evidence archived at docs/task-plans/2026-09-06-full-wiring-audit. Only reproducible review diffs/empty task folders removed; user worktrees untouched.
