# Task Plan: Lead pipeline CRM

## Goal

Introduce a prospective-client Lead upstream of Contact and Proposal, with a practical sales pipeline that tracks source, estimated value, stage, and probability before a proposal exists.

## Current Phase

Complete

## Phases

### Phase 1: Repository and domain discovery

- [x] Trace current Contact, Client, Proposal, routes, hooks, and UI patterns.
- [x] Identify concurrent edits and exact files safe to change.
- [x] Read domain-gating restraint before changing Manifest policy.
- **Status:** complete

### Phase 2: Implementation plan

- [x] Define the smallest authored Manifest and UI slice.
- [x] Confirm generated changes flow only through `bun run manifest:regen`.
- [x] Define core Playwright pass criteria.
- **Status:** complete

### Phase 3: Implementation

- [x] Add the Lead domain source and connect it upstream of Contact/Proposal.
- [x] Add the pipeline UI and route/navigation entry using existing patterns.
- [x] Regenerate through Builder only if the shared tree is safe.
- **Status:** complete

### Phase 4: Verification

- [x] Run focused type/domain checks.
- [x] Create, run, and delete a temporary Playwright test.
- [x] Run `bun run check` and record any proven unrelated blockers.
- **Status:** complete — feature checks pass; full gate stops on open Event issues #56/#58/#60

### Phase 5: Delivery

- [x] Review the exact feature diff and preserve unrelated work.
- [x] Archive the completed plan in `docs/task-plans/2026-07-22-lead-pipeline-crm.md`.
- [x] Prepare the required tagged summary as the final content.
- **Status:** complete

## Constraints and Decisions

| Constraint | Application |
| --- | --- |
| Shared, heavily dirty checkout | Treat all pre-existing changes as user-owned; stop if another session edits the same files. |
| Generated ownership | Do not hand-edit Builder/Manifest/Convex generated paths. |
| Tests | Add no permanent tests; the explicitly requested Playwright spec is temporary and must be deleted. |
| Domain gating | Read the restraint guide before adding constraints or policies; gate only real harm. |
| Browser verification | Use the documented URL `http://localhost:7811`; do not start or restart servers unless explicitly instructed. |
| Lead identity | Capture company/person identity and contact facts needed for later client/contact creation without requiring a formal account. |
| Pipeline movement | Allow reversible stage changes with validated value/probability; no needless approval or one-way stage guards. |
| Downstream connection | Keep optional Client, ClientContact, and Proposal refs on Lead; do not edit the busy downstream Manifest sources. |
| Conversion UX | Client/contact and proposal creation remain explicit button actions; no automatic formal records. |
| UI files | Add `LeadPipelinePage.tsx` plus a colocated CSS file; make only narrow route/root-import additions to shared files. |

## Playwright Pass Criteria

1. Open `/clients/pipeline` and see all four requested stages and summary metrics.
2. Capture a lead with source, estimated value, default `new` stage, and probability.
3. Move the lead to `qualified`, change value/probability, and see weighted totals update.
4. Explicitly convert the lead to a client/contact, then explicitly draft a proposal.
5. See the lead in `proposal-sent` with downstream account/proposal state reflected.
6. Delete the temporary verification spec and any disposable harness artifacts.

## Errors Encountered

| Error | Attempt | Resolution |
| --- | --- | --- |
| Initial combined status/planning read was too broad and truncated | 1 | Isolate this feature under `codex-plans/lead-pipeline-crm/` and use bounded searches. |
| PowerShell rejected a direct `foreach` output pipe in the stability check | 1 | Collect rows into an array before `Format-Table`; rerun only the failed bounded checks. |
| A second metadata command accidentally reused the invalid direct `foreach` pipe shape | 2 | Stop composing the loop inline; assign `$rows = foreach (...)` before any output pipeline. |
| Prettier cannot infer a parser for `.manifest` files | 1 | Preserve the source formatting accepted by Builder; rerun targeted Prettier only on TSX/CSS files. |
| Documented app URL `http://localhost:7811` refused connections | 1 | Do not start a server under the computer-use rules; use a disposable serverless Vite build with Playwright request interception and mocked generated boundaries. |
| First serverless Playwright run rendered no pipeline headings | 1 | Bundle evidence showed the regex alias missed the raw relative import and loaded real Convex; alias the exact import specifier and rebuild. |
| Second Playwright run could not find the exact Probability label | 1 | The visible `%` suffix became part of the accessible name; add an explicit input `aria-label` and rebuild. |
| Third Playwright run found three legitimate `$12,000` values, not two | 1 | Scope assertions to the lead card and pipeline summary instead of counting repeated responsive UI values. |
| Recursive cleanup command was blocked by the shell policy | 1 | Delete each verified temporary file through `apply_patch`; preserve the unrelated result directory. |
| Full `bun run check` stops at unrelated Event integration guards | 1 | Preserve the listed Event files, verify whether the mandated GitHub blocker already exists, and run all lead-relevant downstream gates separately. |
| PowerShell passed a Windows wildcard path directly to `rg` | 1 | Search the explicit assets directory with `-g '*.js'` instead. |
