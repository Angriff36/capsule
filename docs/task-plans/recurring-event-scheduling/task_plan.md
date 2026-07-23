# Task Plan: Recurring Event Scheduling

## Goal

Allow operators to configure weekly, monthly, or annual Event recurrence with a bounded end condition, then automatically prepare future Event instances as Drafts for review.

## Completed phases

- Discovery: traced Event Manifest source, generated hooks, creation semantics, and Convex scheduling limits.
- Design: chose source-Event recurrence state, deterministic calendar anchoring, a 90-day Draft horizon, series tokens, and source/sequence lineage.
- Implementation: added Manifest commands/fields/events, an internal scheduler bridge, dossier UI, generated artifacts, and system documentation.
- Verification: regenerated conflict-free, generated Convex bindings, passed typecheck/build/secrets/focused contracts, and passed then deleted a temporary Playwright test.

## Completion status

The feature is implemented and focused verification is green. The required repository gate was run but remains blocked by unrelated shared-checkout failures tracked in issues #32, #40, #56, #61, #62, and #65.

