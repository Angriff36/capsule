# Remaining-test audit — September 8, 2026

**Historical snapshot.** The questioned cases were reassessed and the owner-approved [September 9 cleanup](test-cleanup-2026-09-09.md) supersedes the dispositions below. The original inventory and line numbers remain unchanged for traceability.

**The remaining suite is not uniformly useful. Of 776 cases, retain 673 at their tested scope, repair or consolidate 83, replace 10, and remove 10.** Findings span 53 of the 173 files. No application code or tests were changed during this audit.

| Verdict | Cases | Recommendation |
| --- | ---: | --- |
| GOOD | 673 | Keep: meaningful behavior or an explicit public/tooling contract; no material weakness identified in this pass |
| MIXED | 83 | Keep useful assertions, but fix weak expected results, misleading scope, source coupling, or overlapping coverage |
| POOR — replace | 10 | The behavior matters, but the current test mostly checks implementation text; replace its evidence |
| POOR — remove | 10 | Redundant coverage or an unjustified implementation restriction |
| Total | 776 | Expanded cases, not independent requirements |

Thus **93 cases warrant repair/replacement/consolidation and 10 warrant removal**. These are case dispositions: a mixed case may contain many useful assertions and only one weak assertion. Do not delete an entire file because some cases are weak.

The earlier cleanup addressed the 123 cases rated POOR in the previous audit. It did not fix the 93 cases then rated MIXED. This pass rechecks those, the retained GOOD cases, and all 100 new expanded behavioral cases; it also accounts for overlap introduced by the replacements. The prior reports remain historical records.

## Inventory and method

- [Every executed case, current line, verdict, action, rationale and evidence excerpt](test-final-audit-2026-09-08.csv)
- [Every test file and its verdict counts](test-final-audit-files-2026-09-08.csv)
- [Testing principles used](testing-principles.md)

The audited code is local commit `96e0f32d`. A fresh Vitest run reports **776 passing cases in 173 files**. The source inventory contains 735 declarations; parameterized declarations expand to the executed total. Every declaration's assertions and imports were reviewed. Suspicious cases were checked against full test bodies, shared setup and helpers, production callers, and other tests protecting the same behavior. The prior case ledger supplied context; current cases were reconciled by executed name and source location, and current evidence/overrides replace historical conclusions where warranted.

This is a manual engineering assessment, not a mathematical guarantee that every retained test is minimal or that every plausible defect is covered. Identical-body comparison found no literal duplicate bodies; redundancy findings below concern equivalent scenarios and assertions, not copy/paste alone. A few deliberately selected mutation probes establish specific gaps; they do not provide a representative suite-wide mutation score. No browser was launched or installed. jsdom tests run locally without a browser executable.

## Highest-value repairs

| Evidence | Problem | Required improvement |
| --- | --- | --- |
| `tests/agent/capsule-event-prep-coordinator.test.ts:117` | Checks only three row counts. The new MCP case protects dish-template selection but not selection of existing prep tasks for the event. | Assert the actual template, task and demand IDs with competing event/dish fixtures. |
| `tests/proofs/safe-template-materialization.runtime.test.ts:235` | Two calls and two final rows prove some retry behavior, not copied content or atomic rollback. | Check stored section types, instructions, order and event IDs; induce a later failure when claiming atomicity. |
| `tests/person-auth-pick.test.ts:210`, `:218`, `:237` | `applyEmailLink` in the test performs the writes. Production decision-making executes; production persistence does not. | Keep focused decision cases and exercise the actual account-link mutation with stored-state readback. |
| `tests/event-seam-contract.test.ts:17–35` | Five cases delegate to source-scanning helpers. Finding auth/encryption calls in a particular textual order does not prove unauthorized reads are denied or stored contacts are encrypted. | Execute the read/update boundaries and inspect results and stored fields. Keep the separate genuine auth/encryption primitive tests. |
| `tests/component-text-parser.test.ts:315` | A case named “in order” checks a component name, ID and line count, but no order or line contents. | Assert the required dependency order and specific ingredient/line payloads, or narrow/consolidate the claim. |
| `tests/proofs/component-import-finalize.runtime.test.ts:167` | Much of the durable-review lifecycle repeats `safe-culinary-operations.runtime.test.ts:684`. | Consolidate the common lifecycle while preserving the multiple-new-ingredient and repository-adapter distinctions. |
| `tests/event-menu-recipe-editor-leftovers.test.ts` | Useful quantity/state helper assertions are mixed with many exact JSX, hook-name and statement-fragment locks. | Preserve distinct numerical/input-state boundaries; use actual mounted interactions for focus, typing, submission and stale refresh claims. |
| Invoice, payment-method, payroll, closeout and several other refusal proofs | Bare `toThrow()` or broad guard matches allow unrelated errors to impersonate the intended refusal. | Assert the intended cause and unchanged relevant state; preserve successful counterpart coverage. |
| `tests/proposal-public-renderers.test.ts:92` | Text “Accept Proposal” is treated as proof of an available signing control. | Inspect and activate the actual control; a heading or disabled form must not satisfy the assertion. |
| `tests/zip-archive-abuse.test.ts:407` | Positive default limits allow `Infinity`; this does not establish bounded defaults. | Assert finite, intentional bounds and test effective default-limit enforcement. |

The complete ledger identifies the remaining findings, including circular catalog expectations, count-only imported child checks, default navigation identities, test-filtered tenant rows, source-coupled report controls and misleading parser claims.

## Ten cases to remove

| File and current lines | Why they add no worthwhile evidence |
| --- | --- |
| `tests/event-lifecycle-policy.test.ts:7`, `:18` | Subsets of the exact lifecycle matrix already checked in `event-planning-foundation.test.ts:30`. |
| `tests/event-draft-po-coordinator.test.ts:110` | Repeats the same unit-mismatch fixture and output assertions already exercised at line 61. |
| `tests/delivery-honesty.test.ts:13`, `:35` | Real inbox tests already exercise the provider cases, retained draft, absent outbound call and internal note submission. These add source spelling/order locks. |
| `tests/event-menu-cost-prep-po-chain.test.ts:37`, `:54`, `:74` | Repeat creation/catalog, draft-stage and suspect-quantity evidence now protected by focused helpers and mounted workflows. |
| `tests/event-menu-recipe-picker.test.ts:108` | Freezes an exact two-name pan suggestion list; adding another valid suggestion would fail without breaking the product. |
| `tests/finance-routes.test.ts:117` | Runs `filter` inside the test around an already-covered predicate. The real invoice page now has selection/send coverage. |

The other ten POOR cases have worthwhile claims to replace: five Event seam source scans, the actual prep-sync button/no-op result, empty-catalog creation, menu-card cost output, remembered-event route behavior, and Top Clients labels. Their current weakness does not make those workflows unnecessary.

## Mocking and overlap that are justified

The shared mounted harness substitutes Clerk and Convex service boundaries. Screens, handlers, routing and domain helpers still execute. Exact command arguments establish the UI request; they do not establish acceptance or persistence by a real backend. Several focused older presentation tests also stub unused navigation or catalog collaborators; that is acceptable for their narrow rendering/calculation claims, but not evidence of those collaborators working.

Convex runtime proofs execute real authored/generated mutations and queries in `convex-test`, including persistence and selected rollback paths. They are materially different from an in-test array being patched or filtered. The HTTP inventory proof also calls the actual local dispatcher; it does not simply mock a successful response.

Multiple routes are separate mappings, and multiple tenant/role cases can protect different generated entities. Helper calculations plus mounted consumer checks can detect different defects. Shared setup, repeated words, a short assertion, or use of mocks alone was not grounds for removal. The 673 retained cases include repository tooling contracts; that total is not a count of working catering features.

## Deliberate-fault evidence

The unchanged isolated baseline passed all 776 cases. Each of these five independently applied defects also passed **all 776 cases**:

| Deliberate defect | Result | Gap demonstrated |
| --- | --- | --- |
| Drop `section.instructions` while copying a layout | 776 pass; 0 fail | Counts do not establish copied content. |
| Select existing prep tasks from other events instead of the requested event | 776 pass; 0 fail | Equal counts can hide wrong record identity; the new MCP fixture does not exercise existing-task selection. |
| Remove the actual `authSubjectId` write in `authLink.linkBySubjectEmail` | 776 pass; 0 fail | Test-local writes and mocked linking do not establish production persistence. |
| Change the ZIP default entry limit from 1000 to `Infinity` | 776 pass; 0 fail | Positive-limit assertions and custom-limit cases do not enforce bounded defaults. |
| Return “Wrong client” for Sales Dashboard client labels, leaving the expected helper text in a comment | 776 pass; 0 fail | Source text can remain while the actual call is broken; no test checks that rendered result. |

As a positive control, changing the reorder predicate from `<` to `<=` was detected: **774 passed and 2 failed**. The failing cases were `low-stock-shared-predicate.test.ts:63` and `stock-book-behavior.test.ts:73`. The helper boundary and mounted consumer both catch that real regression; their overlap protects different layers and is worth retaining.

Probes ran in a separate copy of the committed tree with separate source files; only dependencies were shared. Every fault was restored before the next run. These are audit experiments, not claims that these defects exist in the real checkout. Detailed local results and test names are under `.artifacts/test-final-audit/mutations.json`; each probe also has its full Vitest JSON/log output there.

## Local validation

The unmodified test suite passes all 776 cases. The full `bun run check` also passed: ownership/proof/domain checks, TypeScript, formatting, secrets, configured coverage, frontend build and baseline decay. The case/file ledgers reconcile to the run, and every recorded source location was checked. All six probe source files were restored and verified against the real checkout.

Only audit reports and the testing-principles index link changed in the real checkout. Audit artifacts and reports remain local and uncommitted. No push, pull-request update, issue creation, merge or deployment was performed.
