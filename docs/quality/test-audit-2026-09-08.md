# Test reassessment — September 8, 2026

**583 cases are worth keeping as useful evidence, 93 need repair or a narrower
claim, and 123 are poor tests in their current form.** This reviews the remaining
799 cases in 162 files after the earlier authorized cleanup. No further tests
were deleted, disabled or rewritten during this reassessment.

| Verdict | Cases | Share | Meaning |
| --- | ---: | ---: | --- |
| GOOD | 583 | 73.0% | Keep: a real behavior, public contract or repository validator has meaningful assertions |
| MIXED | 93 | 11.6% | Preserve useful assertions; fix a weak expected result, source coupling, duplication or overstated claim |
| POOR | 123 | 15.4% | Candidates for removal or replacement: source change detectors, redundant checks or unsupported behavior claims |
| Total | 799 | 100% | Test cases, not independent requirements or working features |

The GOOD total includes **516 application behavior/public-contract cases and
67 repository-tooling cases**. Tooling tests protect construction and validation
rules; they do not prove the catering app works. A GOOD helper test likewise does
not prove that its screen calls the helper correctly.

My previous assessment was too generous: it counted 655 cases as useful based
heavily on production execution and test layer. This review asks whether the
assertions can distinguish the claimed correct behavior from a plausible defect.
Some previously weak public navigation contracts were also upgraded: a small
test is not bad merely because its expected result is a fixed URL or label.
The new 583 total happens to equal the previous behavior-only count; these are
different populations and definitions.

## Complete inventory and method

- [Every expanded case, verdict, rationale, action and evidence excerpt](test-audit-2026-09-08.csv)
- [Counts for each of the 162 test files](test-audit-files-2026-09-08.csv)
- [Persistent testing principles and research sources](testing-principles.md)

The source snapshot is cleanup commit `ff8fd0c7` on `Build-Streamline`. The
inventory contains 793 test declarations, expanding to 799 executed cases
through parameterization. I revisited every declaration's assertions and
imports, consulted setup, helper implementations and production paths for
ambiguous cases, and reconciled the inventory with the 799-case run results.
The evidence excerpts are intentionally abbreviated; file and line identify
the complete test. This is a manual engineering assessment, not an automated
quality score or a line-by-line proof of every transitive dependency.

The research included complete transcripts of Ian Cooper's *TDD, Where Did It
All Go Wrong?* and Kent C. Dodds's *Write tests. Not too many. Mostly integration.*,
plus primary articles from Dodds, Google Testing Blog and Martin Fowler. Links,
timestamps and the resulting criteria are recorded in the principles document.

## What is doing useful work

| Area and example | Actual evidence | Structural value |
| --- | --- | --- |
| [Finance money truth](../../tests/finance-money-truth.test.ts) | Independent expected billed, collected, drafted and reconciled amounts | Protects shared financial meaning used by several screens |
| [Low-stock predicate](../../tests/low-stock-shared-predicate.test.ts) | Below/equal/above threshold inputs, plus notification and widget output | Protects an important boundary and selected consumers |
| [ZIP handling](../../tests/zip-archive-abuse.test.ts) and [XLSX interpretation](../../tests/xlsx-date-formats.test.ts) | Crafted bytes, exact values and named corruption/limit errors | Protects imported data interpretation and resource bounds; the CSV calls out weaker cases within these files |
| [Operational transactions](../../tests/proofs/operational-transactions.runtime.test.ts) | Real Convex test-harness mutations, stored-state readback, rollback and retry | Protects relationships and atomic writes across stock, demand, menus and timelines |
| [Mounted import review](../../tests/features/kitchen/component-import-review.test.ts) | Real component input, failed saves, conflict recovery and retained edits | Protects the UI-to-command boundary that pure helper tests miss |
| [Mounted attachment interactions](../../tests/task-6-mounted-interactions.test.ts) | Pending/failed operations and concurrent rows | Protects actual user interaction and async state transitions |
| [Deployment configuration](../../tests/deployment-config-check.test.ts) and [Builder ownership](../../tests/builder-regen-guard.test.ts) | Valid and invalid fixture inputs produce expected findings | Protects repository tooling; independent of whether a catering workflow succeeds |

Many backend proofs exercise generated commands and inspect stored records.
Those are materially stronger than the deleted export-existence tests. Using
`convex-test` rather than a production server does not make them fake; the domain
implementation executes. It does limit what they establish about deployed
services, authentication-provider integration and the browser.

Two examples guard against overzealous pruning: the fingerprint test checks
both repeatability and a differing input, so a constant return fails. The billed
status test iterates a production list but also checks that list against explicit
expected statuses, so removing a billed status does not silently pass.

## Where confidence is inflated

| Test | Verdict | What is wrong with the evidence |
| --- | --- | --- |
| [Quote start time, line 5](../../tests/quote-start-time.test.ts) | POOR | Finds strings in source; never submits the form or checks the resulting timestamp |
| [Event prep loader, line 22](../../tests/agent/capsule-event-prep-coordinator.test.ts) | MIXED | Calls production code but checks lengths instead of which dish's rows were selected |
| [Layout materialization, line 235](../../tests/proofs/safe-template-materialization.runtime.test.ts) | MIXED | Two backend calls and a final count protect against duplication, but do not prove copied instructions or rollback |
| [Account linking, lines 210/218/237](../../tests/person-auth-pick.test.ts) | MIXED | Production chooses a person; the test's own `applyEmailLink` helper performs the supposed persistence |
| [Import finalizer, line 315](../../tests/component-text-parser.test.ts) | MIXED | Records calls but never asserts the claimed order or complete ingredient/line arguments |
| [Kitchen invoice denial, line 161](../../tests/proofs/invoice-payment-lifecycle.runtime.test.ts) | MIXED | Bare `toThrow()` plus no new invoice can pass for an unrelated error, without demonstrating the intended role denial |
| [Dropped eventId, line 209](../../tests/time-record-event-link.test.ts) | POOR | Supplies eventId and tests forwarding again; never drops it |
| [Default retry budget, line 302](../../tests/person-auth-pick.test.ts) | POOR | Succeeds on the first JWT attempt, so never observes the retry budget |
| [Leftover marker, line 147](../../tests/event-menu-cost-prep-po-chain.test.ts) | POOR | Compares a locally created object and bans an old source marker instead of executing the workflow |
| [Registered prep tool, line 11](../../tests/agent/capsule-event-prep-coordinator.test.ts) | POOR | A name appears on a registration spy; an inert handler would still pass |
| [Dish allergen “runtime” proofs](../../tests/proofs/dish-allergen-summary.runtime.test.ts) | MIXED | A stored schema field is a legitimate contract, but these two tests read text and run no allergen behavior |

Source searches are the dominant low-value pattern. They often freeze exact
hook names, JSX fragments, CSS values or source statement order. The expected
strings can exist in comments or unreachable code while the feature is broken.
Conversely, moving an equivalent implementation can break the tests. A source
validator is different when source is its actual input and fixtures verify its
findings; that distinction preserves useful tooling tests.

Several recipe editor cases combine good quantity/state assertions with many
source locks. Those should not be deleted wholesale. Keep the numerical and
state behavior, and replace claimed focus/typing guarantees with actual mounted
interaction when authorized. Likewise, counts are valuable for idempotency;
they are insufficient when the claim also includes copied content or ownership.

## Deliberate-fault evidence

The first five probes were executed during the preceding cleanup audit; the
last two were executed during this reassessment. Each used an isolated copy,
a passing baseline and restoration afterward. Application source in the working
checkout was not mutated.

| Deliberate defect | Cases run with defect | Result |
| --- | ---: | --- |
| Treat a draft invoice as billed | 20 | 7 failed: detected |
| Alert when stock equals the reorder threshold | 9 | 1 failed: detected |
| Give a pending retry a fresh operation key | 4 | 1 failed: detected |
| Ignore a confirmed pack-template receipt and write again | 10 | 1 failed: detected |
| Read quote end time as its start time | **799** | **All passed: missed by the full suite** |
| Reverse `row.dishId === input.dishId` in the prep loader | 4 | All passed: wrong template identity missed by the relevant file |
| Replace copied layout instructions with `undefined` | 10 | All passed: lost instructions missed by the relevant file |

The two new probes first passed unchanged baselines of 4 and 10 cases
respectively. Their surviving faults demonstrate weaknesses in those files;
they were not full-suite runs. These seven selected experiments do not establish
a representative mutation score. Raw local probe evidence remains under
`.artifacts/test-audit/` and `.artifacts/test-reassessment/`; the latter includes
`probe.py` and `new-mutations.json`. Full copyrighted transcripts remain local
research material and are not committed.

## Recommended next cleanup

1. Review the 123 POOR cases for removal or replacement. Remove duplicated
   existence/marker/positive-path checks; replace important workflow claims
   such as quote submission with a real interaction and payload assertion.
2. Repair the 93 MIXED cases selectively. The highest-value fixes are wrong-row
   selection, lost layout content, test-local account writes, and generic
   rejection assertions. Preserve existing useful assertions.
3. Keep the 583 GOOD cases. Consolidate setup where helpful without flattening
   distinct boundary conditions or discarding real transaction proofs.

The architectural gap is at **screen → command arguments → backend behavior**.
Tests on individual helpers cannot establish that the connections work. The
earlier broader coverage run reported 17.44% authored line coverage, while the
normal 100% coverage gate targets only four files. Those numbers describe
execution breadth in different scopes, not how much of the app works. Coverage
was not changed, and low coverage alone was not used to label tests bad.

The full repository gate passed after these documentation changes, with all
799 cases passing. That validates the checkout, not these quality judgments;
the inventory, examples and deliberate faults are the evidence for the audit.
