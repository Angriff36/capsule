# Deletion-first review of the 103 questioned tests

**Applied with owner approval on September 9, 2026.** See the [completed cleanup and validation](test-cleanup-2026-09-09.md). The recommendation and pre-cleanup evidence below are preserved as the decision record.

**Recommend deleting 46 cases outright, folding four small useful distinctions into existing tests, and retaining the meaningful behavior in 53. Nothing requires preserving all 103.** This supersedes the earlier recommendation to repair/replace 93 and remove only ten.

| Recommendation | Cases | What it means |
| --- | ---: | --- |
| DELETE | 46 | Remove the case without making a replacement test a prerequisite. |
| FOLD | 4 | Add a specific assertion/fixture distinction to an existing behavioral test, then remove the standalone case. |
| KEEP | 53 | A concrete behavior earns retention; remove source locks, fake persistence assertions and misleading claims as indicated. |
| Total | 103 | All questioned cases have an individual decision. |

This would remove **50 standalone cases**, taking the suite from 776 to 726 if the four folds add assertions rather than new cases. No application code or checkout tests were changed during this review. All work stayed local.

The [complete 103-case ledger](test-deletion-review-2026-09-08.csv) gives each current file/line, test name, recommendation, actual value or deletion reason, and the previous weakness. KEEP is an engineering recommendation, not a claim that every assertion or existing product policy is necessary.

## What changed in the reasoning

The earlier audit confused an important feature with a valuable test of that feature. An authentication feature can matter while a test that searches for an authentication function name provides almost no useful evidence. Deleting that test does not require commissioning a replacement first.

For each case, this pass examined its assertions, the production path actually executed, neighboring tests and newer behavioral coverage. The question was what useful failure detection would disappear, rather than whether a more ambitious test could be imagined. Small losses were accepted explicitly: an extra formatting example, a metadata flag, or a source-style tripwire need not earn permanent maintenance.

## Three demonstrated reasons to retain specific tests

In an isolated copy of local commit `96e0f32d`, all 103 were temporarily omitted. The remaining **673 passed**. Three deliberate production faults were then tested separately, both with the full suite and with those 103 absent:

| Deliberate fault | Full suite | Without the 103 | Sole test detecting it |
| --- | --- | --- | --- |
| Treat credits reducing an invoice balance as collected cash | 775 pass, 1 fail | 673 pass | [reports-routes.test.ts](../../tests/reports-routes.test.ts), line 62 |
| Ignore the recovered pack-template receipt and write the items again on retry | 775 pass, 1 fail | 673 pass | [safe-template-materialization.runtime.test.ts](../../tests/proofs/safe-template-materialization.runtime.test.ts), line 94 |
| Remove rounding before formatting a decimal recipe quantity, exposing floating-point noise | 775 pass, 1 fail | 673 pass | [event-menu-recipe-editor-leftovers.test.ts](../../tests/event-menu-recipe-editor-leftovers.test.ts), line 596 |

Those tests catch wrong money, duplicate operational records and incorrect quantity display. Their benefit is observable. This experiment does **not** establish a mutation score or prove all 53 retained cases are indispensable; the remaining retention decisions come from their actual behavior and overlap review.

The scratch experiment restored every modified test and production file afterward. Machine-readable results are in `.artifacts/test-final-audit/marginal-results.json`, with the associated Vitest JSON reports and logs alongside it. Early experimental runs exposed empty describe blocks after omission and a missing Bun PATH; both harness issues were corrected before the successful baseline and all six fault runs reported above.

## Why the other retained behavior matters

- **Saved work and retry behavior:** unsaved recipe quantity drafts survive stale parent data; durable import edits survive reload and stale-revision rejection; repeated imports, layouts and purchase-order materialization avoid duplicates; a failed later pack write rolls back earlier writes.
- **Correct operational values:** line servings override event headcount, explicit pan counts survive save-plan round-trips, old packing notes retain their quantity, blank ingredient cost is accepted, and a kitchen operator can submit an actual yield of zero.
- **Working input and navigation:** real input decisions keep search text from overwriting ingredient names, keep cleared searches from being resurrected by stale input, preserve select-all and refresh chords, and avoid navigation while typing.
- **Real command and record boundaries:** cross-tenant vendor references and report archive attempts are rejected, booking cannot link a foreign event or create a second event for an already-booked proposal, and command-specific financial writes exercise their existing access rules. These tests execute the commands; a role matrix or source string elsewhere is not equivalent. Their broad exception assertions still need narrowing. Retaining a test of a policy does not make that policy immune to product simplification.
- **Actual integration contracts:** command catalog completeness, API-key owner identity at the gateway, import orchestration, report-period filtering and the public acceptance page's hidden-section configuration cover different paths from neighboring happy-path tests. Deployment configuration is an executable artifact worth checking, although inspecting its text does not prove a deployment succeeded.

For example, the layout test's row counts do catch missing copies and duplicate retries even though they miss lost instructions. That is a reason to retain its limited real behavior and narrow its claim, not demand a large new layout test suite.

## What can go without replacement

The 46 deletions include the five Event seam source scanners, the two allergen manifest/schema regex tests, redundant menu-cost and invoice-total checks, source-only route and UI wiring assertions, the exact container-suggestion list, and repeated recipe-editor constant/helper checks. Browser behavior is not established by putting a handler on a test-created input and asserting that the handler works.

The legacy finalizer proof also overlaps the document-entry proof's same finalizer path, component header, three lines and created ingredient. Its existing-ingredient fixture never asserts persisted reuse. Delete the overlapping test; the legacy finalizer code itself still has a production caller in the agent and is not being declared dead.

The positive ZIP-default test is especially weak: Infinity satisfies its positive-number assertions. Earlier scratch fault checks also showed the full suite passing with lost layout instructions, wrong-event prep task selection, removed account-link persistence and broken actual sales client labels. Those are acknowledged gaps, not evidence that the ineffective source/count tests must be kept or replaced before deletion.

## The four folds

| Remove standalone case | Preserve this small distinction in an existing case |
| --- | --- |
| Event prep coordinator, line 184 | Add the no host-created demand assertion to the real MCP workflow at line 18 in the same file. |
| Recipe editor leftovers, line 61 | Add numeric-input navigation suppression to the real search-input/button decision matrix in recipe-search-keys, line 100. Actual mounted selection already checks quantity focus. |
| Proposal event prefill, line 10 | Give the mounted event-create prefill case at line 103 a venue name with different case/whitespace. Its existing selected-venue assertion then covers tolerant matching. |
| Stock-book editor focus, line 72 | Add Enter-does-not-dismiss to the actual mounted transfer editor case in stock-book-behavior, line 150, before its existing Escape check. |

No deletion was performed in the working checkout. The recommendation is evidence for the next cleanup, not a claim that removing tests changes application behavior or closes the remaining coverage gaps.
