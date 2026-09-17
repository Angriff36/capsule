# Approved test cleanup — September 9, 2026

Applied the [deletion-first recommendation](test-deletion-review-2026-09-08.md): **46 cases deleted, four consolidated into existing cases, and 53 retained for their actual behavioral protection.** The suite now has **726 passing cases in 169 files**, down from 776 in 173 files. No new standalone cases were added.

The four consolidations preserve the no-host-demand assertion in the MCP workflow, numeric-input shortcut suppression, case/whitespace-tolerant venue selection, and Enter keeping the stock transfer editor open.

Retained tests shed source-code string checks, constant-setting assertions, circular mapping expectations and fake persistence logic. Unused setup and the two Event source-scanner helper classes were removed. Titles now distinguish helper decisions from database persistence and actual UI interaction.

Several existing cases now provide stronger evidence:

- Prep reconciliation checks the selected template, task and demand IDs against competing records.
- Layout materialization checks stored event IDs, section types, instructions and order across retries.
- Account linking tests invoke the real selection function without a test-local routine pretending to persist its result.
- Access-denial tests check relevant errors and unchanged records; the foreign-vendor case also demonstrates that the same payload works in the vendor's own tenant.
- The public acceptance test clicks the real button, checks its command payload and observes the accepted state.
- The XLSX formula fixture deliberately gives the cache a value different from the formula's result, proving which value the reader uses.

## Verification

`bun run check` passed: ownership/integration checks, typechecking, formatting, secret scan, **726 tests**, the existing coverage thresholds, production frontend build and baseline checks. No thresholds were lowered, tests skipped, or application policies changed.

Five independent deliberate faults were then assessed against the cleaned tests in an isolated copy. Each was detected:

| Fault | Result |
| --- | --- |
| Count invoice credits as collected cash | Finance report test fails |
| Duplicate pack-template items on retry | Pack retry test fails |
| Format a recipe quantity as `0.200.2` | Quantity test fails |
| Drop copied layout instructions | Strengthened layout test fails |
| Load another event's prep tasks | Strengthened loader test fails |

The last two faults passed the old tests before this cleanup. These selected probes demonstrate specific regression detection, not a suite-wide mutation score. All injected faults were restored; application source is unchanged.

Local evidence: `.artifacts/test-final-audit/applied-check.log`, `kept-mutation-results.json`, and the accompanying focused-run logs. The earlier CSV audits retain their original names and line numbers as historical records of the decisions. All changes remain local and uncommitted.
