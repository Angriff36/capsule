# Task Plan: Tax Rate Configuration

## Goal
Implement named tax rates with percentage and food/service/rental applicability, automatic invoice-line tax calculation, and remittance totals in the authored Manifest/UI seams, then verify the real user flow with a temporary Playwright test and the repository gate.

## Current Phase
Complete

## Phases

### Phase 1: Requirements & Discovery
- [x] Capture feature requirements and repository constraints
- [x] Trace current invoice domain, generated bindings, UI routes, and live test state
- [x] Record findings in `findings.md`
- **Status:** complete

### Phase 2: Implementation Plan
- [x] Choose the smallest source-first domain and UI design that matches existing patterns
- [x] Identify generated outputs that must be produced only through `bun run manifest:regen`
- [x] Define focused verification
- **Status:** complete

### Phase 3: Implementation
- [x] Add authored Manifest capabilities
- [x] Regenerate through Builder only if needed
- [x] Add or update authored finance UI and route/navigation seams
- [x] Preserve all unrelated dirty work
- **Status:** complete

### Phase 4: Verification
- [x] Run focused existing tests/checks
- [x] Create and run a temporary Playwright verification test
- [x] Delete the temporary Playwright test after verification
- [x] Run `bun run check` (blocked by documented unrelated checkout failures)
- **Status:** complete with repository-level blockers

### Phase 5: Delivery
- [x] Inspect final diff against the pinned baseline
- [x] Update progress/fixes logs
- [x] Provide the exact required `<summary>` block as the final output
- **Status:** complete

## Key Questions
1. What tax-related fields/entities already exist in the invoice Manifest and generated client?
2. What authored finance UI pattern should expose configuration and remittance totals with minimal user tedium?
3. Can the live local app be exercised without authentication or destructive production data?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Use source-first Manifest changes and `bun run manifest:regen` only | Generated domain and wiring files are ownership-controlled. |
| Keep all task planning under `codex-plans/tax-rate-configuration/` | Existing root planning files belong to other concurrent feature work. |
| Model `TaxRate` as a governed entity with name, percentage, three applicability flags, and active state | Directly represents the requested configuration while reusing finance authorization. |
| Store calculated line items and named tax allocations as JSON snapshots on Invoice | Keeps invoice creation atomic and preserves exactly what was charged for later remittance reporting. |
| Calculate matching tax in an authored pure helper and expose no manual tax/total fields | Reduces user tedium and guarantees the UI derives consistent totals from current active rates. |
| Report both assessed and proportionally collected tax by named rate | Makes partial-payment remittance visible without claiming all invoiced tax was collected. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Memory registry search returned no matches (exit 1) | 1 | Treat as no relevant memory hit and continue with live checkout evidence. |
| Combined `rg` discovery command exited 1 with no surfaced output | 2 | Stop repeating the compound command; split discovery into independent commands and replace fragile patterns with `Select-String`. |
| `Select-String` treated `return (` as a regular expression and rejected it | 1 | Use `-SimpleMatch` for literal source tokens. |
| Manifest compile rejected a constraint reference to computed `TaxRate.appliesToAny` | 1 | Inline the three applicability booleans in the entity constraint; computed properties are unavailable during constraint evaluation. |
| Windows rejected the literal `playwright.config.*` path in a discovery command | 1 | Avoid shell globs in literal Windows paths and use explicit file enumeration when needed. |
| A pre-existing staff-certification temporary spec disappeared before inspection | 1 | Treat it as concurrent cleanup outside this task and create an isolated tax verification harness instead. |
| Targeted Prettier check found `taxWorkspace.css` changed after its earlier format pass | 1 | Re-run targeted Prettier on the CSS file, then repeat the exact check. |
| `bun run check` stopped at unrelated Event Manifest API-path violations | 1 | Preserve the unrelated files, verify the remaining relevant gates separately, and follow the required GitHub blocker escalation workflow. |
| Repository-wide format check found 187 unrelated AboardAI, Playwright, ledger, and nav files | 1 | Do not rewrite other owners' files; retain the passing targeted Prettier check for every authored tax file. |
| Full tests exposed two feature snapshot expectations plus unrelated Event/nav/runtime failures | 1 | Fix the finance route shape without editing tests; evaluate the governed-configuration design against the no-permanent-test rule before changing the model. |
| Targeted Prettier check included three `.manifest` files that have no configured parser | 1 | Re-run the targeted formatting check on the authored TypeScript and CSS files only; Manifest formatting is verified by compilation/regeneration. |

## Constraints
- Do not add permanent tests; the user authorized only a temporary Playwright verification test, which must be deleted.
- Do not hand-edit generated files.
- Do not commit, push, deploy, merge, or change global config.
- Stop if active concurrent rewriting of overlapping files is detected.
