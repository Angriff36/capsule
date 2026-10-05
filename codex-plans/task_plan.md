# Task Plan: Field-level domain-term help

## Goal
Add reusable, accessible, plain-language help for each real editable batch multiplier, yield, par-level, and purchase-eligibility field, with worked-example links.

## Current Phase
Phase 1 - Requirements and discovery

## Phases

### Phase 1: Requirements and discovery
- [x] Read project and UI constraints.
- [x] Locate domain definitions and all authored entry surfaces.
- [x] Record findings.
- **Status:** complete

### Phase 2: Design and implementation
- [ ] Reuse or add the smallest appropriate shared UI pattern.
- [ ] Add a single source of help copy and a linked in-app example surface.
- [ ] Add help at every identified editable field.
- **Status:** in_progress

### Phase 3: Verification and handoff
- [ ] Run targeted static checks and required repository gate.
- [ ] Run a temporary Playwright verification and remove it.
- [ ] Inspect diff for independent review readiness.
- **Status:** pending

## Decisions Made
| Decision | Rationale |
|---|---|
| No backend, Manifest, or generated-file changes unless discovery proves required | The requested behavior is presentation-only. |
| Add an additive `help` slot to ActionPrompt fields | The Par-level edit dialog is an authored entry path and needs the same help affordance. |
| Explain purchase eligibility on the Demand Ledger Purchase heading | It is a computed, non-editable condition; a new control would be misleading. |

## Errors Encountered
| Error | Attempt | Resolution |
|---|---:|---|
| None | 0 | — |
| PowerShell interpolation failed in a targeted line viewer | 1 | Use `${path}` to delimit the variable before a colon. |
