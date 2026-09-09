# Test cleanup — 2026-09-08

This implements the owner's request to repair worthwhile poor tests and remove the rest. The earlier audit remains a historical snapshot. Every one of its 123 POOR cases is accounted for in [the disposition ledger](test-cleanup-2026-09-08.csv).

| Disposition | Original cases |
| --- | ---: |
| Replace or consolidate into behavioral coverage | 86 |
| Remove redundant or implementation-specific assertions | 32 |
| Remove cases requiring a real browser, per owner instruction | 5 |
| Total | 123 |

Counts describe original cases, not a promise of one replacement per case. Broad import/route checks are consolidated into the actual workflows they were intended to protect; existing useful coverage is reused. The five browser-dependent cases concerned theme colors and lead-card text clipping. No browser runner, browser download, or new dependency is required by this change.

## What the replacements verify

- Real application routes pass through authentication and the shell into actual list and record screens. Legacy menu and packing bookmarks reach working destinations.
- Forms submit the chosen values and current record versions: event creation, quote timestamps, catalog changes, dish quantities, prep recipes, invitations, guest actions, CRM templates, incoming messages, stock receipts, demand and payroll identifiers.
- Money screens separate drafts from billed revenue, hide unknown costs/profit until reconciliation, reconstruct received purchase-order totals, exclude zero-balance invoice sends, and reveal settled payment amounts.
- Service outputs preserve human notes while removing internal menu metadata. Actual menu/BEO PDF builders emit those notes. Unverified ingredient allergens produce an explicit warning. Filled staffing needs appear in both roster and timeline choices.
- Search drops stale results while a new query is pending. The actual Convex search includes invoices beyond the old cutoff and filters tenant, deletion, status and age correctly.
- Runtime proofs exercise direct zero-balance send rejection and event cancellation cascading the original reason to related invoices and packing work without changing another event.
- The registered MCP tool executes through a real in-memory MCP client/server and selects the correct dish's prep template, quantity and instructions.

Mounted tests use jsdom; React screens, handlers, routing and domain helpers execute normally. Clerk and Convex service boundaries supply fixtures and record outgoing requests. These tests do not prove remote delivery, physical layout, browser rendering or production connectivity. Runtime proofs cover selected persistence behavior separately. A passing command-spy assertion establishes the outgoing request, not that a real backend accepted it.

## Regression probes

In an isolated repository copy, each targeted test first passed against unchanged source. Both deliberate regressions then failed their replacement test:

| Deliberate regression | Replacement |
| --- | --- |
| Save the quote's start time as its end time | `tests/quote-start-time.test.ts` |
| Select other dishes' prep templates instead of the requested dish | `tests/agent/capsule-event-prep-coordinator.test.ts` |

The previous tests allowed both defects. These are targeted sensitivity checks, not an exhaustive mutation score for the suite.

The new search runtime test also exposed a real defect: invoice search repeatedly called Convex pagination in one query. The fix uses bounded query iteration, preserving the scan and result budgets. Tracked in [issue #303](https://github.com/Angriff36/capsule/issues/303).

## Validation

`bun run check` passed: 776 tests across 173 files, the configured coverage gate, ownership/proof/domain checks, TypeScript, formatting, secrets, frontend build and baseline decay. The coverage gate measures its configured subset; its percentage is not a whole-application coverage claim. The earlier suite had 799 cases across 162 files.

Independent reviewer: **gpt-5.6-sol — APPROVE**. The review covered the fixture boundaries, removals, replacement accounting, targeted regression evidence, search fix and updated proof bindings.
